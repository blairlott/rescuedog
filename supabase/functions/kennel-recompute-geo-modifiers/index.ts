// Nightly recompute of per-state ad bid modifiers.
// CONSUMER lifetime LTV per state vs. overall median LTV.
// Min 25 customers per state or it stays at 1.0. Clamped [0.5, 2.0].

import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_SECRET = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

const MIN_CUSTOMERS = 25;
const MOD_MIN = 0.5;
const MOD_MAX = 2.0;

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

  type Row = { ship_to_state: string | null; order_total: number; invoice: string; customer_id: string | null; customer_email: string | null };
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 500000; from += PAGE) {
    const { data, error } = await supabase
      .from("vs_transactions")
      .select("ship_to_state, order_total, invoice, customer_id, customer_email")
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

  // state -> custKey -> { spend, orders }
  const byState = new Map<string, Map<string, { spend: number; orders: Set<string> }>>();
  for (const r of rows) {
    const st = (r.ship_to_state || "").toUpperCase();
    if (!st || st.length !== 2) continue;
    const cust = r.customer_id || r.customer_email;
    if (!cust) continue;
    if (!byState.has(st)) byState.set(st, new Map());
    const m = byState.get(st)!;
    const cur = m.get(cust) ?? { spend: 0, orders: new Set<string>() };
    cur.spend += Number(r.order_total) || 0;
    if (r.invoice) cur.orders.add(r.invoice);
    m.set(cust, cur);
  }

  // Per-state aggregates
  const stateStats = [...byState.entries()].map(([state, m]) => {
    const custs = [...m.values()];
    const customers = custs.length;
    const orders = custs.reduce((s, c) => s + c.orders.size, 0);
    const revenue = custs.reduce((s, c) => s + c.spend, 0);
    const avgLtv = customers > 0 ? revenue / customers : 0;
    const repeat = customers > 0
      ? (100 * custs.filter(c => c.orders.size >= 2).length) / customers
      : 0;
    return { state, customers, orders, revenue, avgLtv, repeat };
  });

  // Median LTV across qualifying states (≥ MIN_CUSTOMERS) as baseline.
  const qualifying = stateStats.filter(s => s.customers >= MIN_CUSTOMERS).map(s => s.avgLtv).sort((a, b) => a - b);
  const medianLtv = qualifying.length
    ? qualifying[Math.floor(qualifying.length / 2)]
    : 0;

  const upserts = stateStats.map(s => {
    let modifier = 1.0;
    let tier: string;
    let notes: string;
    if (s.customers < MIN_CUSTOMERS || medianLtv <= 0) {
      tier = "insufficient";
      notes = `only ${s.customers} customers (<${MIN_CUSTOMERS}) — held at 1.000`;
    } else {
      modifier = clamp(s.avgLtv / medianLtv, MOD_MIN, MOD_MAX);
      if (modifier >= 1.15 && s.repeat >= 12) tier = "A";
      else if (modifier >= 0.85) tier = "B";
      else tier = "C";
      notes = `lifetime LTV vs median $${(medianLtv).toFixed(0)}`;
    }
    return {
      state: s.state,
      modifier: Number(modifier.toFixed(3)),
      customers: s.customers,
      orders: s.orders,
      revenue_cents: Math.round(s.revenue * 100),
      avg_ltv_cents: Math.round(s.avgLtv * 100),
      repeat_rate_pct: Number(s.repeat.toFixed(2)),
      tier,
      notes,
      computed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  const { error: upErr } = await supabase
    .from("kennel_geo_modifiers")
    .upsert(upserts, { onConflict: "state" });
  if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  return new Response(JSON.stringify({
    ok: true,
    states: upserts.length,
    qualifying: qualifying.length,
    median_ltv_cents: Math.round(medianLtv * 100),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});