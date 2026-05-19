import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { TrendingUp, RefreshCw } from "lucide-react";

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

const HORIZONS = [30, 60, 90] as const;
type Horizon = typeof HORIZONS[number];

const LOOKBACKS = [
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "2y", days: 730 },
  { label: "3y", days: 1095 },
] as const;
type LookbackDays = typeof LOOKBACKS[number]["days"];

const PLATFORM_OPTS = ["all", "meta", "google", "instacart"] as const;
type PlatformOpt = typeof PLATFORM_OPTS[number];

interface Props {
  /** If set, locks the timeline to a single platform (drill-down view). */
  lockPlatform?: "meta" | "google" | "instacart";
}

export function ForecastTimeline({ lockPlatform }: Props) {
  const qc = useQueryClient();
  const [horizon, setHorizon] = useState<Horizon>(30);
  const [platform, setPlatform] = useState<PlatformOpt>(lockPlatform ?? "all");
  const [busy, setBusy] = useState(false);
  const [lookbackDays, setLookbackDays] = useState<LookbackDays>(1095);

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

  const chartData = useMemo(() => {
    if (!data?.series?.points) return [];
    return data.series.points.slice(0, horizon);
  }, [data, horizon]);

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
          horizon_days: 90,
          lookback_days: lookbackDays,
        },
      });
      if (error) throw error;
      toast.success(`Forecast generated (${lookbackDays}d history)`);
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
          <span className="text-[10px] uppercase tracking-brand text-muted-foreground mr-1">history</span>
          {LOOKBACKS.map((l) => (
            <Button key={l.days} size="sm" variant={lookbackDays === l.days ? "default" : "outline"}
              onClick={() => setLookbackDays(l.days)} style={{ borderRadius: 0 }}
              className="uppercase tracking-brand text-[10px] h-7 px-2"
            >
              {l.label}
            </Button>
          ))}
          <span className="text-[10px] uppercase tracking-brand text-muted-foreground mx-1">·</span>
          {HORIZONS.map((h) => (
            <Button key={h} size="sm" variant={horizon === h ? "default" : "outline"}
              onClick={() => setHorizon(h)} style={{ borderRadius: 0 }}
              className="uppercase tracking-brand text-[10px] h-7 px-2"
            >
              {h}d
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={generate} disabled={busy}
            style={{ borderRadius: 0 }} className="uppercase tracking-brand text-[10px] h-7 px-2 ml-1"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Modeling…" : "Regenerate"}
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading forecast…</div>
      ) : !data ? (
        <div className="border-2 border-dashed border-border p-6 text-center" style={{ borderRadius: 0 }}>
          <p className="text-sm text-muted-foreground mb-3">
            No forecast yet for <strong className="uppercase tracking-brand">{activePlatform}</strong>. Generate one from the last 90 days of performance data.
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
              <Stat label={`Spend (${horizon}d)`} value={`$${summary.cumSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              <Stat label={`Revenue (${horizon}d)`} value={`$${summary.cumRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                hint={`Range $${summary.revLower.toLocaleString(undefined, { maximumFractionDigits: 0 })} – $${summary.revUpper.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              <Stat label="Avg ROAS" value={`${summary.avgRoas.toFixed(2)}x`} />
              <Stat label="Net (rev − spend)" value={`$${(summary.cumRev - summary.cumSpend).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
            </div>
          )}
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
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