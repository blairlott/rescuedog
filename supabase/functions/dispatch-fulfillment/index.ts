// Routes a dropship_orders row to the correct vendor based on partner.vendor_type:
//  - vinoshipper_warehouse → no-op (warehouse picks via VS native flow)
//  - printify / printful / gooten → POST order to vendor (simulated until API key)
//  - partner_direct → email PO via Resend
//
// Idempotent: skips orders already dispatched. Logs every step to dropship_events.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: authErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Role gate — only owners/admins/dropship managers can dispatch vendor orders.
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", claims.claims.sub as string)
      .in("role", ["owner", "admin", "dropship_manager"])
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: order, error: oErr } = await admin.from("dropship_orders").select("*").eq("id", order_id).single();
    if (oErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (order.fulfillment_status_detail === "dispatched" || order.fulfillment_status_detail === "shipped") {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already dispatched" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: partner } = await admin.from("dropship_partners").select("*").eq("id", order.partner_id).single();
    const { data: items } = await admin.from("dropship_order_items").select("*").eq("order_id", order_id);
    if (!partner) {
      return new Response(JSON.stringify({ error: "Partner not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let dispatched_via: string;
    let vendor_order_id: string | null = null;
    let simulated = false;
    let notes = "";

    switch (partner.vendor_type) {
      case "vinoshipper_warehouse": {
        dispatched_via = "vinoshipper_warehouse";
        notes = "No external dispatch — Vinoshipper warehouse fulfills natively.";
        break;
      }
      case "printify":
      case "printful":
      case "gooten": {
        // Validate every item has a partner_sku/vendor_variant_id before contacting vendor.
        const unmapped = (items || []).filter((it: any) => !(it.partner_sku || it.sku));
        if (!items || items.length === 0 || unmapped.length > 0) {
          await admin.from("dropship_orders")
            .update({ status: "exception", fulfillment_status_detail: "blocked_no_mapping" })
            .eq("id", order_id);
          await admin.from("dropship_events").insert({
            event_type: "dispatch_blocked",
            order_id,
            partner_id: partner.id,
            message: `Blocked ${partner.vendor_type} dispatch — ${unmapped.length || "all"} item(s) missing vendor mapping.`,
            payload: { unmapped_count: unmapped.length, total_items: items?.length || 0 },
          });
          return new Response(
            JSON.stringify({ error: "dropship_mapping_missing", blocked: true, unmapped_count: unmapped.length }),
            { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const apiKey = Deno.env.get(`${partner.vendor_type.toUpperCase()}_API_KEY`);
        simulated = partner.simulation_mode || !apiKey;
        dispatched_via = partner.vendor_type;
        if (simulated) {
          vendor_order_id = `${partner.vendor_type}_sim_${Date.now()}`;
          notes = `Simulated ${partner.vendor_type} dispatch (no API key configured yet).`;
        } else {
          // Live mode (post May 18)
          const shopId = (partner.vendor_credentials as any)?.shop_id;
          const res = await fetch(`https://api.${partner.vendor_type}.com/v1/shops/${shopId}/orders.json`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              external_id: order.id,
              line_items: items?.map((it: any) => ({ sku: it.partner_sku || it.sku, quantity: it.quantity })) || [],
              address_to: order.shipping_address,
            }),
          });
          if (!res.ok) {
            await admin.from("dropship_events").insert({
              event_type: "dispatch_failed",
              order_id,
              partner_id: partner.id,
              message: `${partner.vendor_type} dispatch failed: ${res.status}`,
              payload: { status: res.status, body: await res.text() },
            });
            await admin.from("dropship_orders").update({ fulfillment_status_detail: "failed" }).eq("id", order_id);
            return new Response(JSON.stringify({ error: "vendor dispatch failed" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const data = await res.json();
          vendor_order_id = String(data.id);
          notes = `Live ${partner.vendor_type} dispatch ok.`;
        }
        break;
      }
      case "partner_direct":
      default: {
        dispatched_via = "partner_direct_email";
        if (partner.contact_email) {
          const addr = order.shipping_address as any;
          const orderShortId = order.id.slice(0, 8);
          const { error: emailErr } = await admin.functions.invoke('send-transactional-email', {
            body: {
              templateName: 'dropship-partner-po',
              recipientEmail: partner.contact_email,
              idempotencyKey: `dropship-po-${order.id}`,
              templateData: {
                orderShortId,
                customerName: order.customer_name,
                street: addr?.street || '',
                city: addr?.city || '',
                state: addr?.state || '',
                zip: addr?.zip || '',
                items: (items || []).map((it: any) => ({
                  quantity: it.quantity,
                  product_title: it.product_title,
                  partner_sku: it.partner_sku,
                  sku: it.sku,
                })),
              },
            },
          });
          if (emailErr) {
            simulated = true;
            notes = `PO email send failed; recorded as queued.`;
          } else {
            vendor_order_id = `po_${orderShortId}`;
            notes = "PO emailed to partner.";
          }
        } else {
          simulated = true;
          notes = "Simulated partner-direct dispatch (no partner email).";
        }
        break;
      }
    }

    await admin.from("dropship_orders")
      .update({
        fulfillment_status_detail: dispatched_via === "vinoshipper_warehouse" ? "queued" : "dispatched",
        vendor_order_id,
        simulated,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", order_id);

    await admin.from("dropship_events").insert({
      event_type: simulated ? "dispatch_simulated" : "dispatch_live",
      order_id,
      partner_id: partner.id,
      message: `[${dispatched_via}] ${notes}`,
      payload: { vendor_order_id, simulated, item_count: items?.length || 0 },
    });

    return new Response(JSON.stringify({ ok: true, simulated, dispatched_via, vendor_order_id, notes }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("dispatch-fulfillment error", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});