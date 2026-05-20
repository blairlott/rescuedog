import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { Store, Info, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  DateRangeControls, defaultStart, defaultEnd, todayUTC, isoDay,
  monthKey, pickBucket, daysBetween, formatAxisDate,
} from "./DateRangeControls";
import { TileAiGuidance } from "./TileAiGuidance";

type DayPoint = {
  date: string;
  qb_revenue: number;
  depletion_revenue: number;
  instacart_revenue: number;
  projected: number;
};

const GROWTH_MAP: Record<string, number> = { flat: 0, g10: 0.10, g25: 0.25 };

/**
 * Build a normalized seasonal index (mean = 1.0) by calendar month from a
 * map of YYYY-MM-DD → QB revenue. Uses every full month present in the input.
 * Falls back to flat 1.0 if a month has no history.
 */
function buildSeasonalIndex(byDay: Map<string, { qb_revenue: number }>): number[] {
  const monthSums: number[] = new Array(12).fill(0);
  const monthDays: number[] = new Array(12).fill(0);
  for (const [day, row] of byDay.entries()) {
    const m = Number(day.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    monthSums[m] += row.qb_revenue;
    monthDays[m] += 1;
  }
  const dailyByMonth = monthSums.map((s, i) => (monthDays[i] ? s / monthDays[i] : 0));
  const observed = dailyByMonth.filter((v) => v > 0);
  const mean = observed.length ? observed.reduce((a, b) => a + b, 0) / observed.length : 0;
  if (!mean) return new Array(12).fill(1);
  return dailyByMonth.map((v) => (v > 0 ? v / mean : 1));
}

/** Historical CAGR from trailing 12 months vs the prior 12 months of QB revenue,
 * anchored to the supplied reference date (typically the latest QB activity). */
function computeHistoricalCagr(byDay: Map<string, { qb_revenue: number }>, ref: Date): number {
  const y1Start = new Date(ref); y1Start.setUTCDate(y1Start.getUTCDate() - 365);
  const y2Start = new Date(ref); y2Start.setUTCDate(y2Start.getUTCDate() - 730);
  let last12 = 0, prev12 = 0;
  for (const [day, row] of byDay.entries()) {
    const d = new Date(day + "T00:00:00Z");
    if (d >= y1Start && d < ref) last12 += row.qb_revenue;
    else if (d >= y2Start && d < y1Start) prev12 += row.qb_revenue;
  }
  if (prev12 <= 0 || last12 <= 0) return 0;
  return last12 / prev12 - 1;
}

/** Most recent date with non-zero QB revenue in the history map. */
function latestQbDate(byDay: Map<string, { qb_revenue: number }>): Date | null {
  let max: string | null = null;
  for (const [day, row] of byDay.entries()) {
    if (!row.qb_revenue) continue;
    if (!max || day > max) max = day;
  }
  return max ? new Date(max + "T00:00:00Z") : null;
}

function rangeLabel(start: Date, end: Date) {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `${fmt(start)} → ${fmt(end)}`;
}

/** Step through a date range and emit daily or monthly keys. */
function bucketIterator(start: Date, end: Date, bucket: "day" | "month"): string[] {
  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(bucket === "day" ? isoDay(cur) : monthKey(cur));
    if (bucket === "day") cur.setUTCDate(cur.getUTCDate() + 1);
    else cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  // de-dupe (in case of month bucket repeats)
  return Array.from(new Set(out));
}

export function BrickMortarTimeline({ start: startProp, end: endProp, setStart: setStartProp, setEnd: setEndProp, hidePicker }: {
  start?: Date; end?: Date; setStart?: (d: Date) => void; setEnd?: (d: Date) => void; hidePicker?: boolean;
} = {}) {
  const [startLocal, setStartLocal] = useState<Date>(defaultStart);
  const [endLocal, setEndLocal] = useState<Date>(defaultEnd);
  const start = startProp ?? startLocal;
  const end = endProp ?? endLocal;
  const setStart = setStartProp ?? setStartLocal;
  const setEnd = setEndProp ?? setEndLocal;
  const [growthKey, setGrowthKey] = useState<string>("flat");
  const today = todayUTC();
  const growth = GROWTH_MAP[growthKey] ?? 0;
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["bm-timeline-range"], type: "active" }),
        queryClient.refetchQueries({ queryKey: ["bm-history-qb"], type: "active" }),
      ]);
      toast.success("Brick & mortar timeline refreshed");
    } catch (e: any) {
      toast.error("Refresh failed", { description: e?.message ?? String(e) });
    } finally {
      setRefreshing(false);
    }
  };

  const observedEnd = end < today ? end : today;
  const projectStart = today;
  const totalSpanDays = Math.max(1, daysBetween(start, end));
  const bucket = pickBucket(totalSpanDays);
  const since = isoDay(start);
  const until = isoDay(observedEnd);

  // Trailing 24 months of QB data for CAGR + seasonal index — independent of selected range.
  const histStart = useMemo(() => {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() - 730); return d;
  }, [today]);
  const histSince = isoDay(histStart);
  const histUntil = isoDay(today);

  const { data: history } = useQuery({
    queryKey: ["bm-history-qb", histSince, histUntil],
    queryFn: async () => {
      const out: Array<{ date: string; amount_cents: number; channel: string | null }> = [];
      const pageSize = 1000; let from = 0;
      while (true) {
        const { data: rows } = await (supabase
          .from("bm_finance_entries" as any)
          .select("date, amount_cents, channel, entry_type")
          .gte("date", histSince).lte("date", histUntil)
          .in("entry_type", ["revenue", "income", "sales"])
          .order("date", { ascending: true })
          .range(from, from + pageSize - 1) as any);
        if (!rows || rows.length === 0) break;
        out.push(...rows);
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      const byDay = new Map<string, { qb_revenue: number }>();
      for (const r of out) {
        const ch = (r.channel ?? "").toLowerCase();
        if (ch === "dtc" || ch === "ecommerce") continue;
        const prev = byDay.get(r.date)?.qb_revenue ?? 0;
        byDay.set(r.date, { qb_revenue: prev + Number(r.amount_cents ?? 0) / 100 });
      }
      return { byDay };
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["bm-timeline-range", since, until],
    queryFn: async () => {
      const channelsRes = await supabase
        .from("ad_channels" as any)
        .select("id, platform");
      const instacartChannelIds = ((channelsRes.data ?? []) as any[])
        .filter((c) => c.platform === "instacart")
        .map((c) => c.id);

      // Paginated fetch — Supabase caps at 1000/page; .limit() above that silently truncates.
      const pageAll = async <T,>(builder: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> => {
        const out: T[] = [];
        const pageSize = 1000;
        let from = 0;
        while (true) {
          const { data: rows } = await Promise.resolve(builder(from, from + pageSize - 1));
          if (!rows || rows.length === 0) break;
          out.push(...rows);
          if (rows.length < pageSize) break;
          from += pageSize;
        }
        return out;
      };
      const [qbRows, depRows, icRows] = await Promise.all([
        pageAll<any>((f, t) => (supabase
          .from("bm_finance_entries" as any)
          .select("date, amount_cents, channel, entry_type")
          .gte("date", since).lte("date", until)
          .in("entry_type", ["revenue", "income", "sales"])
          .order("date", { ascending: true })
          .range(f, t) as any)),
        pageAll<any>((f, t) => (supabase
          .from("depletion_report_lines" as any)
          .select("period_end, units, cases")
          .gte("period_end", since).lte("period_end", until)
          .order("period_end", { ascending: true })
          .range(f, t) as any)),
        instacartChannelIds.length
          ? pageAll<any>((f, t) => (supabase
              .from("ad_performance_daily" as any)
              .select("date, revenue, channel_id")
              .gte("date", since).lte("date", until)
              .in("channel_id", instacartChannelIds)
              .order("date", { ascending: true })
              .range(f, t) as any))
          : Promise.resolve([] as any[]),
      ]);

      const byDay = new Map<string, DayPoint>();
      const ensure = (d: string) => {
        if (!byDay.has(d)) byDay.set(d, { date: d, qb_revenue: 0, depletion_revenue: 0, instacart_revenue: 0, projected: 0 });
        return byDay.get(d)!;
      };
      for (const r of qbRows) {
        const ch = (r.channel ?? "").toLowerCase();
        if (ch === "dtc" || ch === "ecommerce") continue;
        ensure(r.date).qb_revenue += Number(r.amount_cents ?? 0) / 100;
      }
      for (const r of depRows) {
        if (!r.period_end) continue;
        const units = Number(r.units ?? 0) || Number(r.cases ?? 0) * 12;
        // Market-level depletions, modeled at $9 FOB / bottle until SKU pricing lands.
        ensure(r.period_end).depletion_revenue += units * 9;
      }
      for (const r of icRows) {
        ensure(r.date).instacart_revenue += Number(r.revenue ?? 0);
      }
      return { byDay, qbRows: qbRows.length, depRows: depRows.length, icRows: icRows.length };
    },
  });

  const chart = useMemo(() => {
    if (!data) return { points: [] as any[], observedTotal: 0, projectedTotal: 0, dailyAvg: 0, cagr: 0, seasonal: new Array(12).fill(1) as number[] };

    // Build observed buckets (start..min(end, today))
    const observedKeys = bucketIterator(start, observedEnd, bucket);
    const observed = observedKeys.map((k) => {
      const point: any = { date: k, qb_revenue: 0, depletion_revenue: 0, instacart_revenue: 0, projected: null };
      if (bucket === "day") {
        const d = data.byDay.get(k);
        if (d) { point.qb_revenue = d.qb_revenue; point.depletion_revenue = d.depletion_revenue; point.instacart_revenue = d.instacart_revenue; }
      } else {
        // Aggregate all days in this month
        for (const [day, d] of data.byDay.entries()) {
          if (day.startsWith(k)) {
            point.qb_revenue += d.qb_revenue;
            point.depletion_revenue += d.depletion_revenue;
            point.instacart_revenue += d.instacart_revenue;
          }
        }
      }
      return point;
    });

    // Use independent 24-month QB history (or fall back to selected-range data) to derive
    // baseline daily run-rate, historical CAGR, and seasonal index by calendar month.
    const histByDay = history?.byDay ?? data.byDay;
    const seasonal = buildSeasonalIndex(histByDay);
    // Anchor baseline + CAGR to the latest QB activity date, not strict "today".
    // QuickBooks data lags real-time by days/weeks/months; using "today" would zero
    // out the trailing window whenever the feed is behind, killing the forecast.
    const anchor = latestQbDate(histByDay) ?? today;
    const histCagr = computeHistoricalCagr(histByDay, anchor);
    const baseStart = new Date(anchor); baseStart.setUTCDate(baseStart.getUTCDate() - 365);
    let baseSum = 0; let baseDays = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(baseStart); d.setUTCDate(d.getUTCDate() + i);
      const row = histByDay.get(isoDay(d));
      baseDays++;
      if (row) baseSum += row.qb_revenue;
    }
    const dailyAvg = baseDays ? baseSum / baseDays : 0;
    // "flat" mode = use historical CAGR; explicit g10/g25 = override the historical rate.
    const effectiveGrowth = growthKey === "flat" ? histCagr : growth;

    // Project from today → end using seasonal index × growth compounding.
    const projection: { date: string; projected: number }[] = [];
    if (end > today) {
      if (bucket === "day") {
        const days = daysBetween(today, end);
        for (let i = 1; i <= days; i++) {
          const d = new Date(today); d.setUTCDate(d.getUTCDate() + i);
          const yrs = i / 365;
          const m = d.getUTCMonth();
          projection.push({
            date: isoDay(d),
            projected: dailyAvg * seasonal[m] * Math.pow(1 + effectiveGrowth, yrs),
          });
        }
      } else {
        const cur = new Date(today);
        cur.setUTCDate(1); cur.setUTCMonth(cur.getUTCMonth() + 1);
        let m = 1;
        while (cur <= end) {
          const yrs = m / 12;
          // Days in this calendar month
          const daysInMonth = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0)).getUTCDate();
          const monthIdx = cur.getUTCMonth();
          projection.push({
            date: monthKey(cur),
            projected: dailyAvg * seasonal[monthIdx] * daysInMonth * Math.pow(1 + effectiveGrowth, yrs),
          });
          cur.setUTCMonth(cur.getUTCMonth() + 1);
          m++;
        }
      }
    }

    const points = [
      ...observed,
      ...projection.map((p) => ({ date: p.date, qb_revenue: null, depletion_revenue: null, instacart_revenue: null, projected: p.projected })),
    ];
    const observedTotal = observed.reduce((s, p) => s + (p.qb_revenue ?? 0), 0);
    const projectedTotal = projection.reduce((s, p) => s + p.projected, 0);
    return { points, observedTotal, projectedTotal, dailyAvg, cagr: histCagr, seasonal, anchor };
  }, [data, history, start, end, observedEnd, bucket, growth, growthKey, today]);

  const todayKey = bucket === "day" ? isoDay(today) : monthKey(today);

  return (
    <section className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
      <header className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Store className="h-4 w-4 text-primary" />
          <h2 className="text-xs uppercase tracking-brand font-bold text-foreground">Brick & Mortar Sales Timeline</h2>
          <span className="text-[10px] uppercase tracking-brand text-muted-foreground">· {rangeLabel(start, end)} · {bucket}ly</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap max-w-full">
        {hidePicker ? (
          <>
            <span className="text-[10px] uppercase tracking-brand text-muted-foreground mr-1">growth</span>
            {[
              { key: "flat", label: "Flat" },
              { key: "g10", label: "+10%/yr" },
              { key: "g25", label: "+25%/yr" },
            ].map((g) => (
              <button key={g.key} onClick={() => setGrowthKey(g.key)}
                className={`uppercase tracking-brand text-[10px] h-7 px-2 border-2 ${growthKey === g.key ? "bg-foreground text-background border-foreground" : "border-border text-foreground"}`}
                style={{ borderRadius: 0 }}>
                {g.label}
              </button>
            ))}
          </>
        ) : (
          <DateRangeControls start={start} end={end} setStart={setStart} setEnd={setEnd}
            growthKey={growthKey} setGrowthKey={setGrowthKey} />
        )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="uppercase tracking-brand text-[10px] h-7 px-2 border-2 border-border text-foreground hover:bg-foreground hover:text-background flex items-center gap-1 disabled:opacity-60"
            style={{ borderRadius: 0 }}
            title="Refresh data"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <CaveatBanner
        title="QuickBooks = source of truth · Depletions & Instacart = signals only"
        items={[
          "QuickBooks is the source of truth for actual wholesale/B&M dollars — ledger-based, refreshed nightly, only entries tagged wholesale/B&M are counted here.",
          "Depletion reports are SIGNALS — market-level distributor totals shown as a directional cross-check against QB. They are NOT added to revenue totals or the projection base (would double-count QB dollars).",
          "Because depletions are market-level, account-level velocity metrics (CPPW, TDP, sell-through by store) are not computable today and won't be until scan data (Nielsen/Circana) or distributor account-level feeds land.",
          "Instacart: ad-attributed revenue from Instacart Ads — shown as a SIGNAL only. Not added to B&M totals.",
          "Projection past today uses a trailing 365-day QB baseline, scaled by a calendar-month seasonal index (24mo of QB history, mean = 1.0) and compounded by historical CAGR (last 12mo vs prior 12mo). Selecting +10%/+25% overrides the CAGR. Not MMM.",
        ]}
      />

      {isLoading || !data ? (
        <div className="text-sm text-muted-foreground">Loading brick & mortar data…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Observed (QB only)" value={`$${Math.round(chart.observedTotal).toLocaleString()}`} hint={`${isoDay(start)} → ${isoDay(observedEnd)}`} />
            <Stat label="Trailing 365d / day" value={`$${Math.round(chart.dailyAvg).toLocaleString()}`} hint={`QB base · anchor ${isoDay(chart.anchor)} · CAGR ${(chart.cagr * 100).toFixed(1)}%`} />
            <Stat label="Projected" value={`$${Math.round(chart.projectedTotal).toLocaleString()}`} hint={end > today ? `${isoDay(today)} → ${isoDay(end)} · ${growthKey === "flat" ? "historical CAGR" : growthKey} · seasonal` : "no future range"} />
            <Stat label="Observed + Projected" value={`$${Math.round(chart.observedTotal + chart.projectedTotal).toLocaleString()}`} hint={`${data.qbRows.toLocaleString()} QB · ${data.depRows.toLocaleString()} dep lines`} />
          </div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={chart.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <pattern id="depletionStripe" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill="hsl(220 70% 45% / 0.18)" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="hsl(220 70% 45% / 0.55)" strokeWidth="2" />
                  </pattern>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={32} tickFormatter={formatAxisDate} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                <Tooltip
                  contentStyle={{ borderRadius: 0, border: "2px solid hsl(var(--foreground))", fontSize: 12 }}
                  formatter={(value: any, name: string) => [`$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine x={todayKey} stroke="hsl(var(--foreground))" strokeDasharray="2 2" label={{ value: "today", position: "top", fontSize: 10, fill: "hsl(var(--foreground))" }} />
                <Area type="monotone" dataKey="qb_revenue" stackId="actual" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.35)" name="QuickBooks (wholesale)" />
                <Line type="monotone" dataKey="depletion_revenue" stroke="hsl(220 70% 45%)" strokeWidth={1.5} strokeDasharray="3 3" dot={false} name="Depletions (signal · modeled @ $9/btl)" />
                <Line type="monotone" dataKey="instacart_revenue" stroke="hsl(30 90% 50%)" strokeWidth={1.5} strokeDasharray="3 3" dot={false} name="Instacart (signal · ad-attributed)" />
                <Line type="monotone" dataKey="projected" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="4 4" dot={false} name={`Projection (${growthKey})`} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <TileAiGuidance
            tileId="brick-mortar"
            rangeLabel={rangeLabel(start, end)}
            tileData={{
              model: "trailing 365-day QB baseline × calendar-month seasonal index × historical CAGR (or growth override), not MMM",
              growth_mode: growthKey,
              historical_cagr: chart.cagr,
              seasonal_index_by_month: chart.seasonal,
              observed_revenue: chart.observedTotal,
              projected_revenue: chart.projectedTotal,
              daily_average: chart.dailyAvg,
              source_rows: { quickbooks: data.qbRows, depletions: data.depRows, instacart: data.icRows },
            }}
          />
        </>
      )}
    </section>
  );
}

const HALO_COEFFICIENT = 0.08;

export function BrandLiftTimeline({ start: startProp, end: endProp, setStart: setStartProp, setEnd: setEndProp, hidePicker }: {
  start?: Date; end?: Date; setStart?: (d: Date) => void; setEnd?: (d: Date) => void; hidePicker?: boolean;
} = {}) {
  const [startLocal, setStartLocal] = useState<Date>(defaultStart);
  const [endLocal, setEndLocal] = useState<Date>(defaultEnd);
  const start = startProp ?? startLocal;
  const end = endProp ?? endLocal;
  const setStart = setStartProp ?? setStartLocal;
  const setEnd = setEndProp ?? setEndLocal;
  const [growthKey, setGrowthKey] = useState<string>("flat");
  const today = todayUTC();
  const growth = GROWTH_MAP[growthKey] ?? 0;

  const observedEnd = end < today ? end : today;
  const totalSpanDays = Math.max(1, daysBetween(start, end));
  const bucket = pickBucket(totalSpanDays);
  const since = isoDay(start);
  const until = isoDay(observedEnd);

  const { data, isLoading } = useQuery({
    queryKey: ["brand-lift-range", since, until],
    queryFn: async () => {
      const channelsRes = await supabase
        .from("ad_channels" as any)
        .select("id, platform");
      const channels = (channelsRes.data ?? []) as any[];
      const channelMap = new Map(channels.map((c) => [c.id, c]));
      const dtcIds = channels.filter((c) => ["meta", "google"].includes(c.platform)).map((c) => c.id);

      const { data: rows } = dtcIds.length
        ? await supabase
            .from("ad_performance_daily" as any)
            .select("date, spend, conversions, revenue, channel_id")
            .gte("date", since).lte("date", until)
            .in("channel_id", dtcIds)
            .limit(200000)
        : { data: [] as any[] };

      const byDay = new Map<string, { date: string; dtc_spend: number; dtc_revenue: number; modeled_lift: number }>();
      for (const r of (rows ?? []) as any[]) {
        const ch = channelMap.get(r.channel_id);
        const platform = ch?.platform ?? "";
        const objective = (ch?.objective ?? "").toLowerCase();
        const isConversion = objective.includes("conversion") || objective.includes("sales") || objective.includes("purchase");
        if (!["meta", "google"].includes(platform)) continue;
        const d = r.date;
        if (!byDay.has(d)) byDay.set(d, { date: d, dtc_spend: 0, dtc_revenue: 0, modeled_lift: 0 });
        const row = byDay.get(d)!;
        const spend = Number(r.spend ?? 0);
        row.dtc_spend += spend;
        row.dtc_revenue += Number(r.revenue ?? 0);
        row.modeled_lift += spend * (isConversion ? HALO_COEFFICIENT : HALO_COEFFICIENT / 2);
      }
      return { byDay };
    },
  });

  const chart = useMemo(() => {
    if (!data) return { points: [] as any[], totalSpend: 0, totalLift: 0, totalDtcRev: 0, avgDailySpend: 0, avgDailyLift: 0, projSpend: 0, projLift: 0 };

    // Observed buckets
    const keys = bucketIterator(start, observedEnd, bucket);
    const observed = keys.map((k) => {
      const row: any = { date: k, dtc_spend: 0, dtc_revenue: 0, modeled_lift: 0, cumulative_lift: 0, _observed: true };
      if (bucket === "day") {
        const d = data.byDay.get(k);
        if (d) { row.dtc_spend = d.dtc_spend; row.dtc_revenue = d.dtc_revenue; row.modeled_lift = d.modeled_lift; }
      } else {
        for (const [day, d] of data.byDay.entries()) {
          if (day.startsWith(k)) {
            row.dtc_spend += d.dtc_spend;
            row.dtc_revenue += d.dtc_revenue;
            row.modeled_lift += d.modeled_lift;
          }
        }
      }
      return row;
    });

    // Trailing 90-day daily averages from real data
    const trailingStart = new Date(today); trailingStart.setUTCDate(trailingStart.getUTCDate() - 90);
    let spendSum = 0, liftSum = 0, n = 0;
    for (let i = 0; i < 90; i++) {
      const d = new Date(trailingStart); d.setUTCDate(d.getUTCDate() + i);
      const r = data.byDay.get(isoDay(d));
      n++;
      if (r) { spendSum += r.dtc_spend; liftSum += r.modeled_lift; }
    }
    const avgDailySpend = n ? spendSum / n : 0;
    const avgDailyLift = n ? liftSum / n : 0;

    // Project
    const projection: any[] = [];
    if (end > today) {
      if (bucket === "day") {
        const days = daysBetween(today, end);
        for (let i = 1; i <= days; i++) {
          const d = new Date(today); d.setUTCDate(d.getUTCDate() + i);
          const yrs = i / 365;
          projection.push({
            date: isoDay(d),
            dtc_spend: avgDailySpend * Math.pow(1 + growth, yrs),
            dtc_revenue: null,
            modeled_lift: avgDailyLift * Math.pow(1 + growth, yrs),
            cumulative_lift: 0,
            _observed: false,
          });
        }
      } else {
        const cur = new Date(today); cur.setUTCDate(1); cur.setUTCMonth(cur.getUTCMonth() + 1);
        let m = 1;
        while (cur <= end) {
          const yrs = m / 12;
          projection.push({
            date: monthKey(cur),
            dtc_spend: avgDailySpend * 30 * Math.pow(1 + growth, yrs),
            dtc_revenue: null,
            modeled_lift: avgDailyLift * 30 * Math.pow(1 + growth, yrs),
            cumulative_lift: 0,
            _observed: false,
          });
          cur.setUTCMonth(cur.getUTCMonth() + 1);
          m++;
        }
      }
    }

    const all = [...observed, ...projection];
    let cum = 0;
    for (const r of all) { cum += (r.modeled_lift ?? 0); r.cumulative_lift = cum; }

    const totalSpend = observed.reduce((s, p) => s + p.dtc_spend, 0);
    const totalLift = observed.reduce((s, p) => s + p.modeled_lift, 0);
    const totalDtcRev = observed.reduce((s, p) => s + p.dtc_revenue, 0);
    const projSpend = projection.reduce((s, p) => s + p.dtc_spend, 0);
    const projLift = projection.reduce((s, p) => s + p.modeled_lift, 0);
    return { points: all, totalSpend, totalLift, totalDtcRev, avgDailySpend, avgDailyLift, projSpend, projLift };
  }, [data, start, end, observedEnd, bucket, growth, today]);

  const todayKey = bucket === "day" ? isoDay(today) : monthKey(today);

  return (
    <section className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
      <header className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" />
          <h2 className="text-xs uppercase tracking-brand font-bold text-foreground">Brand Lift Model — DTC Ads → B&M Halo</h2>
          <span className="text-[10px] uppercase tracking-brand text-muted-foreground">· {rangeLabel(start, end)} · {bucket}ly</span>
        </div>
        {hidePicker ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-brand text-muted-foreground mr-1">growth</span>
            {[
              { key: "flat", label: "Flat" },
              { key: "g10", label: "+10%/yr" },
              { key: "g25", label: "+25%/yr" },
            ].map((g) => (
              <button key={g.key} onClick={() => setGrowthKey(g.key)}
                className={`uppercase tracking-brand text-[10px] h-7 px-2 border-2 ${growthKey === g.key ? "bg-foreground text-background border-foreground" : "border-border text-foreground"}`}
                style={{ borderRadius: 0 }}>
                {g.label}
              </button>
            ))}
          </div>
        ) : (
          <DateRangeControls start={start} end={end} setStart={setStart} setEnd={setEnd}
            growthKey={growthKey} setGrowthKey={setGrowthKey} />
        )}
      </header>

      <CaveatBanner
        title="Modeled estimate — not measured incrementality"
        items={[
          `Halo coefficient is a literature prior (${(HALO_COEFFICIENT * 100).toFixed(0)}% of conversion-ad spend → incremental off-premise sales, half that for awareness).`,
          "True incrementality needs holdout tests or a media-mix model (MMM). Treat this as a planning floor, not attribution.",
          "Inputs are real Meta + Google daily spend/conversion data over the selected range. Retail media (Walmart Connect, Kroger Precision) and Yahoo DSP not yet ingested.",
          "Projection past today uses trailing 90-day daily Meta+Google spend (real data) compounded by selected growth rate.",
        ]}
      />

      {isLoading || !data ? (
        <div className="text-sm text-muted-foreground">Loading lift model…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Observed spend" value={`$${Math.round(chart.totalSpend).toLocaleString()}`} hint="actual Meta+Google" />
            <Stat label="Observed lift" value={`$${Math.round(chart.totalLift).toLocaleString()}`} hint={`at ${(HALO_COEFFICIENT * 100).toFixed(0)}% halo`} />
            <Stat label="Projected spend" value={`$${Math.round(chart.projSpend).toLocaleString()}`} hint={growthKey} />
            <Stat label="Projected lift" value={`$${Math.round(chart.projLift).toLocaleString()}`} hint={growthKey} />
          </div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={chart.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={32} tickFormatter={formatAxisDate} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                <Tooltip
                  contentStyle={{ borderRadius: 0, border: "2px solid hsl(var(--foreground))", fontSize: 12 }}
                  formatter={(value: any, name: string) => [`$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine yAxisId="left" x={todayKey} stroke="hsl(var(--foreground))" strokeDasharray="2 2" label={{ value: "today", position: "top", fontSize: 10, fill: "hsl(var(--foreground))" }} />
                <Line yAxisId="left" type="monotone" dataKey="dtc_spend" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} name="DTC spend" />
                <Line yAxisId="left" type="monotone" dataKey="modeled_lift" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Modeled B&M lift" />
                <Area yAxisId="right" type="monotone" dataKey="cumulative_lift" stroke="hsl(220 70% 45%)" fill="hsl(220 70% 45% / 0.15)" name="Cumulative lift" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <TileAiGuidance
            tileId="brand-lift"
            rangeLabel={rangeLabel(start, end)}
            tileData={{
              model: "literature-prior halo coefficient, not measured incrementality or MMM",
              growth_mode: growthKey,
              halo_coefficient: HALO_COEFFICIENT,
              observed_dtc_spend: chart.totalSpend,
              observed_modeled_lift: chart.totalLift,
              observed_dtc_revenue: chart.totalDtcRev,
              projected_dtc_spend: chart.projSpend,
              projected_modeled_lift: chart.projLift,
            }}
          />
        </>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-border p-2" style={{ borderRadius: 0 }}>
      <div className="text-[10px] uppercase tracking-brand text-muted-foreground">{label}</div>
      <div className="text-lg font-bold text-foreground tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function CaveatBanner({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="border-2 border-foreground bg-muted/40 p-3 mb-4 flex items-start gap-3" style={{ borderRadius: 0 }}>
      <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 text-[11px] text-foreground leading-relaxed">
        <div className="uppercase tracking-brand font-bold mb-1">{title}</div>
        <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      </div>
    </div>
  );
}