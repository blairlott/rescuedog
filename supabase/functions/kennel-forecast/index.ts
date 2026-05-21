// kennel-forecast: simple linear + 7-day seasonality projection over
// ad_performance_daily, writes to ad_forecasts. Optional platform filter.
// Reflects current strategy_mode (goal/pace) from ad_settings to tilt
// the projection.
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
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

/**
 * Calendar-month seasonal index (mean = 1.0) derived from per-day values.
 * Works on whatever history is supplied; needs at least one full year for
 * a meaningful all-12-month index — months without history default to 1.0.
 */
function monthlySeasonalFactors(dates: string[], ys: number[]): number[] {
  const sums = new Array(12).fill(0);
  const cnts = new Array(12).fill(0);
  for (let i = 0; i < dates.length; i++) {
    const m = new Date(dates[i] + "T00:00:00Z").getUTCMonth();
    sums[m] += ys[i];
    cnts[m] += 1;
  }
  const dailyByMonth = sums.map((s, i) => (cnts[i] ? s / cnts[i] : 0));
  const observed = dailyByMonth.filter((v) => v > 0);
  const mean = observed.length ? observed.reduce((a, b) => a + b, 0) / observed.length : 0;
  if (!mean) return new Array(12).fill(1);
  return dailyByMonth.map((v) => (v > 0 ? v / mean : 1));
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
  // Always pull a deep window (up to 4 years) for seasonal-index + Q4 YoY
  // estimation, independent of the user-selected lookback used for trend/CAGR.
  // We need ≥3 prior Q4s to compute a reliable apples-to-apples YoY growth.
  const seasonalSince = new Date(Date.now() - 1460 * 86400000).toISOString().slice(0, 10);
  const { data: channels } = await admin.from("ad_channels").select("id, platform");
  const chById = new Map<string, string>((channels ?? []).map((c: any) => [c.id, c.platform]));
  // Page through to get full history (Supabase caps at 1000/page).
  const pageAll = async (gteDate: string): Promise<any[]> => {
    const out: any[] = [];
    const pageSize = 1000; let from = 0;
    while (true) {
      const { data: rows } = await admin
        .from("ad_performance_daily")
        .select("channel_id, date, spend, revenue, conversions")
        .gte("date", gteDate)
        .order("date")
        .range(from, from + pageSize - 1);
      if (!rows || rows.length === 0) break;
      out.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return out;
  };
  const seasonalRowsRaw = await pageAll(seasonalSince);
  const rowsRaw = seasonalRowsRaw.filter((r: any) => r.date >= since);
  const rows: DailyRow[] = rowsRaw.map((r: any) => ({
    date: r.date,
    platform: chById.get(r.channel_id) ?? "unknown",
    spend: Number(r.spend ?? 0),
    revenue: Number(r.revenue ?? 0),
    conversions: Number(r.conversions ?? 0),
  }));
  const seasonalRows: DailyRow[] = seasonalRowsRaw.map((r: any) => ({
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

    // Monthly seasonal index computed on the deeper 24-month window so it
    // captures real calendar-month patterns even when lookback is short.
    const seasonalSubset = plat === "all" ? seasonalRows : seasonalRows.filter((r) => r.platform === plat);
    const seasonByDate = new Map<string, { spend: number; revenue: number }>();
    for (const r of seasonalSubset) {
      const cur = seasonByDate.get(r.date) ?? { spend: 0, revenue: 0 };
      cur.spend += r.spend; cur.revenue += r.revenue;
      seasonByDate.set(r.date, cur);
    }
    const seasonDates = Array.from(seasonByDate.keys()).sort();
    const seasonSpendSeries = seasonDates.map((d) => seasonByDate.get(d)!.spend);
    const seasonRevSeries   = seasonDates.map((d) => seasonByDate.get(d)!.revenue);
    const spendMonthSeason = monthlySeasonalFactors(seasonDates, seasonSpendSeries);
    const revMonthSeason   = monthlySeasonalFactors(seasonDates, seasonRevSeries);

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
    // ROAS guardrails: clamp implied daily ROAS to [0.3x, 3x] of recent baseline.
    const roasCeiling = baselineRoas > 0 ? baselineRoas * 3 : Number.POSITIVE_INFINITY;
    const roasFloor   = baselineRoas > 0 ? baselineRoas * 0.3 : 0;

    // ---- CAGR-based growth (DTC paid-media convention) --------------------
    // Compare trailing 90 days vs prior 90 days and annualize. Falls back to
    // shorter windows for thin history, and clamps to ±100% YoY to avoid
    // runaway compounding from a single noisy quarter.
    function cagr(series: number[]): number {
      const n = series.length;
      if (n < 60) return 0;
      const win = Math.min(90, Math.floor(n / 2));
      const recent = series.slice(n - win);
      const prior  = series.slice(n - 2 * win, n - win);
      const r = sum(recent), p = sum(prior);
      if (p <= 0 || r <= 0) return 0;
      const periodsPerYear = 365 / win;
      const growth = Math.pow(r / p, periodsPerYear) - 1;
      return Math.max(-0.5, Math.min(1.0, growth)); // clamp -50%..+100% YoY
    }
    const revCagr   = cagr(revSeries);
    const spendCagr = cagr(spendSeries);
    // Daily compounding factors derived from annual CAGR.
    const revDaily   = Math.pow(1 + revCagr,   1 / 365);
    const spendDaily = Math.pow(1 + spendCagr, 1 / 365);

    const series: any[] = [];
    let cumSpend = 0, cumRev = 0;
    // ---- Q4 historical anchor (data-derived, no hardcoded uplift) ---------
    // Wine + gifting are heavily seasonal — Q4 (OND) needs to be anchored to
    // prior-Q4 actuals, not a depressed off-season baseline. We compute YoY
    // growth from year-over-year Q4 deltas (apples-to-apples) instead of
    // assuming a fixed growth rate.
    type Q4Totals = { spend: number; revenue: number };
    const q4ByYearMonth = new Map<string, Q4Totals>(); // YYYY-MM -> totals
    for (const d of seasonDates) {
      const m = Number(d.slice(5, 7));
      if (m !== 10 && m !== 11 && m !== 12) continue;
      const ym = d.slice(0, 7);
      const cur = q4ByYearMonth.get(ym) ?? { spend: 0, revenue: 0 };
      const day = seasonByDate.get(d)!;
      cur.spend += day.spend; cur.revenue += day.revenue;
      q4ByYearMonth.set(ym, cur);
    }
    // Per-year Q4 totals (revenue + spend) for years that have all 3 OND months.
    const q4ByYear = new Map<number, Q4Totals & { monthsPresent: number }>();
    for (const [ym, v] of q4ByYearMonth.entries()) {
      const y = Number(ym.slice(0, 4));
      const cur = q4ByYear.get(y) ?? { spend: 0, revenue: 0, monthsPresent: 0 };
      cur.spend += v.spend; cur.revenue += v.revenue; cur.monthsPresent += 1;
      q4ByYear.set(y, cur);
    }
    // Measure YoY growth from CONSECUTIVE prior Q4s with complete data.
    // Geometric mean = apples-to-apples compounding rate. Clamp to a sane
    // range so a single anomalous year can't blow up multi-year projections.
    const sortedYears = Array.from(q4ByYear.keys())
      .filter((y) => (q4ByYear.get(y)!.monthsPresent >= 2) && q4ByYear.get(y)!.revenue > 0)
      .sort((a, b) => a - b);
    const yoyDeltas: number[] = [];
    for (let i = 1; i < sortedYears.length; i++) {
      const cur = q4ByYear.get(sortedYears[i])!.revenue;
      const prev = q4ByYear.get(sortedYears[i - 1])!.revenue;
      if (prev > 0 && cur > 0 && sortedYears[i] - sortedYears[i - 1] === 1) {
        yoyDeltas.push(cur / prev);
      }
    }
    const measuredYoy = yoyDeltas.length > 0
      ? Math.pow(yoyDeltas.reduce((a, b) => a * b, 1), 1 / yoyDeltas.length) - 1
      : 0;
    // Clamp: a single Q4 can be very volatile; cap at +75%/-25% YoY for
    // multi-year planning. (Wine/gift seasonal brands rarely sustain >75% YoY.)
    const q4YoyGrowth = Math.max(-0.25, Math.min(0.75, measuredYoy));
    // Reference Q4: average of the last 2 years (or whatever exists). Averaging
    // smooths anomalies; using a single peak overstates the floor.
    const refYears = sortedYears.slice(-2);
    const refMonth: Record<number, { spend: number; revenue: number; year: number; n: number }> = {};
    for (const y of refYears) {
      for (const m of [10, 11, 12]) {
        const ym = `${y}-${String(m).padStart(2, "0")}`;
        const v = q4ByYearMonth.get(ym);
        if (!v) continue;
        const cur = refMonth[m] ?? { spend: 0, revenue: 0, year: y, n: 0 };
        cur.spend += v.spend; cur.revenue += v.revenue; cur.n += 1;
        cur.year = Math.max(cur.year, y);
        refMonth[m] = cur;
      }
    }
    const q4FloorMonthly = (year: number, monthIdx0: number) => {
      const monthNum = monthIdx0 + 1;
      const ref = refMonth[monthNum];
      if (!ref || ref.n === 0) return null;
      const yearsAhead = Math.max(0, year - ref.year);
      const growthMult = Math.pow(1 + q4YoyGrowth, yearsAhead);
      const avgSpend = ref.spend / ref.n;
      const avgRev   = ref.revenue / ref.n;
      return {
        spendDay: (avgSpend * growthMult) / 30,
        revDay:   (avgRev * growthMult) / 30,
      };
    };
    for (let h = 1; h <= horizon; h++) {
      const futureDate = new Date(lastDate.getTime() + h * 86400000);
      const dow = futureDate.getUTCDay();
      const moy = futureDate.getUTCMonth();
      const uplift = ondUplift(futureDate);
      // CAGR-based projection: baseline daily × compounded growth × DoW seasonality.
      const growthSpend = Math.pow(spendDaily, h);
      const growthRev   = Math.pow(revDaily,   h);
      const rawSpend = Math.max(spendFloor, baselineSpend * growthSpend) * spendSeason[dow] * spendMonthSeason[moy] * spendTilt * uplift.spend;
      let trendSpend = rawSpend;
      const rawRev   = baselineRev * growthRev * revSeason[dow] * revMonthSeason[moy] * revenueTilt;
      let trendRev   = rawRev;
      // Apply Q4 historical floor (with YoY growth) so OND projections never
      // fall below the prior peak compounded at +100%/yr.
      const floor = q4FloorMonthly(futureDate.getUTCFullYear(), moy);
      if (floor) {
        const dowSpendIdx = spendSeason[dow];
        const dowRevIdx   = revSeason[dow];
        trendSpend = Math.max(trendSpend, floor.spendDay * dowSpendIdx * uplift.spend);
        trendRev   = Math.max(trendRev,   floor.revDay   * dowRevIdx);
      }
      if (trendSpend > 0 && baselineRoas > 0) {
        const implied = trendRev / trendSpend;
        // During Q4 (uplift active) widen the ROAS ceiling so historical Q4
        // efficiency isn't clamped down to a depressed off-season baseline.
        const ceilingActive = uplift.roas > 1 ? roasCeiling * 2.5 : roasCeiling;
        const targetRoas = Math.min(ceilingActive, Math.max(roasFloor, implied)) * roasTilt * uplift.roas;
        trendRev = trendSpend * targetRoas;
      }
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
      model: "cagr_dow_month_seasonality_v2",
      series: { points: series, summary, strategy_mode: { goal, pace }, baseline: { roas: Math.round(baselineRoas * 1000) / 1000, daily_spend: Math.round(baselineSpend * 100) / 100, daily_revenue: Math.round(baselineRev * 100) / 100, days: recent28Spend.length, revenue_cagr: Math.round(revCagr * 1000) / 1000, spend_cagr: Math.round(spendCagr * 1000) / 1000 }, seasonality: { dow_revenue: revSeason.map((v) => Math.round(v * 1000) / 1000), month_revenue: revMonthSeason.map((v) => Math.round(v * 1000) / 1000), month_spend: spendMonthSeason.map((v) => Math.round(v * 1000) / 1000), history_days: seasonDates.length } },
      narrative: `${horizon}-day projection: baseline ROAS ${baselineRoas.toFixed(2)}x, revenue CAGR ${(revCagr*100).toFixed(1)}%, spend CAGR ${(spendCagr*100).toFixed(1)}% (90d vs prior 90d, annualized). Seasonality: day-of-week + calendar-month (24mo, ${seasonDates.length} days observed). Goal ${goal}/100, Pace ${pace}/100.`,
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