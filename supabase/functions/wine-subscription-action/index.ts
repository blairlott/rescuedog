import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { vsFindCustomerByEmail, vsLiveMode } from "../_shared/vinoshipper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "create" | "update" | "skip" | "cancel";

interface Body {
  action: Action;
  subscription_id?: string;
  sku?: string;
  vs_product_id?: string;
  product_handle?: string;
  product_title?: string;
  product_image_url?: string;
  quantity?: number;
  cadence?: "monthly" | "quarterly" | "biannual";
  unit_price_cents?: number;
  discount_percent?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as Body;
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let vinoshipperError: string | null = null;

    switch (body.action) {
      case "create": {
        if (!body.sku || !body.product_title) return json({ error: "sku and product_title required" }, 400);

        // Resolve the Vinoshipper customer for this user (best-effort).
        // Recurring charges fire against this customer's saved card.
        let vsCustomerId: string | null = null;
        if (vsLiveMode() && user.email) {
          try {
            const c = await vsFindCustomerByEmail(user.email);
            vsCustomerId = c?.id != null ? String(c.id) : null;
            if (!vsCustomerId) {
              vinoshipperError = "No Vinoshipper customer found — complete one checkout first to save your card";
            }
          } catch (e) {
            vinoshipperError = `Vinoshipper lookup failed: ${e instanceof Error ? e.message : String(e)}`;
          }
        }

        const { data, error } = await serviceClient
          .from("wine_subscriptions")
          .insert({
            user_id: user.id,
            sku: body.sku,
            vs_product_id: body.vs_product_id ?? body.sku,
            vs_customer_id: vsCustomerId,
            product_handle: body.product_handle,
            product_title: body.product_title,
            product_image_url: body.product_image_url,
            quantity: body.quantity ?? 1,
            cadence: body.cadence ?? "monthly",
            unit_price_cents: body.unit_price_cents ?? 0,
            discount_percent: body.discount_percent ?? 10,
            status: "active",
            next_ship_date: new Date(Date.now() + cadenceMs(body.cadence ?? "monthly")).toISOString().slice(0, 10),
          })
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, subscription: data, vinoshipper_error: vinoshipperError });
      }
      case "update": {
        if (!body.subscription_id) return json({ error: "subscription_id required" }, 400);
        const patch: Record<string, unknown> = {};
        if (body.quantity !== undefined) patch.quantity = body.quantity;
        if (body.cadence) patch.cadence = body.cadence;
        const { data, error } = await serviceClient
          .from("wine_subscriptions")
          .update(patch)
          .eq("id", body.subscription_id)
          .eq("user_id", user.id)
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, subscription: data, vinoshipper_error: vinoshipperError });
      }
      case "skip": {
        if (!body.subscription_id) return json({ error: "subscription_id required" }, 400);
        // Push next_ship_date forward by one cadence
        const { data: sub } = await serviceClient
          .from("wine_subscriptions")
          .select("next_ship_date, cadence")
          .eq("id", body.subscription_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!sub) return json({ error: "Not found" }, 404);
        const months = sub.cadence === "quarterly" ? 3 : sub.cadence === "biannual" ? 6 : 1;
        const base = sub.next_ship_date ? new Date(sub.next_ship_date) : new Date();
        base.setMonth(base.getMonth() + months);
        const { error } = await serviceClient
          .from("wine_subscriptions")
          .update({ next_ship_date: base.toISOString().slice(0, 10) })
          .eq("id", body.subscription_id)
          .eq("user_id", user.id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, vinoshipper_error: vinoshipperError });
      }
      case "cancel": {
        if (!body.subscription_id) return json({ error: "subscription_id required" }, 400);
        const { error } = await serviceClient
          .from("wine_subscriptions")
          .update({ status: "cancelled" })
          .eq("id", body.subscription_id)
          .eq("user_id", user.id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, vinoshipper_error: vinoshipperError });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cadenceMs(cadence: string): number {
  const days = cadence === "quarterly" ? 90 : cadence === "biannual" ? 180 : 30;
  return days * 24 * 60 * 60 * 1000;
}