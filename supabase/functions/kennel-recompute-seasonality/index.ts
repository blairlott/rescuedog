// Nightly recompute of month-of-year budget index from lifetime CONSUMER revenue.
// Index = avg monthly revenue / overall avg monthly revenue. Clamped [0.3, 3.0].

import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_SECRET = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

const IDX_MIN = 0.3;
const IDX_MAX = 3.0;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const provided = req.headers.get("x-kennel-ingest-secret") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  let authorized = auth.includes(SUPABASE_SERVICE_ROLE_KEY) || (!!INGEST_SECRET && provided === INGEST_SECRET);
  if (!authorized && auth.startsWith("Bearer ")) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (u?.user?.id) {
      const { data: ok } = await supabase.rpc("is_ad_ops", { _user_id: u.user.id });
      if (ok === true) authorized = true;
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  type Row = { transaction_date: string; order_total: number; invoice: string };
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 500000; from += PAGE) {
    const { data, error } = await supabase
      .from("vs_transactions")
      .select("transaction_date, order_total, invoice")
      .eq("transaction_type", "ORDER")
      .eq("order_type", "CONSUMER")
      .neq("chain_status", "Cancelled")
      .gt("order_total", 0)
      .range(from, from + PAGE - 1);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const r = (data ?? []) as Row[];
    rows.push(...r);
    if (r.length < PAGE) break;
  }

  // Per (year, month) revenue + orders, then average per month-of-year.
  type Bucket = { rev: number; orders: Set<string>; years: Set<number> };
  const byYM = new Map<string, { mo: number; year: number; rev: number; orders: Set<string> }>();
  for (const r of rows) {
    if (!r.transaction_date) continue;
    const d = new Date(r.transaction_date + "T00:00:00Z");
    const year = d.getUTCFullYear();
    const mo = d.getUTCMonth() + 1;
    const key = `${year}-${mo}`;
    const cur = byYM.get(key) ?? { mo, year, rev: 0, orders: new Set<string>() };
    cur.rev += Number(r.order_total) || 0;
    if (r.invoice) cur.orders.add(r.invoice);
    byYM.set(key, cur);
  }

  const perMonth: Record<number, Bucket> = {};
  for (let m = 1; m <= 12; m++) perMonth[m] = { rev: 0, orders: new Set<string>(), years: new Set<number>() };
  for (const v of byYM.values()) {
    perMonth[v.mo].rev += v.rev;
    v.orders.forEach(o => perMonth[v.mo].orders.add(o));
    perMonth[v.mo].years.add(v.year);
  }

  // Avg revenue per active month-of-year-instance.
  const avgPerMo: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const years = perMonth[m].years.size;
    avgPerMo[m] = years > 0 ? perMonth[m].rev / years : 0;
  }
  const baseAvg = avgPerMo.slice(1).filter(v => v > 0).reduce((s, v) => s + v, 0) /
    Math.max(1, avgPerMo.slice(1).filter(v => v > 0).length);

  const upserts = [];
  for (let m = 1; m <= 12; m++) {
    const years = perMonth[m].years.size;
    const orders = perMonth[m].orders.size;
    const idx = (baseAvg > 0 && years > 0) ? clamp(avgPerMo[m] / baseAvg, IDX_MIN, IDX_MAX) : 1.0;
    upserts.push({
      month: m,
      budget_index: Number(idx.toFixed(3)),
      revenue_cents: Math.round(perMonth[m].rev * 100),
      orders,
      avg_aov_cents: orders > 0 ? Math.round((perMonth[m].rev / orders) * 100) : 0,
      years_observed: years,
      notes: years === 0 ? "no data" : `${years} years of history`,
      computed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const { error: upErr } = await supabase
    .from("kennel_seasonality_curve")
    .upsert(upserts, { onConflict: "month" });
  if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  return new Response(JSON.stringify({
    ok: true,
    months: 12,
    baseline_monthly_revenue_cents: Math.round(baseAvg * 100),
    rows_considered: rows.length,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});