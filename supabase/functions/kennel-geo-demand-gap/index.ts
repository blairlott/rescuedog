// Compares per-state DTC demand (vs_transactions revenue) to ad spend reach
// (ad_performance_facts geo_region) and surfaces high-demand / low-coverage
// states as opportunities, low-demand / high-spend as cuts.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function authorized(req: Request): Promise<boolean> {
  if (req.headers.get("apikey") === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
  if (!user) return false;
  const { data } = await sb.rpc("is_executive", { _user_id: user.id });
  if (data) return true;
  const { data: o } = await sb.rpc("is_ad_ops", { _user_id: user.id });
  return !!o;
}

// Vinoshipper blocked / non-shippable states — never recommend spend here.
const BLOCKED = new Set(["UT","PA","MS","AL","KY"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await authorized(req))) return J(401, { error: "unauthorized" });

  const days = 90;
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  // Demand: revenue + orders by state from vs_transactions (paged)
  const demand = new Map<string, { revenue: number; orders: number }>();
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await sb.from("vs_transactions")
      .select("customer_state, order_total, invoice")
      .gte("transaction_date", since)
      .order("transaction_date", { ascending: true })
      .range(from, from + 999);
    if (error) break;
    const rows = data ?? [];
    if (!rows.length) break;
    for (const r of rows) {
      const s = (r.customer_state as string | null)?.toUpperCase();
      if (!s) continue;
      const cur = demand.get(s) ?? { revenue: 0, orders: 0 };
      cur.revenue += Number(r.order_total ?? 0);
      if (r.invoice) cur.orders += 1;
      demand.set(s, cur);
    }
    if (rows.length < 1000) break;
  }

  // Coverage: ad spend by geo_region from facts
  const coverage = new Map<string, { spend: number; revenue: number }>();
  const { data: facts } = await sb.from("ad_performance_facts")
    .select("geo_region, spend, revenue").gte("date", since).not("geo_region", "is", null).limit(50000);
  for (const f of facts ?? []) {
    const s = (f.geo_region as string).toUpperCase().slice(0, 2);
    const cur = coverage.get(s) ?? { spend: 0, revenue: 0 };
    cur.spend += Number(f.spend); cur.revenue += Number(f.revenue);
    coverage.set(s, cur);
  }

  const totalDemand = [...demand.values()].reduce((s, d) => s + d.revenue, 0) || 1;
  const totalSpend = [...coverage.values()].reduce((s, c) => s + c.spend, 0) || 1;

  const rows = [...new Set([...demand.keys(), ...coverage.keys()])].map(state => {
    const d = demand.get(state) ?? { revenue: 0, orders: 0 };
    const c = coverage.get(state) ?? { spend: 0, revenue: 0 };
    const demandShare = d.revenue / totalDemand;
    const spendShare = c.spend / totalSpend;
    const gap = demandShare - spendShare; // positive = under-served
    const blocked = BLOCKED.has(state);
    return { state, demand_revenue: Math.round(d.revenue), orders: d.orders, ad_spend: Math.round(c.spend),
      demand_share: Number(demandShare.toFixed(3)), spend_share: Number(spendShare.toFixed(3)),
      gap: Number(gap.toFixed(3)), blocked };
  }).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  // Emit top under-served (positive gap > 0.05, not blocked, demand > $1000)
  const opps = rows.filter(r => !r.blocked && r.gap > 0.05 && r.demand_revenue > 1000).slice(0, 5);
  const cuts = rows.filter(r => r.gap < -0.05 && r.ad_spend > 500).slice(0, 5);

  const decisions: any[] = [];
  if (opps.length) {
    decisions.push({
      priority: 75, category: "ads", scope: "geo:underserved",
      title: `${opps.length} states are demand-hot but under-spent`,
      narrative: opps.map(o => `${o.state}: ${(o.demand_share*100).toFixed(1)}% of revenue, ${(o.spend_share*100).toFixed(1)}% of spend ($${o.demand_revenue.toLocaleString()} demand).`).join(" "),
      recommended_action: `Re-allocate budget into geo targeting for: ${opps.map(o => o.state).join(", ")}.`,
      action_kind: "reallocate",
      action_payload: { opportunities: opps },
      estimated_impact_cents: Math.round(opps.reduce((s, o) => s + o.demand_revenue * 0.1, 0) * 100),
      confidence: 0.55,
      source_engine: "geo_demand_gap",
    });
  }
  if (cuts.length) {
    decisions.push({
      priority: 65, category: "ads", scope: "geo:overspent",
      title: `${cuts.length} states absorb spend with little DTC return`,
      narrative: cuts.map(c => `${c.state}: ${(c.spend_share*100).toFixed(1)}% of spend ($${c.ad_spend.toLocaleString()}), only ${(c.demand_share*100).toFixed(1)}% of revenue.`).join(" "),
      recommended_action: `Trim or exclude geo targeting in: ${cuts.map(c => c.state).join(", ")}.`,
      action_kind: "throttle",
      action_payload: { cuts },
      estimated_impact_cents: Math.round(cuts.reduce((s, c) => s + c.ad_spend * 0.3, 0) * 100),
      confidence: 0.55,
      source_engine: "geo_demand_gap",
    });
  }

  if (decisions.length) {
    const cutoff = new Date(Date.now() - 86400000).toISOString();
    const { data: existing } = await sb.from("executive_decisions")
      .select("scope").eq("source_engine", "geo_demand_gap").gte("created_at", cutoff);
    const seen = new Set((existing ?? []).map((e: any) => e.scope));
    const fresh = decisions.filter(d => !seen.has(d.scope));
    if (fresh.length) await sb.from("executive_decisions").insert(fresh);
  }

  return J(200, { ok: true, states: rows.length, opportunities: opps, cuts });
});