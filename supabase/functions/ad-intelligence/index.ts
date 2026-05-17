// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ---------- helpers ----------
const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const stddev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

// Holt-Winters style double-exponential smoothing (level + trend)
function forecast(series: number[], horizon: number) {
  if (series.length < 3) {
    const last = series[series.length - 1] ?? 0;
    return Array.from({ length: horizon }, () => last);
  }
  const alpha = 0.5, beta = 0.3;
  let level = series[0];
  let trend = series[1] - series[0];
  for (let i = 1; i < series.length; i++) {
    const prevLevel = level;
    level = alpha * series[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return Array.from({ length: horizon }, (_, i) => Math.max(0, level + (i + 1) * trend));
}

function confidenceBand(series: number[], forecasted: number[]) {
  const sd = stddev(series);
  return forecasted.map((v) => ({
    forecast: v,
    lower: Math.max(0, v - 1.96 * sd),
    upper: v + 1.96 * sd,
  }));
}

// Diminishing-returns saturation: revenue = a * (1 - exp(-b * spend))
// Fit a,b from observed (spend, revenue) pairs via simple grid search.
function fitSaturation(points: { spend: number; revenue: number }[]) {
  const filtered = points.filter((p) => p.spend > 0);
  if (filtered.length < 4) return null;
  const maxRev = Math.max(...filtered.map((p) => p.revenue));
  const maxSpend = Math.max(...filtered.map((p) => p.spend));
  let best = { a: maxRev * 2, b: 1 / Math.max(maxSpend, 1), sse: Infinity };
  for (const a of [maxRev * 1.2, maxRev * 1.8, maxRev * 2.5, maxRev * 4]) {
    for (const b of [0.1 / maxSpend, 0.5 / maxSpend, 1 / maxSpend, 2 / maxSpend, 5 / maxSpend]) {
      const sse = filtered.reduce((s, p) => {
        const pred = a * (1 - Math.exp(-b * p.spend));
        return s + (pred - p.revenue) ** 2;
      }, 0);
      if (sse < best.sse) best = { a, b, sse };
    }
  }
  return best;
}

async function aiNarrative(prompt: string): Promise<string> {
  if (!LOVABLE_API_KEY) return "";
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a senior performance-marketing analyst. Be concise (1-2 sentences), specific, and action-oriented. No fluff." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!r.ok) return "";
    const j = await r.json();
    return j.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

async function authz(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
  if (!user) return null;
  const { data: ok } = await sb.rpc("is_ad_ops", { _user_id: user.id });
  return ok ? user : null;
}

// ---------- actions ----------

/** Aggregate dimensional facts for drill-downs. */
async function breakdown(p: any) {
  const { platform, dimension, since, until, filters = {} } = p;
  const validDims = new Set([
    "campaign_id", "ad_group_id", "ad_id", "creative_id", "audience_id",
    "placement", "network", "geo_country", "geo_region", "geo_dma",
    "device", "attribution_window", "hour",
  ]);
  if (!validDims.has(dimension)) return { error: "invalid dimension" };

  let q = sb.from("ad_performance_facts")
    .select(`${dimension}, ${dimension.replace("_id", "_name")}, spend.sum(), impressions.sum(), clicks.sum(), conversions.sum(), revenue.sum()`)
    .eq("platform", platform)
    .gte("date", since)
    .lte("date", until);
  for (const [k, v] of Object.entries(filters)) {
    if (v !== null && v !== undefined && v !== "") q = q.eq(k, v as any);
  }
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { rows: data ?? [] };
}

/** Spend/Revenue/ROAS forecast for a scope. */
async function runForecast(p: any) {
  const { platform, scope_type = "channel", scope_id = null, scope_label, channel_id, metric = "revenue", horizon_days = 30 } = p;

  const idCol = ({
    channel: null, campaign: "campaign_id", ad_group: "ad_group_id",
    ad: "ad_id", audience: "audience_id",
  } as Record<string, string | null>)[scope_type];

  let q = sb.from("ad_performance_facts")
    .select("date, spend, revenue, conversions")
    .eq("platform", platform)
    .gte("date", new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10))
    .order("date", { ascending: true });
  if (idCol && scope_id) q = q.eq(idCol, scope_id);

  const { data, error } = await q;
  if (error) return { error: error.message };

  // Aggregate per day
  const byDay = new Map<string, { spend: number; revenue: number; conv: number }>();
  for (const r of data ?? []) {
    const k = r.date as string;
    const cur = byDay.get(k) ?? { spend: 0, revenue: 0, conv: 0 };
    cur.spend += Number(r.spend); cur.revenue += Number(r.revenue); cur.conv += r.conversions ?? 0;
    byDay.set(k, cur);
  }
  const days = [...byDay.keys()].sort();
  const pickSeries = (m: string) => days.map((d) => {
    const v = byDay.get(d)!;
    return m === "spend" ? v.spend : m === "conversions" ? v.conv :
      m === "roas" ? (v.spend > 0 ? v.revenue / v.spend : 0) : v.revenue;
  });
  const series = pickSeries(metric);

  if (series.length === 0) return { error: "no history" };
  const fc = forecast(series, horizon_days);
  const band = confidenceBand(series, fc);
  const total = fc.reduce((a, b) => a + b, 0);
  const recentAvg = mean(series.slice(-7));

  const narrative = await aiNarrative(
    `Forecast for ${platform} ${scope_type}${scope_label ? ` "${scope_label}"` : ""}: metric=${metric}, recent 7d avg=${recentAvg.toFixed(2)}, next ${horizon_days}d projected total=${total.toFixed(2)}. Write a 1-sentence insight + 1-sentence recommendation.`,
  );

  await sb.from("ad_forecasts").insert({
    channel_id, platform, scope_type, scope_id: scope_id ?? null, scope_label,
    metric, horizon_days, forecast_value: total,
    lower_bound: band.reduce((a, b) => a + b.lower, 0),
    upper_bound: band.reduce((a, b) => a + b.upper, 0),
    confidence: 0.95,
    series: band.map((b, i) => ({ day_offset: i + 1, ...b })),
    narrative,
    valid_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  });

  return { forecast: band, total, recentAvg, narrative };
}

/** Saturation curve + efficient spend ceiling. */
async function runSaturation(p: any) {
  const { platform, scope_type = "campaign", scope_id, scope_label, channel_id, target_roas = 2.5 } = p;
  const idCol = scope_type === "campaign" ? "campaign_id" : scope_type === "ad_group" ? "ad_group_id" : "ad_id";

  const { data, error } = await sb.from("ad_performance_facts")
    .select("date, spend, revenue")
    .eq("platform", platform)
    .eq(idCol, scope_id)
    .gte("date", new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10));
  if (error) return { error: error.message };

  const byDay = new Map<string, { spend: number; revenue: number }>();
  for (const r of data ?? []) {
    const k = r.date as string;
    const cur = byDay.get(k) ?? { spend: 0, revenue: 0 };
    cur.spend += Number(r.spend); cur.revenue += Number(r.revenue);
    byDay.set(k, cur);
  }
  const points = [...byDay.values()].filter((p) => p.spend > 0);
  const fit = fitSaturation(points);
  if (!fit) return { error: "not enough variance to fit saturation curve" };

  const maxObserved = Math.max(...points.map((p) => p.spend));
  const samples = Array.from({ length: 20 }, (_, i) => {
    const spend = (maxObserved * 2) * ((i + 1) / 20);
    const revenue = fit.a * (1 - Math.exp(-fit.b * spend));
    const dRev = fit.a * fit.b * Math.exp(-fit.b * spend);
    return { spend, predicted_revenue: revenue, marginal_roas: dRev };
  });

  // efficient ceiling: largest spend where marginal_roas >= target
  const ceiling = samples.filter((s) => s.marginal_roas >= target_roas).pop();
  const currentSpend = mean(points.map((p) => p.spend));
  const currentRoas = mean(points.map((p) => p.spend > 0 ? p.revenue / p.spend : 0));

  const recommendation = ceiling
    ? (ceiling.spend > currentSpend
      ? `Scale up to ~$${ceiling.spend.toFixed(0)}/day — marginal ROAS still ${ceiling.marginal_roas.toFixed(2)}x`
      : `Cut to ~$${ceiling.spend.toFixed(0)}/day — currently past efficient ceiling`)
    : `Current spend already past efficient ceiling at target ROAS ${target_roas}x`;

  await sb.from("ad_saturation_curves").insert({
    channel_id, platform, scope_type, scope_id, scope_label,
    current_daily_spend: currentSpend, current_roas: currentRoas,
    efficient_spend_ceiling: ceiling?.spend ?? null,
    target_roas, curve_points: samples,
    recommendation,
    reallocation_delta: ceiling ? ceiling.spend - currentSpend : null,
  });

  return { curve: samples, ceiling, currentSpend, currentRoas, recommendation };
}

/** Detect spend / CTR / CVR / ROAS anomalies vs trailing baseline. */
async function detectAnomalies(p: any) {
  const { platform, channel_id, lookback_days = 30, z_threshold = 2.5 } = p;
  const since = new Date(Date.now() - lookback_days * 86400000).toISOString().slice(0, 10);

  const { data, error } = await sb.from("ad_performance_facts")
    .select("date, campaign_id, campaign_name, spend, impressions, clicks, conversions, revenue")
    .eq("platform", platform).gte("date", since);
  if (error) return { error: error.message };

  type Row = { date: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number };
  const byCampaign = new Map<string, { name: string; rows: Row[] }>();
  for (const r of data ?? []) {
    const id = (r.campaign_id as string) ?? "_channel";
    const bucket = byCampaign.get(id) ?? { name: (r.campaign_name as string) ?? id, rows: [] };
    bucket.rows.push({
      date: r.date as string,
      spend: Number(r.spend),
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      conversions: r.conversions ?? 0,
      revenue: Number(r.revenue),
    });
    byCampaign.set(id, bucket);
  }

  const anomalies: any[] = [];
  for (const [campId, { name, rows }] of byCampaign) {
    rows.sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length < 7) continue;
    const recent = rows[rows.length - 1];
    const baseline = rows.slice(0, -1);

    const metrics: { key: string; obs: number; series: number[]; kind: "spike" | "drop" }[] = [
      { key: "spend", obs: recent.spend, series: baseline.map((r) => r.spend), kind: "spike" },
      { key: "ctr", obs: recent.impressions > 0 ? recent.clicks / recent.impressions : 0,
        series: baseline.map((r) => r.impressions > 0 ? r.clicks / r.impressions : 0), kind: "drop" },
      { key: "cvr", obs: recent.clicks > 0 ? recent.conversions / recent.clicks : 0,
        series: baseline.map((r) => r.clicks > 0 ? r.conversions / r.clicks : 0), kind: "drop" },
      { key: "roas", obs: recent.spend > 0 ? recent.revenue / recent.spend : 0,
        series: baseline.map((r) => r.spend > 0 ? r.revenue / r.spend : 0), kind: "drop" },
    ];

    for (const m of metrics) {
      const mu = mean(m.series), sd = stddev(m.series);
      if (sd === 0) continue;
      const z = (m.obs - mu) / sd;
      const sevAbs = Math.abs(z);
      if (sevAbs < z_threshold) continue;
      const directionBad = m.kind === "drop" ? z < 0 : z > 0;
      if (!directionBad) continue;

      const severity = sevAbs > 4 ? "critical" : sevAbs > 3 ? "warn" : "info";
      const pct = mu === 0 ? 0 : ((m.obs - mu) / mu) * 100;
      const narrative = await aiNarrative(
        `Campaign "${name}" on ${platform}: ${m.key} is ${m.obs.toFixed(3)} vs 30d avg ${mu.toFixed(3)} (z=${z.toFixed(2)}, ${pct.toFixed(0)}% change). Give 1-sentence likely root cause and 1-sentence next action.`,
      );

      const insert = {
        channel_id, platform, scope_type: campId === "_channel" ? "channel" : "campaign",
        scope_id: campId === "_channel" ? null : campId, scope_label: name,
        metric: m.key, observed: m.obs, expected: mu, std_dev: sd,
        z_score: z, pct_change: pct, severity, kind: m.kind,
        narrative,
        suggested_action: m.kind === "drop"
          ? "Pause underperforming ad sets, refresh creative, or tighten audience."
          : "Verify bid caps and budget pacing; check for traffic-source quality.",
      };
      anomalies.push(insert);
    }
  }

  if (anomalies.length) await sb.from("ad_anomalies").insert(anomalies);
  return { detected: anomalies.length, anomalies };
}

/** Compute audience propensity scores (convert/repeat/churn/ltv) from purchase signals. */
async function scorePropensity(p: any) {
  const { score_type = "convert" } = p;
  // Pull simple signals from profiles + impact_events as a v1 baseline.
  const { data: events } = await sb.from("impact_events")
    .select("user_id, donation_cents, created_at, bottles")
    .gte("created_at", new Date(Date.now() - 180 * 86400000).toISOString())
    .limit(5000);

  if (!events || events.length === 0) return { scored: 0 };

  const byUser = new Map<string, { spend: number; orders: number; lastDays: number; bottles: number }>();
  const nowMs = Date.now();
  for (const e of events) {
    if (!e.user_id) continue;
    const cur = byUser.get(e.user_id as string) ?? { spend: 0, orders: 0, lastDays: 999, bottles: 0 };
    cur.spend += Number(e.donation_cents ?? 0) / 100;
    cur.orders += 1;
    cur.bottles += Number(e.bottles ?? 0);
    const days = (nowMs - new Date(e.created_at as string).getTime()) / 86400000;
    if (days < cur.lastDays) cur.lastDays = days;
    byUser.set(e.user_id as string, cur);
  }

  const rows = [...byUser.entries()].map(([user_id, f]) => {
    // RFM-ish scoring 0-1
    const recency = Math.max(0, 1 - f.lastDays / 180);
    const frequency = Math.min(1, f.orders / 6);
    const monetary = Math.min(1, f.spend / 500);
    let score = 0;
    if (score_type === "convert") score = 0.5 * recency + 0.3 * frequency + 0.2 * monetary;
    else if (score_type === "repeat") score = 0.4 * frequency + 0.4 * recency + 0.2 * monetary;
    else if (score_type === "churn") score = 1 - recency;
    else if (score_type === "ltv") score = monetary * (1 + frequency);
    return { user_id, score_type, score, features: f, model_version: "rfm_v1" };
  });

  // Percentile
  const sorted = [...rows].map((r) => r.score).sort((a, b) => a - b);
  for (const r of rows) {
    const idx = sorted.findIndex((s) => s >= r.score);
    (r as any).percentile = Math.round((idx / Math.max(1, sorted.length - 1)) * 100);
  }

  // Replace existing for this score_type (idempotent v1)
  await sb.from("audience_propensity_scores").delete().eq("score_type", score_type).eq("model_version", "rfm_v1");
  const chunks = [];
  for (let i = 0; i < rows.length; i += 500) chunks.push(rows.slice(i, i + 500));
  for (const c of chunks) await sb.from("audience_propensity_scores").insert(c);

  return { scored: rows.length };
}

// ---------- router ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return J(405, { error: "method not allowed" });

  const user = await authz(req);
  if (!user) return J(401, { error: "unauthorized" });

  let body: any;
  try { body = await req.json(); } catch { return J(400, { error: "bad json" }); }
  const { action } = body;

  try {
    switch (action) {
      case "breakdown":          return J(200, await breakdown(body));
      case "forecast":           return J(200, await runForecast(body));
      case "saturation":         return J(200, await runSaturation(body));
      case "detect_anomalies":   return J(200, await detectAnomalies(body));
      case "score_propensity":   return J(200, await scorePropensity(body));
      default:                   return J(400, { error: `unknown action: ${action}` });
    }
  } catch (e: any) {
    return J(500, { error: String(e?.message ?? e) });
  }
});