// Contribution-margin × demand-elasticity optimizer.
// For each channel-campaign: compute current spend, attributed revenue,
// estimated incremental revenue (vs 90d baseline elasticity), and recommend
// a budget delta. Writes results into executive_decisions when delta > $50/day.
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

// Bottle contribution margin fallback (50%) when business_revenue_facts margin missing.
const DEFAULT_MARGIN = 0.5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await authorized(req))) return J(401, { error: "unauthorized" });

  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const recent = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

  // Per-campaign 14d recent vs 90d baseline
  const { data: facts } = await sb.from("ad_performance_facts")
    .select("platform, campaign_id, campaign_name, date, spend, revenue, conversions")
    .gte("date", since).limit(50000);

  type Bucket = { platform: string; campaign_id: string; campaign_name: string | null;
    spend14: number; rev14: number; conv14: number; spend90: number; rev90: number; conv90: number; days14: number; days90: number };
  const map = new Map<string, Bucket>();
  for (const r of facts ?? []) {
    const k = `${r.platform}|${r.campaign_id ?? ""}`;
    const b = map.get(k) ?? { platform: r.platform, campaign_id: r.campaign_id ?? "", campaign_name: r.campaign_name ?? null,
      spend14: 0, rev14: 0, conv14: 0, spend90: 0, rev90: 0, conv90: 0, days14: 0, days90: 0 };
    const isRecent = (r.date as string) >= recent;
    b.spend90 += Number(r.spend); b.rev90 += Number(r.revenue); b.conv90 += Number(r.conversions);
    b.days90 += 1;
    if (isRecent) { b.spend14 += Number(r.spend); b.rev14 += Number(r.revenue); b.conv14 += Number(r.conversions); b.days14 += 1; }
    map.set(k, b);
  }

  const decisions: any[] = [];
  const recos: any[] = [];
  for (const b of map.values()) {
    if (b.spend14 < 100) continue; // ignore noise
    const spendDay14 = b.spend14 / Math.max(1, b.days14);
    const spendDay90 = b.spend90 / Math.max(1, b.days90);
    const roas14 = b.spend14 > 0 ? b.rev14 / b.spend14 : 0;
    const roas90 = b.spend90 > 0 ? b.rev90 / b.spend90 : 0;
    // Margin-aware target ROAS (need ROAS ≥ 1/margin to break even on contribution)
    const breakeven = 1 / DEFAULT_MARGIN; // 2.0x
    const target = breakeven * 1.25; // 2.5x cushion

    // Elasticity proxy: change in revenue per change in spend between periods
    const dSpend = spendDay14 - spendDay90;
    const dRev = (b.rev14 / Math.max(1, b.days14)) - (b.rev90 / Math.max(1, b.days90));
    const elasticity = Math.abs(dSpend) > 1 ? dRev / dSpend : roas14;

    let action: "scale_up" | "pull_back" | "hold" = "hold";
    let delta = 0;
    if (roas14 >= target && elasticity > breakeven) { action = "scale_up"; delta = Math.round(spendDay14 * 0.2); }
    else if (roas14 < breakeven) { action = "pull_back"; delta = -Math.round(spendDay14 * 0.3); }

    const incremental = Math.round(delta * Math.max(0, elasticity) * DEFAULT_MARGIN * 30); // monthly margin $
    const rec = {
      platform: b.platform, campaign_id: b.campaign_id, campaign_name: b.campaign_name,
      spend_per_day: Math.round(spendDay14), roas_14d: Number(roas14.toFixed(2)), roas_90d: Number(roas90.toFixed(2)),
      elasticity: Number(elasticity.toFixed(2)), recommended_delta_per_day: delta,
      target_roas: Number(target.toFixed(2)), action, monthly_margin_impact: incremental,
    };
    recos.push(rec);

    if (action !== "hold" && Math.abs(delta) >= 50) {
      decisions.push({
        priority: action === "pull_back" ? 85 : 70,
        category: "ads",
        scope: `${b.platform}:campaign`,
        scope_id: b.campaign_id,
        title: `${action === "scale_up" ? "Scale" : "Pull back"} ${b.campaign_name ?? b.campaign_id} (${b.platform})`,
        narrative: `14d ROAS ${roas14.toFixed(2)}x vs 90d ${roas90.toFixed(2)}x · elasticity ${elasticity.toFixed(2)} · target ${target.toFixed(2)}x.`,
        recommended_action: `${action === "scale_up" ? "Increase" : "Decrease"} daily budget by $${Math.abs(delta)} (~${Math.abs(Math.round(delta/Math.max(1,spendDay14)*100))}%).`,
        action_kind: action === "scale_up" ? "scale" : "throttle",
        action_payload: rec,
        estimated_impact_cents: Math.round(Math.abs(incremental) * 100),
        confidence: 0.6,
        source_engine: "margin_optimize",
      });
    }
  }

  if (decisions.length) {
    // dedupe last 24h
    const cutoff = new Date(Date.now() - 86400000).toISOString();
    const { data: existing } = await sb.from("executive_decisions")
      .select("scope_id, source_engine")
      .eq("source_engine", "margin_optimize").gte("created_at", cutoff);
    const seen = new Set((existing ?? []).map((e: any) => e.scope_id));
    const fresh = decisions.filter(d => !seen.has(d.scope_id));
    if (fresh.length) await sb.from("executive_decisions").insert(fresh);
  }

  return J(200, { ok: true, recommendations: recos.length, decisions_emitted: decisions.length, sample: recos.slice(0, 10) });
});