// vs-dropship-bridge
//
// Receives Vinoshipper ORDER webhook events (APPROVED / TRACKING_NUMBER /
// CANCELLED), fetches the full order via VS REST, splits line items by
// fulfillment routing, and forks non-wine items to the appropriate dropship
// partner. Wine + VS-warehouse merch are left alone (VS ships them).
//
// Behavior:
//  - Builds a routing plan from `dropship_skus` (vinoshipper_product_id → partner + vendor_variant_id).
//  - Groups forked lines by partner_id and creates one `dropship_orders` row per partner (idempotent
//    on (vinoshipper_order_id, partner_id)).
//  - For Printful partners: invokes `printful-dispatch` which posts the order to Printful's
//    API-platform store using each line's `vendor_variant_id` (sync_variant_id).
//  - For other partners: writes the order + items only and leaves dispatch to ops / dispatch-fulfillment.
// See mem/specs/v3-vs-dropship-bridge-spec.md.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { vsFetch, type VsWebhookPayload } from "../_shared/vinoshipper.ts";

const WebhookSchema = z.object({
  identifier: z.union([z.string(), z.number()]),
  subject: z.enum(["ORDER", "CUSTOMER", "CLUB_MEMBERSHIP"]),
  event: z.string(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const parsed = WebhookSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = parsed.data as VsWebhookPayload;

  // Only ORDER events drive fulfillment forking.
  if (payload.subject !== "ORDER") {
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let plan: unknown = null;
  const dispatched: Array<Record<string, unknown>> = [];
  try {
    // Fetch the full order from VS so we can see line items.
    const order = await vsFetch<VsOrder>(`/orders/${payload.identifier}`);

    const lines = order.lineItems ?? [];
    const skuIds = lines.map((l) => String(l.productId));

    // Look up dropship_skus that match the VS product IDs on this order.
    const { data: dropshipMatches } = await supabase
      .from("dropship_skus")
      .select("id,partner_id,sku,product_title,vinoshipper_product_id,fulfillment_mode,partner_sku,vendor_variant_id,cost_cents,retail_cents")
      .in("vinoshipper_product_id", skuIds);

    const byVsId = new Map(
      (dropshipMatches ?? []).map((r) => [String(r.vinoshipper_product_id), r]),
    );

    const planRows = lines.map((l) => {
      const match = byVsId.get(String(l.productId));
      if (!match) return { line: l, action: "leave_to_vs" as const, reason: "no_dropship_row" };
      if (match.fulfillment_mode === "vinoshipper_warehouse") {
        return { line: l, action: "leave_to_vs" as const, reason: "vs_warehouse" };
      }
      return { line: l, action: "fork_to_partner" as const, match };
    });
    plan = planRows.map((p) =>
      p.action === "leave_to_vs"
        ? { vsProductId: p.line.productId, action: p.action, reason: p.reason }
        : {
            vsProductId: p.line.productId,
            action: p.action,
            partnerId: p.match.partner_id,
            mode: p.match.fulfillment_mode,
            partnerSku: p.match.partner_sku ?? p.match.vendor_variant_id,
            qty: p.line.quantity,
          },
    );

    console.log("[vs-dropship-bridge] plan", { vsOrderId: payload.identifier, event: payload.event, plan });

    // Only act on APPROVED-style events. Tracking/cancel handled elsewhere.
    const eventUpper = String(payload.event).toUpperCase();
    const isApprove = eventUpper === "APPROVED" || eventUpper === "PAID" || eventUpper === "CREATED";
    if (!isApprove) {
      return new Response(JSON.stringify({ ok: true, ignored: true, reason: `event=${payload.event}`, plan }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group fork rows by partner_id.
    const byPartner = new Map<string, typeof planRows>();
    for (const row of planRows) {
      if (row.action !== "fork_to_partner") continue;
      const pid = row.match.partner_id;
      if (!byPartner.has(pid)) byPartner.set(pid, []);
      byPartner.get(pid)!.push(row);
    }

    const shipping = buildRecipient(order);
    const customerName = shipping.name;
    const customerEmail = shipping.email ?? null;

    // Load partner vendor_types in one query.
    const partnerIds = [...byPartner.keys()];
    const { data: partners } = partnerIds.length
      ? await supabase.from("dropship_partners").select("id,vendor_type,simulation_mode").in("id", partnerIds)
      : { data: [] as Array<{ id: string; vendor_type: string; simulation_mode: boolean }> };
    const partnerById = new Map((partners ?? []).map((p) => [p.id, p]));

    for (const [partnerId, rows] of byPartner) {
      const partner = partnerById.get(partnerId);
      if (!partner) {
        dispatched.push({ partnerId, skipped: true, reason: "partner_row_missing" });
        continue;
      }

      // Idempotency: skip if we already have an order for (vs_order_id, partner_id).
      const { data: existing } = await supabase
        .from("dropship_orders")
        .select("id,partner_order_id,fulfillment_status_detail")
        .eq("vinoshipper_order_id", String(order.id))
        .eq("partner_id", partnerId)
        .maybeSingle();
      if (existing) {
        dispatched.push({ partnerId, skipped: true, reason: "already_exists", orderId: existing.id });
        continue;
      }

      const subtotalCents = rows.reduce(
        (s, r) => s + (r.match.retail_cents ?? 0) * (r.line.quantity ?? 1),
        0,
      );
      const costCents = rows.reduce(
        (s, r) => s + (r.match.cost_cents ?? 0) * (r.line.quantity ?? 1),
        0,
      );

      // Printful path: defer the insert + actual API call to printful-dispatch
      // so we don't double-insert dropship_orders rows.
      if (partner.vendor_type === "printful") {
        const items = rows
          .map((r) => ({
            sku: r.match.sku,
            variant_id: r.match.vendor_variant_id ?? undefined,
            variant_id_type: "sync" as const,
            name: r.match.product_title ?? r.line.sku ?? r.match.sku,
            quantity: r.line.quantity ?? 1,
          }))
          .filter((it) => it.variant_id);

        if (items.length === 0) {
          // Block dispatch — record an exception order so ops sees it instead of silent skip.
          await supabase.from("dropship_orders").insert({
            partner_id: partnerId,
            vinoshipper_order_id: String(order.id),
            status: "exception",
            fulfillment_status_detail: "blocked_no_mapping",
            simulated: partner.simulation_mode ?? false,
            customer_name: customerName,
            customer_email: customerEmail,
            shipping_address: shipping as unknown as Record<string, unknown>,
            subtotal_cents: subtotalCents,
            cost_cents: costCents,
          });
          dispatched.push({
            partnerId,
            vendor: "printful",
            ok: false,
            blocked: true,
            reason: "no_vendor_variant_ids",
            vs_product_ids: rows.map((r) => r.line.productId),
          });
          continue;
        }

        const { data: pf, error: pfErr } = await supabase.functions.invoke("printful-dispatch", {
          body: {
            vs_order_id: order.id,
            external_id: `vs_${order.id}_${partnerId.slice(0, 8)}`,
            recipient: shipping,
            items,
          },
        });
        if (pfErr) {
          dispatched.push({ partnerId, vendor: "printful", ok: false, error: String(pfErr.message ?? pfErr) });
        } else {
          dispatched.push({ partnerId, vendor: "printful", ok: true, result: pf });
        }
        continue;
      }

      // Non-printful partners: write order + items, leave actual dispatch to ops/dispatch-fulfillment.
      const { data: created, error: insErr } = await supabase
        .from("dropship_orders")
        .insert({
          partner_id: partnerId,
          vinoshipper_order_id: String(order.id),
          status: "new",
          fulfillment_status_detail: "queued",
          simulated: partner.simulation_mode ?? false,
          customer_name: customerName,
          customer_email: customerEmail,
          shipping_address: shipping as unknown as Record<string, unknown>,
          subtotal_cents: subtotalCents,
          cost_cents: costCents,
        })
        .select("id")
        .single();

      if (insErr || !created) {
        dispatched.push({ partnerId, vendor: partner.vendor_type, ok: false, error: insErr?.message ?? "insert_failed" });
        continue;
      }

      const itemRows = rows.map((r) => ({
        order_id: created.id,
        sku: r.match.sku,
        partner_sku: r.match.partner_sku ?? r.match.vendor_variant_id ?? null,
        product_title: r.match.product_title ?? r.line.sku ?? r.match.sku,
        quantity: r.line.quantity ?? 1,
        unit_cost_cents: r.match.cost_cents ?? 0,
        unit_retail_cents: r.match.retail_cents ?? 0,
      }));
      await supabase.from("dropship_order_items").insert(itemRows);
      dispatched.push({ partnerId, vendor: partner.vendor_type, ok: true, orderId: created.id, queued: true });
    }
  } catch (err) {
    console.error("[vs-dropship-bridge] error", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ ok: true, plan, dispatched }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

type VsOrder = {
  id: string | number;
  lineItems?: Array<{ productId: string | number; sku?: string; quantity: number }>;
  shippingAddress?: Record<string, unknown> | null;
  customer?: Record<string, unknown> | null;
  email?: string | null;
};

function pick(obj: Record<string, unknown> | null | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function buildRecipient(order: VsOrder) {
  const a = order.shippingAddress ?? {};
  const c = order.customer ?? {};
  const first = pick(a, ["firstName", "first_name"]) ?? pick(c, ["firstName", "first_name"]) ?? "";
  const last = pick(a, ["lastName", "last_name"]) ?? pick(c, ["lastName", "last_name"]) ?? "";
  const name = pick(a, ["name", "fullName"]) ?? (`${first} ${last}`.trim() || "Customer");
  return {
    name,
    address1: pick(a, ["street1", "address1", "street", "line1"]) ?? "",
    address2: pick(a, ["street2", "address2", "line2"]) ?? null,
    city: pick(a, ["city"]) ?? "",
    state_code: pick(a, ["state", "stateCode", "state_code", "region"]) ?? "",
    country_code: pick(a, ["country", "countryCode", "country_code"]) ?? "US",
    zip: pick(a, ["zipCode", "zip", "postalCode", "postal_code"]) ?? "",
    email: pick(c, ["email", "emailAddress"]) ?? order.email ?? undefined,
    phone: pick(a, ["phone"]) ?? pick(c, ["phone"]) ?? undefined,
  };
}