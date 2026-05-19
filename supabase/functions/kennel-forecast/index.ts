// kennel-forecast: simple linear + 7-day seasonality projection over
// ad_performance_daily, writes to ad_forecasts. Optional platform filter.
// Reflects current strategy_mode (goal/pace) from ad_settings to tilt
// the projection.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function J(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type DailyRow = { date: string; platform: string; spend: number; revenue: number; conversions: number };

function linreg(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, residStd: 0 };
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  let ss = 0;
  for (let i = 0; i < n; i++) { const e = ys[i] - (intercept + slope * xs[i]); ss += e * e; }
  const residStd = Math.sqrt(ss / Math.max(1, n - 2));
  return { slope, intercept, residStd };
}

function seasonalFactors(dates: string[], ys: number[]): number[] {
  // average ratio per day-of-week vs overall mean
  const dow = dates.map((d) => new Date(d + "T00:00:00Z").getUTCDay());
  const mean = ys.reduce((s, v) => s + v, 0) / Math.max(1, ys.length);
  if (mean === 0) return new Array(7).fill(1);
  const sums = new Array(7).fill(0); const cnts = new Array(7).fill(0);
  for (let i = 0; i < ys.length; i++) { sums[dow[i]] += ys[i]; cnts[dow[i]] += 1; }
  return sums.map((s, i) => (cnts[i] === 0 ? 1 : (s / cnts[i]) / mean));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return J(401, { error: "unauthorized" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await user.auth.getUser();
  if (!u?.user) return J(401, { error: "unauthorized" });
  const { data: canView } = await admin.rpc("can_view_kennel", { _user_id: u.user.id });
  if (!canView) return J(403, { error: "forbidden" });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const platformFilter: string | null = body?.platform ? String(body.platform).toLowerCase() : null;
  const horizon = Math.min(Math.max(Number(body?.horizon_days ?? 90), 14), 1095);
  const lookback = Math.min(Math.max(Number(body?.lookback_days ?? 90), 14), 3650);

  // Pull strategy_mode for tilts
  const { data: smRow } = await admin.from("ad_settings").select("value").eq("key", "strategy_mode").maybeSingle();
  const sm = (smRow?.value ?? {}) as { goal?: number; pace?: number };
  const goal = typeof sm.goal === "number" ? sm.goal : 50;   // 0=max ROAS, 100=max reach
  const pace = typeof sm.pace === "number" ? sm.pace : 50;   // 0=steady, 100=burst
  // Pace tilts spend, goal tilts revenue trajectory (more reach => lower marginal ROAS).
  const spendTilt   = 1 + ((pace - 50) / 50) * 0.30;          // 0.70 .. 1.30
  const revenueTilt = 1 + ((goal - 50) / 50) * 0.15;          // 0.85 .. 1.15 (more reach => more rev but less efficient)
  const roasTilt    = 1 - ((goal - 50) / 50) * 0.20;          // 0.80 .. 1.20 (max ROAS slider lifts ROAS)

  // Lookback window
  const since = new Date(Date.now() - lookback * 86400000).toISOString().slice(0, 10);
  const { data: channels } = await admin.from("ad_channels").select("id, platform");
  const chById = new Map<string, string>((channels ?? []).map((c: any) => [c.id, c.platform]));
  const { data: rowsRaw } = await admin
    .from("ad_performance_daily")
    .select("channel_id, date, spend, revenue, conversions")
    .gte("date", since)
    .order("date");
  const rows: DailyRow[] = (rowsRaw ?? []).map((r: any) => ({
    date: r.date,
    platform: chById.get(r.channel_id) ?? "unknown",
    spend: Number(r.spend ?? 0),
    revenue: Number(r.revenue ?? 0),
    conversions: Number(r.conversions ?? 0),
  }));

  const platforms = platformFilter ? [platformFilter] : Array.from(new Set(rows.map((r) => r.platform)));
  // Also produce "all" aggregate when not platform-filtered
  if (!platformFilter) platforms.push("all");

  const out: any[] = [];
  for (const plat of platforms) {
    const subset = plat === "all" ? rows : rows.filter((r) => r.platform === plat);
    if (subset.length < 7) continue;

    // Aggregate by date
    const byDate = new Map<string, { spend: number; revenue: number }>();
    for (const r of subset) {
      const cur = byDate.get(r.date) ?? { spend: 0, revenue: 0 };
      cur.spend += r.spend; cur.revenue += r.revenue;
      byDate.set(r.date, cur);
    }
    const dates = Array.from(byDate.keys()).sort();
    const spendSeries = dates.map((d) => byDate.get(d)!.spend);
    const revSeries   = dates.map((d) => byDate.get(d)!.revenue);
    const xs = dates.map((_, i) => i);

    const spendReg = linreg(xs, spendSeries);
    const revReg   = linreg(xs, revSeries);
    const spendSeason = seasonalFactors(dates, spendSeries);
    const revSeason   = seasonalFactors(dates, revSeries);

    const lastIdx = xs[xs.length - 1];
    const lastDate = new Date(dates[dates.length - 1] + "T00:00:00Z");

    // ---- Stability anchors -------------------------------------------------
    // Independent regressions on spend and revenue diverge badly when one trend
    // collapses (e.g. campaigns paused → spend slope ~0, revenue stays flat →
    // ROAS = rev/tiny_spend explodes to 30–300x). Anchor the projection on
    // recent realized efficiency so ROAS stays physically meaningful.
    const tail = (arr: number[], n: number) => arr.slice(Math.max(0, arr.length - n));
    const mean = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    const sum  = (arr: number[]) => arr.reduce((s, v) => s + v, 0);

    const recent28Spend = tail(spendSeries, 28);
    const recent28Rev   = tail(revSeries, 28);
    const baselineSpend = mean(recent28Spend);
    const baselineRev   = mean(recent28Rev);
    const baselineSumSpend = sum(recent28Spend);
    const baselineSumRev   = sum(recent28Rev);
    // Realized ROAS over last 28 days (or whole window if shorter). Falls back
    // to lifetime mean ratio when recent spend is near zero.
    const lifetimeRoas = sum(spendSeries) > 0 ? sum(revSeries) / sum(spendSeries) : 0;
    const baselineRoas = baselineSumSpend > 0
      ? baselineSumRev / baselineSumSpend
      : lifetimeRoas;
    // Floor projected spend so a steeply negative slope can't drive it to ~0.
    // 25% of recent mean is a conservative wind-down assumption.
    const spendFloor = Math.max(0, baselineSpend * 0.25);
    // Hard cap on projected daily ROAS at 3x recent baseline to clamp tails.
    const roasCeiling = baselineRoas > 0 ? baselineRoas * 3 : Number.POSITIVE_INFINITY;

    const series: any[] = [];
    let cumSpend = 0, cumRev = 0;
    for (let h = 1; h <= horizon; h++) {
      const futureDate = new Date(lastDate.getTime() + h * 86400000);
      const dow = futureDate.getUTCDay();
      const xi = lastIdx + h;
      const rawSpend   = Math.max(0, spendReg.intercept + spendReg.slope * xi) * spendSeason[dow] * spendTilt;
      const trendSpend = Math.max(spendFloor * spendSeason[dow] * spendTilt, rawSpend);
      // Derive revenue from projected spend × baseline efficiency (ROAS),
      // then nudge with seasonal pattern. This keeps ROAS bounded.
      const effectiveRoas = Math.min(roasCeiling, baselineRoas * roasTilt);
      const trendRev = trendSpend * effectiveRoas * revSeason[dow] * revenueTilt;
      const roas = trendSpend > 0 ? trendRev / trendSpend : 0;
      const sigmaRev = Math.max(revReg.residStd, trendRev * 0.15);
      cumSpend += trendSpend; cumRev += trendRev;
      series.push({
        date: futureDate.toISOString().slice(0, 10),
        spend: Math.round(trendSpend * 100) / 100,
        revenue: Math.round(trendRev * 100) / 100,
        revenue_lower: Math.round(Math.max(0, trendRev - 1.96 * sigmaRev) * 100) / 100,
        revenue_upper: Math.round((trendRev + 1.96 * sigmaRev) * 100) / 100,
        roas: Math.round(roas * 1000) / 1000,
      });
    }

    const summary = {
      cum_spend: Math.round(cumSpend * 100) / 100,
      cum_revenue: Math.round(cumRev * 100) / 100,
      avg_roas: cumSpend > 0 ? Math.round((cumRev / cumSpend) * 1000) / 1000 : 0,
    };

    // Find channel_id if scoped
    const channelId = plat === "all"
      ? null
      : (channels ?? []).find((c: any) => c.platform === plat)?.id ?? null;

    const insertRow = {
      channel_id: channelId,
      platform: plat,
      scope_type: "platform",
      scope_id: plat,
      scope_label: plat === "all" ? "All channels" : plat,
      metric: "spend_revenue_roas",
      horizon_days: horizon,
      forecast_value: summary.cum_revenue,
      lower_bound: Math.round(series.reduce((s, p) => s + p.revenue_lower, 0) * 100) / 100,
      upper_bound: Math.round(series.reduce((s, p) => s + p.revenue_upper, 0) * 100) / 100,
      confidence: 0.80,
      model: "linreg_dow_seasonality_v1",
      series: { points: series, summary, strategy_mode: { goal, pace }, baseline: { roas: Math.round(baselineRoas * 1000) / 1000, daily_spend: Math.round(baselineSpend * 100) / 100, days: recent28Spend.length } },
      narrative: `${horizon}-day projection from ${dates.length} days of history, anchored on 28-day baseline ROAS ${baselineRoas.toFixed(2)}x. Goal ${goal}/100, Pace ${pace}/100.`,
      generated_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    };
    const { error } = await admin.from("ad_forecasts").insert(insertRow);
    if (error) {
      out.push({ platform: plat, ok: false, error: error.message });
    } else {
      out.push({ platform: plat, ok: true, points: series.length, summary });
    }
  }

  return J(200, { ok: true, generated_at: new Date().toISOString(), forecasts: out });
});