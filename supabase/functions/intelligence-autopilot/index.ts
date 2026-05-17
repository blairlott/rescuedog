// Orchestrator: runs ingests + business rollup + intelligence engines, then
// emits executive_decisions from anomalies, churn risk, and saturation gaps.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const PROJECT = Deno.env.get("SUPABASE_URL")!;
const SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const J = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function callFn(name: string, body: unknown = {}) {
  const r = await fetch(`${PROJECT}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SK, Authorization: `Bearer ${SK}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function emitDecisionsFromAnomalies() {
  const { data } = await sb.from("ad_anomalies")
    .select("*").is("resolved_at", null).is("acknowledged_at", null)
    .order("detected_at", { ascending: false }).limit(50);
  let emitted = 0;
  for (const a of data ?? []) {
    const sevPri = a.severity === "critical" ? 90 : a.severity === "warn" ? 70 : 50;
    // dedupe: check for open decision on same scope+metric in last 24h
    const { data: existing } = await sb.from("executive_decisions")
      .select("id").eq("category", "ads").eq("scope_id", a.scope_id ?? "")
      .eq("source_engine", `anomaly:${a.metric}`).in("status", ["pending", "approved"])
      .gte("created_at", new Date(Date.now() - 86400000).toISOString()).limit(1);
    if (existing && existing.length) continue;

    await sb.from("executive_decisions").insert({
      priority: sevPri,
      category: "ads",
      scope: `${a.platform}:${a.scope_type}`,
      scope_id: a.scope_id ?? null,
      title: `${a.platform.toUpperCase()} ${a.metric} ${a.kind} on ${a.scope_label ?? "channel"}`,
      narrative: a.narrative,
      recommended_action: a.suggested_action ?? "Review and decide.",
      action_kind: a.kind === "drop" ? "pause" : "notify",
      action_payload: { platform: a.platform, scope_id: a.scope_id, metric: a.metric },
      confidence: 0.8,
      auto_executable: false,
      source_engine: `anomaly:${a.metric}`,
      related_record_ids: [a.id],
    });
    emitted += 1;
  }
  return emitted;
}

async function emitDecisionsFromChurn() {
  const { data } = await sb.from("customer_cohorts")
    .select("customer_email, segment, churn_probability, lifetime_revenue_cents, orders_count")
    .in("segment", ["at_risk", "loyal", "whale"])
    .gt("churn_probability", 0.6)
    .order("churn_probability", { ascending: false })
    .limit(20);
  if (!data?.length) return 0;

  // Group into a single decision to avoid noise
  const total = data.reduce((s, r) => s + Number(r.lifetime_revenue_cents ?? 0), 0);
  const { data: existing } = await sb.from("executive_decisions")
    .select("id").eq("category", "club").eq("source_engine", "churn:batch")
    .in("status", ["pending", "approved"])
    .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()).limit(1);
  if (existing && existing.length) return 0;

  await sb.from("executive_decisions").insert({
    priority: 75,
    category: "club",
    scope: "customers:at_risk_high_value",
    title: `${data.length} high-value customers at risk of churning`,
    narrative: `These customers have a >60% churn probability and represent $${(total/100).toFixed(0)} in lifetime revenue. A 1-touch win-back is warranted.`,
    recommended_action: "Launch a personalized win-back email + 1-bottle gift to the top decile.",
    action_kind: "notify",
    action_payload: { customer_count: data.length, top_emails: data.slice(0, 10).map(d => d.customer_email) },
    estimated_impact_cents: Math.round(total * 0.15),
    confidence: 0.65,
    source_engine: "churn:batch",
  });
  return 1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const isService = req.headers.get("apikey") === SK;
  if (!isService) {
    const auth = req.headers.get("authorization");
    if (!auth) return J(401, { error: "unauthorized" });
    const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return J(401, { error: "unauthorized" });
    const { data: ok } = await sb.rpc("is_executive", { _user_id: user.id });
    const { data: ops } = await sb.rpc("is_ad_ops", { _user_id: user.id });
    if (!ok && !ops) return J(403, { error: "forbidden" });
  }

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const skipIngest = !!body.skip_ingest;

  const steps: Record<string, unknown> = {};

  if (!skipIngest) {
    steps.business = (await callFn("business-rollup", { since: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10) })).body;
    steps.meta = (await callFn("kennel-ingest-meta", { days: 30 })).body;
    steps.google = (await callFn("kennel-ingest-google", { days: 30 })).body;
  }

  steps.anomalies = (await callFn("ad-intelligence", { action: "detect_anomalies", platform: "meta" })).body;
  (await callFn("ad-intelligence", { action: "detect_anomalies", platform: "google" }));
  (await callFn("ad-intelligence", { action: "detect_anomalies", platform: "instacart" }));

  steps.decisions_from_anomalies = await emitDecisionsFromAnomalies();
  steps.decisions_from_churn = await emitDecisionsFromChurn();

  return J(200, { ok: true, steps });
});