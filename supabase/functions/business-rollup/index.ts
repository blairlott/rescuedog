// Rolls up vs_transactions, orders, dropship_orders, wine_club_shipments into
// business_revenue_facts and computes customer_cohorts. Idempotent per day.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const J = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function authz(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
  if (!user) return false;
  const { data } = await sb.rpc("is_executive", { _user_id: user.id });
  if (data) return true;
  const { data: ops } = await sb.rpc("is_ad_ops", { _user_id: user.id });
  return !!ops;
}

async function rollupVinoshipper(since: string) {
  // vs_transactions has line-item granularity already in vs_products_lifetime;
  // but the canonical revenue table is vs_transactions. We bucket by date+state+segment.
  const { data, error } = await sb
    .from("vs_transactions")
    .select("transaction_date, customer_state, customer_email, active_club_member, transaction_type, store, order_type")
    .gte("transaction_date", since)
    .limit(50000);
  if (error) throw error;

  // Pull totals from a parallel summary if exists; otherwise count orders only.
  const buckets = new Map<string, { date: string; state: string; segment: string; orders: number; customers: Set<string> }>();
  for (const r of data ?? []) {
    if (!r.transaction_date) continue;
    const segment = r.active_club_member ? "club" : "returning";
    const k = `${r.transaction_date}|${r.customer_state ?? ""}|${segment}`;
    const b = buckets.get(k) ?? { date: r.transaction_date as string, state: (r.customer_state as string) ?? "", segment, orders: 0, customers: new Set<string>() };
    b.orders += 1;
    if (r.customer_email) b.customers.add(r.customer_email as string);
    buckets.set(k, b);
  }
  const rows = [...buckets.values()].map(b => ({
    date: b.date,
    channel: "vinoshipper",
    state: b.state || null,
    customer_segment: b.segment,
    orders: b.orders,
    unique_customers: b.customers.size,
    source: "rollup",
  }));
  if (rows.length) {
    await sb.from("business_revenue_facts").upsert(rows, { onConflict: "date,dim_hash" });
  }
  return rows.length;
}

async function rollupOrders(since: string) {
  const { data } = await sb.from("orders")
    .select("created_at, ship_state, customer_email, user_id, wine_subtotal_cents, merch_subtotal_cents, total_cents, shipping_cents, tax_cents, payment_status")
    .gte("created_at", since)
    .eq("payment_status", "paid")
    .limit(50000);

  const buckets = new Map<string, any>();
  for (const r of data ?? []) {
    const date = (r.created_at as string).slice(0, 10);
    for (const [channel, sub] of [["shopify_wine", r.wine_subtotal_cents], ["shopify_merch", r.merch_subtotal_cents]] as const) {
      if (!sub) continue;
      const k = `${date}|${channel}|${r.ship_state ?? ""}`;
      const b = buckets.get(k) ?? { date, channel, state: r.ship_state, customer_segment: "direct", orders: 0, gross_revenue_cents: 0, shipping_cents: 0, tax_cents: 0, customers: new Set<string>() };
      b.orders += 1;
      b.gross_revenue_cents += Number(sub);
      b.shipping_cents += Number(r.shipping_cents ?? 0);
      b.tax_cents += Number(r.tax_cents ?? 0);
      if (r.customer_email) b.customers.add(r.customer_email as string);
      buckets.set(k, b);
    }
  }
  const rows = [...buckets.values()].map(b => ({
    date: b.date, channel: b.channel, state: b.state, customer_segment: b.customer_segment,
    orders: b.orders, gross_revenue_cents: b.gross_revenue_cents,
    net_revenue_cents: b.gross_revenue_cents, shipping_cents: b.shipping_cents, tax_cents: b.tax_cents,
    unique_customers: b.customers.size, source: "rollup",
  }));
  if (rows.length) await sb.from("business_revenue_facts").upsert(rows, { onConflict: "date,dim_hash" });
  return rows.length;
}

async function rollupDropship(since: string) {
  const { data } = await sb.from("dropship_orders")
    .select("created_at, subtotal_cents, cost_cents, status")
    .gte("created_at", since).limit(50000);
  const buckets = new Map<string, any>();
  for (const r of data ?? []) {
    if (!r.subtotal_cents) continue;
    const date = (r.created_at as string).slice(0, 10);
    const k = `${date}|dropship`;
    const b = buckets.get(k) ?? { date, channel: "dropship", orders: 0, gross_revenue_cents: 0, cogs_cents: 0, margin_cents: 0 };
    b.orders += 1;
    b.gross_revenue_cents += Number(r.subtotal_cents);
    b.cogs_cents += Number(r.cost_cents ?? 0);
    b.margin_cents += Number(r.subtotal_cents) - Number(r.cost_cents ?? 0);
    buckets.set(k, b);
  }
  const rows = [...buckets.values()].map(b => ({ ...b, net_revenue_cents: b.gross_revenue_cents, source: "rollup" }));
  if (rows.length) await sb.from("business_revenue_facts").upsert(rows, { onConflict: "date,dim_hash" });
  return rows.length;
}

async function rollupWineClub(since: string) {
  const { data } = await sb.from("wine_club_shipments")
    .select("shipment_date, total_cents, status")
    .gte("shipment_date", since).limit(50000);
  const buckets = new Map<string, any>();
  for (const r of data ?? []) {
    if (!r.shipment_date) continue;
    const k = `${r.shipment_date}|wine_club`;
    const b = buckets.get(k) ?? { date: r.shipment_date, channel: "wine_club", customer_segment: "club", orders: 0, gross_revenue_cents: 0 };
    b.orders += 1;
    b.gross_revenue_cents += Number(r.total_cents ?? 0);
    buckets.set(k, b);
  }
  const rows = [...buckets.values()].map(b => ({ ...b, net_revenue_cents: b.gross_revenue_cents, source: "rollup" }));
  if (rows.length) await sb.from("business_revenue_facts").upsert(rows, { onConflict: "date,dim_hash" });
  return rows.length;
}

async function buildCohorts() {
  // Aggregate per customer from vs_transactions (the canonical historic source).
  const { data } = await sb.from("vs_transactions")
    .select("customer_email, customer_state, transaction_date, active_club_member, customer_id")
    .not("customer_email", "is", null)
    .limit(100000);

  type Agg = { first: string; last: string; orders: number; state: string | null; club: boolean };
  const byEmail = new Map<string, Agg>();
  for (const r of data ?? []) {
    const email = ((r.customer_email as string) ?? "").toLowerCase();
    if (!email) continue;
    const d = r.transaction_date as string ?? "";
    if (!d) continue;
    const cur = byEmail.get(email) ?? { first: d, last: d, orders: 0, state: (r.customer_state as string) ?? null, club: false };
    if (d < cur.first) cur.first = d;
    if (d > cur.last) cur.last = d;
    cur.orders += 1;
    if (r.active_club_member) cur.club = true;
    byEmail.set(email, cur);
  }

  const today = new Date();
  const rows = [...byEmail.entries()].map(([email, a]) => {
    const lastMs = new Date(a.last).getTime();
    const days = Math.round((today.getTime() - lastMs) / 86400000);
    let segment = "casual";
    if (a.orders >= 8) segment = "whale";
    else if (a.orders >= 4) segment = "loyal";
    else if (a.orders === 1) segment = "one_time";
    if (days > 365) segment = "churned";
    else if (days > 180) segment = "at_risk";
    // Simple churn prob: logistic on days_since
    const churn = 1 / (1 + Math.exp(-(days - 120) / 60));
    return {
      user_id: null,
      customer_email: email,
      acquisition_month: a.first.slice(0, 7) + "-01",
      first_order_at: a.first,
      last_order_at: a.last,
      orders_count: a.orders,
      days_since_last_order: days,
      is_club_member: a.club,
      segment,
      churn_probability: Number(churn.toFixed(3)),
      state: a.state,
      computed_at: new Date().toISOString(),
    };
  });

  // upsert by email
  const chunks: any[][] = [];
  for (let i = 0; i < rows.length; i += 500) chunks.push(rows.slice(i, i + 500));
  for (const c of chunks) await sb.from("customer_cohorts").upsert(c, { onConflict: "customer_email" });
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // allow service-role (cron) without bearer
  const isServiceCall = req.headers.get("apikey") === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!isServiceCall && !(await authz(req))) return J(401, { error: "unauthorized" });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const since = body.since ?? new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  const results: Record<string, number> = {};
  try { results.vinoshipper = await rollupVinoshipper(since); } catch (e: any) { results.vinoshipper_err = e?.message; }
  try { results.orders = await rollupOrders(since); } catch (e: any) { results.orders_err = e?.message; }
  try { results.dropship = await rollupDropship(since); } catch (e: any) { results.dropship_err = e?.message; }
  try { results.wine_club = await rollupWineClub(since); } catch (e: any) { results.wine_club_err = e?.message; }
  try { results.cohorts = await buildCohorts(); } catch (e: any) { results.cohorts_err = e?.message; }

  return J(200, { ok: true, since, results });
});