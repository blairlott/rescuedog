/**
 * Recurring-charge processor for Subscribe & Save.
 *
 * Triggered by:
 *   - pg_cron daily (process all due active subscriptions)
 *   - manual POST { subscription_id } from /account "Charge now" (internal users)
 *
 * For each due subscription:
 *   1. Verify status=active and vs_customer_id is set
 *   2. POST /orders to Vinoshipper with { customerId, lineItems:[{productId,quantity}] }
 *      → VS charges the saved card, applies compliance, ships.
 *   3. On success: roll next_ship_date forward by cadence, reset failure_count.
 *   4. On failure: bump failure_count, store last_error. After 3 failures, pause
 *      the subscription so we stop hammering a declined card.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { vsCreateOrder, VinoshipperError, vsLiveMode } from "../_shared/vinoshipper.ts";
import { isInternalEmail } from "../_shared/internalUsers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_FAILURES = 3;

interface Sub {
  id: string;
  user_id: string;
  sku: string;
  vs_product_id: string | null;
  vs_customer_id: string | null;
  quantity: number;
  cadence: string;
  unit_price_cents: number;
  discount_percent: number;
  product_title: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Distinguish manual single-sub vs cron batch.
  let body: { subscription_id?: string; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body = cron batch */ }

  let triggeredBy = "cron";
  let onlyId: string | null = null;

  // Manual mode requires auth + must be the owner or an internal/admin user.
  if (body.subscription_id) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    if (!isInternalEmail(user.email)) {
      return json({ error: "Manual processing restricted to internal accounts" }, 403);
    }
    triggeredBy = `manual:${user.email}`;
    onlyId = body.subscription_id;
  }

  // Pick due subs.
  const query = serviceClient
    .from("wine_subscriptions")
    .select("id,user_id,sku,vs_product_id,vs_customer_id,quantity,cadence,unit_price_cents,discount_percent,product_title")
    .eq("status", "active");
  const { data: due, error } = onlyId
    ? await query.eq("id", onlyId)
    : await query.lte("next_ship_date", new Date().toISOString().slice(0, 10));

  if (error) return json({ error: error.message }, 500);
  if (!due || due.length === 0) return json({ ok: true, processed: 0 });

  const live = vsLiveMode();
  const results: any[] = [];

  for (const sub of due as Sub[]) {
    const result = await processOne(serviceClient, sub, live, body.dry_run === true, triggeredBy);
    results.push(result);
  }

  return json({ ok: true, processed: results.length, results });
});

async function processOne(supabase: any, sub: Sub, live: boolean, dryRun: boolean, triggeredBy: string) {
  const productId = sub.vs_product_id || sub.sku;

  // Preflight checks
  if (!sub.vs_customer_id) {
    return await recordFailure(supabase, sub, "no_vs_customer_id", "Customer has no saved card on Vinoshipper — first checkout required.", triggeredBy);
  }
  if (!productId) {
    return await recordFailure(supabase, sub, "no_product_id", "Subscription missing Vinoshipper product id.", triggeredBy);
  }

  const request_payload = {
    customerId: sub.vs_customer_id,
    orderNumber: `sub_${sub.id}_${Date.now()}`,
    lineItems: [{ productId, quantity: sub.quantity }],
  };

  if (dryRun || !live) {
    await supabase.from("wine_subscription_charges").insert({
      subscription_id: sub.id, user_id: sub.user_id,
      vs_customer_id: sub.vs_customer_id, vs_product_id: productId,
      quantity: sub.quantity,
      amount_cents: discountedPriceCents(sub),
      success: true,
      error: dryRun ? "dry_run" : "simulation_mode",
      request_payload, response_payload: { simulated: true },
      triggered_by: triggeredBy,
    });
    // In sim mode, still roll the date so we can test cadence math.
    if (!dryRun) await rollForward(supabase, sub);
    return { id: sub.id, ok: true, simulated: true };
  }

  try {
    const response = await vsCreateOrder(request_payload) as any;
    const orderId = response?.id ?? response?.orderId ?? null;

    await supabase.from("wine_subscription_charges").insert({
      subscription_id: sub.id, user_id: sub.user_id,
      vs_order_id: orderId ? String(orderId) : null,
      vs_customer_id: sub.vs_customer_id, vs_product_id: productId,
      quantity: sub.quantity,
      amount_cents: discountedPriceCents(sub),
      success: true,
      request_payload, response_payload: response,
      triggered_by: triggeredBy,
    });

    await supabase.from("wine_subscriptions").update({
      last_order_id: orderId ? String(orderId) : null,
      last_charged_at: new Date().toISOString(),
      failure_count: 0,
      last_error: null,
      next_ship_date: nextShipDate(sub.cadence),
      updated_at: new Date().toISOString(),
    }).eq("id", sub.id);

    return { id: sub.id, ok: true, order_id: orderId };
  } catch (e) {
    const status = e instanceof VinoshipperError ? e.status : 0;
    const details = e instanceof VinoshipperError ? e.details : null;
    const msg = e instanceof Error ? e.message : String(e);
    return await recordFailure(supabase, sub, `vs_${status || "error"}`, msg, triggeredBy, request_payload, details);
  }
}

async function recordFailure(supabase: any, sub: Sub, code: string, message: string, triggeredBy: string, request_payload?: any, response_payload?: any) {
  const failureCount = await bumpFailure(supabase, sub.id, message);
  await supabase.from("wine_subscription_charges").insert({
    subscription_id: sub.id, user_id: sub.user_id,
    vs_customer_id: sub.vs_customer_id, vs_product_id: sub.vs_product_id,
    quantity: sub.quantity,
    amount_cents: discountedPriceCents(sub),
    success: false,
    error: `${code}: ${message}`,
    request_payload: request_payload ?? null,
    response_payload: response_payload ?? null,
    triggered_by: triggeredBy,
  });

  if (failureCount >= MAX_FAILURES) {
    await supabase.from("wine_subscriptions").update({
      status: "paused",
      paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", sub.id);
    return { id: sub.id, ok: false, error: code, paused: true };
  }
  return { id: sub.id, ok: false, error: code, failure_count: failureCount };
}

async function bumpFailure(supabase: any, id: string, msg: string): Promise<number> {
  const { data } = await supabase.from("wine_subscriptions").select("failure_count").eq("id", id).single();
  const next = (data?.failure_count ?? 0) + 1;
  await supabase.from("wine_subscriptions").update({
    failure_count: next,
    last_error: msg,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  return next;
}

async function rollForward(supabase: any, sub: Sub) {
  await supabase.from("wine_subscriptions").update({
    next_ship_date: nextShipDate(sub.cadence),
    last_charged_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", sub.id);
}

function nextShipDate(cadence: string): string {
  const months = cadence === "quarterly" ? 3 : cadence === "biannual" ? 6 : 1;
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function discountedPriceCents(sub: Sub): number {
  const base = sub.unit_price_cents * sub.quantity;
  return Math.round(base * (100 - (sub.discount_percent || 0)) / 100);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}