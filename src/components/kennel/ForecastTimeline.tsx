import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { TrendingUp, RefreshCw } from "lucide-react";
import {
  DateRangeControls, defaultStart, defaultEnd, todayUTC, isoDay, daysBetween, formatAxisDate,
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

const PLATFORM_OPTS = ["all", "meta", "google", "instacart"] as const;
type PlatformOpt = typeof PLATFORM_OPTS[number];

interface Props {
  /** If set, locks the timeline to a single platform (drill-down view). */
  lockPlatform?: "meta" | "google" | "instacart";
  /** Optional controlled range. When provided, overrides the internal pickers. */
  start?: Date;
  end?: Date;
  setStart?: (d: Date) => void;
  setEnd?: (d: Date) => void;
}

export function ForecastTimeline({ lockPlatform, start: startProp, end: endProp, setStart: setStartProp, setEnd: setEndProp }: Props) {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState<PlatformOpt>(lockPlatform ?? "all");
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

  const { data, isLoading } = useQuery({
    queryKey: ["forecast", activePlatform],
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
      if (ids.length === 0) return [] as Point[];
      const { data: rows } = await supabase
        .from("ad_performance_daily" as any)
        .select("date, spend, revenue, channel_id")
        .in("channel_id", ids)
        .gte("date", isoDay(start))
        .lte("date", isoDay(today))
        .order("date", { ascending: true });
      // Aggregate by date.
      const map = new Map<string, { spend: number; revenue: number }>();
      for (const r of (rows ?? []) as any[]) {
        const cur = map.get(r.date) ?? { spend: 0, revenue: 0 };
        cur.spend += Number(r.spend) || 0;
        cur.revenue += Number(r.revenue) || 0;
        map.set(r.date, cur);
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
    const future = (data?.series?.points ?? [])
      .filter((p) => p.date > todayIso)
      .slice(0, horizonDays);
    return [...hist, ...future];
  }, [data, history, horizonDays, today]);

  const summary = useMemo(() => {
    if (chartData.length === 0) return null;
    const cumSpend = chartData.reduce((s, p) => s + p.spend, 0);
    const cumRev = chartData.reduce((s, p) => s + p.revenue, 0);
    return {
      cumSpend,
      cumRev,
      avgRoas: cumSpend > 0 ? cumRev / cumSpend : 0,
      revLower: chartData.reduce((s, p) => s + p.revenue_lower, 0),
      revUpper: chartData.reduce((s, p) => s + p.revenue_upper, 0),
    };
  }, [chartData]);

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

  return (
    <section className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
      <header className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="text-xs uppercase tracking-brand font-bold text-foreground">Predictive Timeline</h2>
          <span className="text-[10px] uppercase tracking-brand text-muted-foreground">
            · {isoDay(start)} → {isoDay(end)} · {lookbackDays}d hist / {horizonDays}d horizon
          </span>
          {data?.generated_at && (
            <span className="text-[10px] uppercase tracking-brand text-muted-foreground">
              · model {data.confidence ? `${Math.round(data.confidence * 100)}% conf` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
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
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Stat label={`Spend (${horizonDays}d)`} value={`$${summary.cumSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              <Stat label={`Revenue (${horizonDays}d)`} value={`$${summary.cumRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                hint={`Range $${summary.revLower.toLocaleString(undefined, { maximumFractionDigits: 0 })} – $${summary.revUpper.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              <Stat label="Avg ROAS" value={`${summary.avgRoas.toFixed(2)}x`} />
              <Stat label="Net (rev − spend)" value={`$${(summary.cumRev - summary.cumSpend).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
            </div>
          )}
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
                <ReferenceLine yAxisId="left" x={isoDay(today)} stroke="hsl(var(--foreground))" strokeDasharray="2 2" label={{ value: "Today", position: "top", fontSize: 10 }} />
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