import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, ReferenceArea,
} from "recharts";
import { TrendingUp, RefreshCw, Info } from "lucide-react";
import {
  DateRangeControls, defaultStart, defaultEnd, todayUTC, isoDay, daysBetween, formatAxisDate, pickBucket,
} from "./DateRangeControls";

type Point = {
  date: string;
  spend: number;
  revenue: number;
  revenue_lower: number;
  revenue_upper: number;
  roas: number;
};

type ForecastRow = {
  id: string;
  platform: string;
  horizon_days: number;
  forecast_value: number;
  lower_bound: number;
  upper_bound: number;
  confidence: number;
  series: { points: Point[]; summary?: { cum_spend: number; cum_revenue: number; avg_roas: number }; strategy_mode?: { goal: number; pace: number } };
  narrative: string;
  generated_at: string;
};

const PLATFORM_OPTS = ["all", "meta", "google"] as const;
type PlatformOpt = typeof PLATFORM_OPTS[number];

interface Props {
  /** If set, locks the timeline to a single platform (drill-down view). */
  lockPlatform?: "meta" | "google" | "instacart";
  /** Optional controlled range. When provided, overrides the internal pickers. */
  start?: Date;
  end?: Date;
  setStart?: (d: Date) => void;
  setEnd?: (d: Date) => void;
  /** When the range picker is rendered higher up in the page, hide this tile's copy. */
  hidePicker?: boolean;
}

export function ForecastTimeline({ lockPlatform, start: startProp, end: endProp, setStart: setStartProp, setEnd: setEndProp, hidePicker }: Props) {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState<PlatformOpt>(
    (lockPlatform && (PLATFORM_OPTS as readonly string[]).includes(lockPlatform) ? lockPlatform : "all") as PlatformOpt
  );
  const [busy, setBusy] = useState(false);
  const [startLocal, setStartLocal] = useState<Date>(defaultStart);
  const [endLocal, setEndLocal] = useState<Date>(defaultEnd);
  const start = startProp ?? startLocal;
  const end = endProp ?? endLocal;
  const setStart = setStartProp ?? setStartLocal;
  const setEnd = setEndProp ?? setEndLocal;
  const today = todayUTC();
  const lookbackDays = Math.max(30, daysBetween(start, today));
  const horizonDays = Math.max(1, Math.min(1095, daysBetween(today, end > today ? end : today)));

  const activePlatform = lockPlatform ?? platform;
  const spanDays = Math.max(1, daysBetween(start, end));
  const bucket = pickBucket(spanDays);
  const keyOf = (date: string) => bucket === "day" ? date : date.slice(0, 7);

  const { data, isLoading } = useQuery({
    queryKey: ["forecast", activePlatform, horizonDays, lookbackDays],
    queryFn: async () => {
      const { data } = await supabase
        .from("ad_forecasts" as any)
        .select("id, platform, horizon_days, forecast_value, lower_bound, upper_bound, confidence, series, narrative, generated_at")
        .eq("platform", activePlatform)
        .eq("scope_type", "platform")
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as any) as ForecastRow | null;
    },
  });

  // Historical actuals from ad_performance_daily, joined to platform via ad_channels.
  const { data: history } = useQuery({
    queryKey: ["forecast-history", activePlatform, isoDay(start), isoDay(today)],
    queryFn: async () => {
      const { data: channels } = await supabase
        .from("ad_channels" as any)
        .select("id, platform");
      const ids = (channels ?? [])
        .filter((c: any) => activePlatform === "all" ? true : c.platform === activePlatform)
        .map((c: any) => c.id);
      const startIso = isoDay(start);
      const todayIso = isoDay(today);

      // 1) Paid spend + paid-attributed revenue from ad_performance_daily.
      const map = new Map<string, { spend: number; revenue: number }>();
      if (ids.length > 0) {
        // Page through to bypass the 1000-row default cap.
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data: rows } = await supabase
            .from("ad_performance_daily" as any)
            .select("date, spend, revenue, channel_id")
            .in("channel_id", ids)
            .gte("date", startIso)
            .lte("date", todayIso)
            .order("date", { ascending: true })
            .range(from, from + pageSize - 1);
          if (!rows || rows.length === 0) break;
          for (const r of rows as any[]) {
            const k = keyOf(r.date);
            const cur = map.get(k) ?? { spend: 0, revenue: 0 };
            cur.spend += Number(r.spend) || 0;
            cur.revenue += Number(r.revenue) || 0;
            map.set(k, cur);
          }
          if (rows.length < pageSize) break;
          from += pageSize;
        }
      }

      // 2) Life-of-brand revenue from business_revenue_facts (only when viewing "all").
      //    This gives us actual revenue going back to 2019 even if paid ads don't.
      if (activePlatform === "all") {
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data: rows } = await supabase
            .from("business_revenue_facts" as any)
            .select("date, net_revenue_cents")
            .gte("date", startIso)
            .lte("date", todayIso)
            .order("date", { ascending: true })
            .range(from, from + pageSize - 1);
          if (!rows || rows.length === 0) break;
          for (const r of rows as any[]) {
            const k = keyOf(r.date);
            const cur = map.get(k) ?? { spend: 0, revenue: 0 };
            cur.revenue += (Number(r.net_revenue_cents) || 0) / 100;
            map.set(k, cur);
          }
          if (rows.length < pageSize) break;
          from += pageSize;
        }
      }

      return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
          date,
          spend: v.spend,
          revenue: v.revenue,
          revenue_lower: v.revenue,
          revenue_upper: v.revenue,
          roas: v.spend > 0 ? v.revenue / v.spend : 0,
        })) as Point[];
    },
  });

  const chartData = useMemo(() => {
    const todayIso = isoDay(today);
    const hist = (history ?? []).filter((p) => p.date <= todayIso);
    // Re-bucket the forecast series so its granularity matches history (avoids a daily/monthly
    // x-axis cliff at the "today" boundary on long ranges).
    const futRaw = (data?.series?.points ?? [])
      .filter((p) => p.date > todayIso)
      .slice(0, horizonDays);
    const futMap = new Map<string, Point>();
    for (const p of futRaw) {
      const k = keyOf(p.date);
      const cur = futMap.get(k);
      if (!cur) {
        futMap.set(k, { ...p, date: k });
      } else {
        cur.spend += p.spend;
        cur.revenue += p.revenue;
        cur.revenue_lower += p.revenue_lower;
        cur.revenue_upper += p.revenue_upper;
      }
    }
    const future = Array.from(futMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => ({ ...p, roas: p.spend > 0 ? p.revenue / p.spend : 0 }));
    return [...hist, ...future];
  }, [data, history, horizonDays, today, bucket]);

  // Boundary tick = the date where forecast begins (first future point), or today if absent.
  const boundaryDate = useMemo(() => {
    const todayIso = isoDay(today);
    const firstFuture = chartData.find((p) => p.date > todayIso);
    const lastHist = [...chartData].reverse().find((p) => p.date <= todayIso);
    return firstFuture?.date ?? lastHist?.date ?? todayIso;
  }, [chartData, today]);
  const forecastEndDate = chartData.length ? chartData[chartData.length - 1].date : boundaryDate;

  const summary = useMemo(() => {
    if (chartData.length === 0) return null;
    const todayIso = isoDay(today);
    const hist = chartData.filter((p) => p.date <= todayIso);
    const fut  = chartData.filter((p) => p.date >  todayIso);
    const sum = (arr: typeof chartData, k: keyof Point) => arr.reduce((s, p) => s + (Number(p[k]) || 0), 0);
    const histSpend = sum(hist, "spend"); const histRev = sum(hist, "revenue");
    const futSpend  = sum(fut,  "spend"); const futRev  = sum(fut,  "revenue");
    return {
      histSpend, histRev,
      futSpend,  futRev,
      avgHistRoas: histSpend > 0 ? histRev / histSpend : 0,
      avgFutRoas:  futSpend  > 0 ? futRev  / futSpend  : 0,
      futRevLower: sum(fut, "revenue_lower"),
      futRevUpper: sum(fut, "revenue_upper"),
    };
  }, [chartData, today]);

  const generate = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("kennel-forecast", {
        body: {
          platform: activePlatform === "all" ? undefined : activePlatform,
          horizon_days: horizonDays,
          lookback_days: lookbackDays,
        },
      });
      if (error) throw error;
      toast.success(`Forecast generated (${lookbackDays}d history → ${horizonDays}d horizon)`);
      await qc.invalidateQueries({ queryKey: ["forecast"] });
    } catch (e: any) {
      toast.error("Forecast failed", { description: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  };

  // Auto-regenerate the forecast whenever the date range or platform changes.
  // Debounce so dragging the date inputs doesn't fire on every keystroke.
  const firstRunRef = useRef(true);
  useEffect(() => {
    if (firstRunRef.current) { firstRunRef.current = false; return; }
    if (busy) return;
    const t = setTimeout(() => { generate(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isoDay(start), isoDay(end), activePlatform]);

  return (
    <section className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
      <header className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="text-xs uppercase tracking-brand font-bold text-foreground">DTC E-commerce · Paid Media Predictive Timeline</h2>
          <span className="text-[10px] uppercase tracking-brand text-muted-foreground">
            · {isoDay(start)} → {isoDay(end)} · {lookbackDays}d hist / {horizonDays}d horizon
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {data?.generated_at && (
            <span className="text-[10px] uppercase tracking-brand text-muted-foreground mr-2">
              {data.confidence ? `${Math.round(data.confidence * 100)}% conf · ` : ""}
              {relativeTime(data.generated_at)}
            </span>
          )}
          {!lockPlatform && (
            <div className="flex gap-1 mr-2">
              {PLATFORM_OPTS.map((p) => (
                <Button key={p} size="sm" variant={platform === p ? "default" : "outline"}
                  onClick={() => setPlatform(p)} style={{ borderRadius: 0 }}
                  className="uppercase tracking-brand text-[10px] h-7 px-2"
                >
                  {p}
                </Button>
              ))}
            </div>
          )}
          {hidePicker ? (
            <Button size="sm" variant="outline" onClick={generate} disabled={busy}
              style={{ borderRadius: 0 }} className="uppercase tracking-brand text-[10px] h-7 px-2 ml-1"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${busy ? "animate-spin" : ""}`} />
              {busy ? "Modeling…" : "Regenerate"}
            </Button>
          ) : (
            <DateRangeControls
              start={start} end={end} setStart={setStart} setEnd={setEnd}
              extraSlot={
                <Button size="sm" variant="outline" onClick={generate} disabled={busy}
                  style={{ borderRadius: 0 }} className="uppercase tracking-brand text-[10px] h-7 px-2 ml-1"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${busy ? "animate-spin" : ""}`} />
                  {busy ? "Modeling…" : "Regenerate"}
                </Button>
              }
            />
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading forecast…</div>
      ) : !data ? (
        <div className="border-2 border-dashed border-border p-6 text-center" style={{ borderRadius: 0 }}>
          <p className="text-sm text-muted-foreground mb-3">
            No forecast yet for <strong className="uppercase tracking-brand">{activePlatform}</strong>. Generate one from {lookbackDays} days of real performance data.
          </p>
          <Button size="sm" onClick={generate} disabled={busy} style={{ borderRadius: 0 }} className="uppercase tracking-brand text-xs">
            <RefreshCw className={`h-3 w-3 mr-1 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Modeling…" : "Generate forecast"}
          </Button>
        </div>
      ) : (
        <>
          <div className="border-2 border-foreground bg-muted/40 p-3 mb-4 flex items-start gap-3" style={{ borderRadius: 0 }}>
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 text-[11px] text-foreground leading-relaxed">
              <div className="uppercase tracking-brand font-bold mb-1">DTC e-commerce only · naive trend + day-of-week seasonality (not MMM)</div>
              <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                <li>Scope: paid Meta + Google spend driving <strong>DTC website revenue only</strong>. Excludes wholesale/B&M (see Brick & Mortar tile) and Instacart.</li>
                <li>Linear regression on the lookback window plus a 7-day seasonality pattern. Strategy-mode sliders tilt spend, revenue, and ROAS within ±15–30%.</li>
                <li>Range bands are ±1.96σ on residuals — directional confidence, not a guarantee.</li>
                <li>Long horizons (1–3 years) extrapolate trend confidently — treat as a planning baseline, not a budget commit.</li>
                <li>Actuals before today: <strong>ad_performance_daily</strong> (paid spend + attributed DTC revenue) plus <strong>business_revenue_facts</strong> (total DTC net revenue) when viewing All.</li>
              </ul>
            </div>
          </div>
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Stat
                label={`Actual Spend · ${isoDay(start).slice(0,7)} → today`}
                value={`$${summary.histSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                hint={`Avg ROAS ${summary.avgHistRoas.toFixed(2)}x`}
              />
              <Stat
                label={`Actual Revenue · ${isoDay(start).slice(0,7)} → today`}
                value={`$${summary.histRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              />
              <Stat
                label={`Forecast Spend · next ${horizonDays}d`}
                value={`$${summary.futSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                hint={`Avg ROAS ${summary.avgFutRoas.toFixed(2)}x`}
              />
              <Stat
                label={`Forecast Revenue · next ${horizonDays}d`}
                value={`$${summary.futRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                hint={`Range $${summary.futRevLower.toLocaleString(undefined, { maximumFractionDigits: 0 })} – $${summary.futRevUpper.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              />
            </div>
          )}
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 24, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={32} tickFormatter={formatAxisDate} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(1)}x`} />
                <Tooltip
                  contentStyle={{ borderRadius: 0, border: "2px solid hsl(var(--foreground))", fontSize: 12 }}
                  formatter={(value: any, name: string) => {
                    if (name === "ROAS") return [`${Number(value).toFixed(2)}x`, name];
                    return [`$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceArea
                  yAxisId="left"
                  x1={boundaryDate}
                  x2={forecastEndDate}
                  fill="hsl(var(--primary) / 0.06)"
                  stroke="none"
                  label={{ value: "FORECAST →", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                <ReferenceLine
                  yAxisId="left"
                  x={boundaryDate}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  label={{ value: "TODAY", position: "insideBottomLeft", fontSize: 10, fill: "hsl(var(--primary))", fontWeight: 700, offset: 6 }}
                />
                <Area yAxisId="left" dataKey="revenue_upper" stroke="none" fill="hsl(var(--primary) / 0.15)" name="Revenue range" stackId="band" />
                <Area yAxisId="left" dataKey="revenue_lower" stroke="none" fill="hsl(var(--background))" stackId="band" legendType="none" />
                <Line yAxisId="left" type="monotone" dataKey="spend" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} name="Spend" />
                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Revenue" />
                <Line yAxisId="right" type="monotone" dataKey="roas" stroke="hsl(220 70% 45%)" strokeWidth={2} strokeDasharray="4 4" dot={false} name="ROAS" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {data?.narrative && (
            <p className="mt-3 text-[11px] text-muted-foreground">{data.narrative}</p>
          )}
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

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}