import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Store, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

type DayPoint = {
  date: string;
  qb_revenue: number;
  depletion_revenue: number;
  instacart_revenue: number;
  projected: number;
};

const WINDOW_DAYS = 90;

const HORIZONS = [
  { key: "30d", label: "30d", days: 30, bucket: "day" as const },
  { key: "1y", label: "+1y", days: 365, bucket: "month" as const },
  { key: "2y", label: "+2y", days: 730, bucket: "month" as const },
  { key: "3y", label: "+3y", days: 1095, bucket: "month" as const },
];
type HorizonKey = typeof HORIZONS[number]["key"];

const GROWTH_OPTS = [
  { key: "flat", label: "Flat", rate: 0 },
  { key: "g10", label: "+10%/yr", rate: 0.10 },
  { key: "g25", label: "+25%/yr", rate: 0.25 },
];
type GrowthKey = typeof GROWTH_OPTS[number]["key"];

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}
function monthKey(d: Date) { return d.toISOString().slice(0, 7); }

/** Project a daily average forward, optionally with annualized growth, bucketed to day or month. */
function buildProjection(dailyAvg: number, days: number, bucket: "day" | "month", annualGrowth: number, startFromToday: Date) {
  const out: { date: string; projected: number }[] = [];
  if (bucket === "day") {
    for (let i = 1; i <= days; i++) {
      const d = new Date(startFromToday);
      d.setUTCDate(d.getUTCDate() + i);
      const yrs = i / 365;
      out.push({ date: isoDay(d), projected: dailyAvg * Math.pow(1 + annualGrowth, yrs) });
    }
  } else {
    const months = Math.ceil(days / 30);
    for (let m = 1; m <= months; m++) {
      const d = new Date(startFromToday);
      d.setUTCMonth(d.getUTCMonth() + m);
      const yrs = m / 12;
      const monthDays = 30; // approximate
      out.push({ date: monthKey(d), projected: dailyAvg * monthDays * Math.pow(1 + annualGrowth, yrs) });
    }
  }
  return out;
}

export function BrickMortarTimeline() {
  const [horizonKey, setHorizonKey] = useState<HorizonKey>("30d");
  const [growthKey, setGrowthKey] = useState<GrowthKey>("flat");
  const horizon = HORIZONS.find((h) => h.key === horizonKey)!;
  const growth = GROWTH_OPTS.find((g) => g.key === growthKey)!;

  const since = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - WINDOW_DAYS);
    return isoDay(d);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["bm-timeline", since],
    queryFn: async () => {
      const channelsRes = await supabase
        .from("ad_channels" as any)
        .select("id, platform");
      const instacartChannelIds = ((channelsRes.data ?? []) as any[])
        .filter((c) => c.platform === "instacart")
        .map((c) => c.id);

      const [qbRes, depRes, icRes] = await Promise.all([
        supabase
          .from("bm_finance_entries" as any)
          .select("date, amount_cents, channel, entry_type, category")
          .gte("date", since)
          .in("entry_type", ["revenue", "income", "sales"])
          .limit(5000),
        supabase
          .from("depletion_report_lines" as any)
          .select("period_end, units, cases")
          .gte("period_end", since)
          .limit(5000),
        instacartChannelIds.length
          ? supabase
              .from("ad_performance_daily" as any)
              .select("date, revenue, channel_id")
              .gte("date", since)
              .in("channel_id", instacartChannelIds)
              .limit(5000)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const byDay = new Map<string, DayPoint>();
      const ensure = (d: string) => {
        if (!byDay.has(d)) byDay.set(d, { date: d, qb_revenue: 0, depletion_revenue: 0, instacart_revenue: 0, projected: 0 });
        return byDay.get(d)!;
      };
      for (const r of (qbRes.data ?? []) as any[]) {
        const ch = (r.channel ?? "").toLowerCase();
        // Treat anything not explicitly DTC as brick-and-mortar / wholesale revenue.
        if (ch === "dtc" || ch === "ecommerce") continue;
        ensure(r.date).qb_revenue += Number(r.amount_cents ?? 0) / 100;
      }
      for (const r of (depRes.data ?? []) as any[]) {
        if (!r.period_end) continue;
        const units = Number(r.units ?? 0) || Number(r.cases ?? 0) * 12;
        // Rough on-premise wholesale FOB ~ $9/bottle. Placeholder until SKU-level pricing lands.
        ensure(r.period_end).depletion_revenue += units * 9;
      }
      for (const r of (icRes.data ?? []) as any[]) {
        ensure(r.date).instacart_revenue += Number(r.revenue ?? 0);
      }

      // Build observed (last 90d) at daily granularity.
      const observed: DayPoint[] = [];
      for (let i = 0; i < WINDOW_DAYS; i++) {
        const d = new Date(since);
        d.setUTCDate(d.getUTCDate() + i);
        const key = isoDay(d);
        observed.push(byDay.get(key) ?? { date: key, qb_revenue: 0, depletion_revenue: 0, instacart_revenue: 0, projected: 0 });
      }

      const last30 = observed.slice(-30);
      const avg = last30.length
        ? last30.reduce((s, p) => s + p.qb_revenue + p.depletion_revenue + p.instacart_revenue, 0) / last30.length
        : 0;

      const total = observed.reduce((s, p) => s + p.qb_revenue + p.depletion_revenue + p.instacart_revenue, 0);
      return { observed, total, dailyAvg: avg, qbRows: qbRes.data?.length ?? 0, depRows: depRes.data?.length ?? 0, icRows: icRes.data?.length ?? 0 };
    },
  });

  const chart = useMemo(() => {
    if (!data) return { points: [] as any[], projectedTotal: 0 };
    const today = new Date();
    if (horizon.bucket === "day") {
      const obs = data.observed.map((p) => ({ ...p, projected: 0 }));
      const proj = buildProjection(data.dailyAvg, horizon.days, "day", growth.rate, today);
      const points = [
        ...obs,
        ...proj.map((p) => ({ date: p.date, qb_revenue: 0, depletion_revenue: 0, instacart_revenue: 0, projected: p.projected })),
      ];
      const projectedTotal = proj.reduce((s, p) => s + p.projected, 0);
      return { points, projectedTotal };
    }
    // Monthly buckets: roll observed into months too.
    const obsByMonth = new Map<string, { date: string; qb_revenue: number; depletion_revenue: number; instacart_revenue: number; projected: number }>();
    for (const p of data.observed) {
      const k = p.date.slice(0, 7);
      if (!obsByMonth.has(k)) obsByMonth.set(k, { date: k, qb_revenue: 0, depletion_revenue: 0, instacart_revenue: 0, projected: 0 });
      const row = obsByMonth.get(k)!;
      row.qb_revenue += p.qb_revenue;
      row.depletion_revenue += p.depletion_revenue;
      row.instacart_revenue += p.instacart_revenue;
    }
    const proj = buildProjection(data.dailyAvg, horizon.days, "month", growth.rate, today);
    const points = [
      ...Array.from(obsByMonth.values()).sort((a, b) => a.date.localeCompare(b.date)),
      ...proj.map((p) => ({ date: p.date, qb_revenue: 0, depletion_revenue: 0, instacart_revenue: 0, projected: p.projected })),
    ];
    const projectedTotal = proj.reduce((s, p) => s + p.projected, 0);
    return { points, projectedTotal };
  }, [data, horizon, growth]);

  return (
    <section className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
      <header className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" />
          <h2 className="text-xs uppercase tracking-brand font-bold text-foreground">Brick & Mortar Sales Timeline</h2>
          <span className="text-[10px] uppercase tracking-brand text-muted-foreground">· 90d actual + {horizon.label} projection</span>
        </div>
        <HorizonControls
          horizonKey={horizonKey} setHorizonKey={setHorizonKey}
          growthKey={growthKey} setGrowthKey={setGrowthKey}
        />
      </header>

      <CaveatBanner
        title="Directional only — not source of truth"
        items={[
          "QuickBooks: ledger-based revenue, refreshed nightly; only entries tagged as wholesale/B&M are counted.",
          "Depletion reports: distributor PDFs arrive 30–60 days late and are parsed via Lindy/AI — historical periods will keep filling in.",
          "Instacart: ad-attributed revenue from Instacart Ads (a hybrid of digital + retail) — included here as the closest brick-and-mortar signal we have.",
          "Not yet wired: Nielsen scan data, retail-media platforms, and Yahoo DSP — once available, this tile will split into pure off-premise vs. on-premise vs. retail-media-driven.",
        ]}
      />

      {isLoading || !data ? (
        <div className="text-sm text-muted-foreground">Loading brick & mortar data…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Trailing 90d (modeled)" value={`$${Math.round(data.total).toLocaleString()}`} />
            <Stat label="Avg / day" value={`$${Math.round(data.dailyAvg).toLocaleString()}`} />
            <Stat label={`Projected ${horizon.label}`} value={`$${Math.round(chart.projectedTotal).toLocaleString()}`} hint={growth.label.toLowerCase()} />
            <Stat label="QB / dep lines" value={`${data.qbRows} / ${data.depRows}`} hint="rows ingested" />
          </div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={chart.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => horizon.bucket === "month" ? d : d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                <Tooltip
                  contentStyle={{ borderRadius: 0, border: "2px solid hsl(var(--foreground))", fontSize: 12 }}
                  formatter={(value: any, name: string) => [`$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="qb_revenue" stackId="actual" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.35)" name="QuickBooks (wholesale)" />
                <Area type="monotone" dataKey="depletion_revenue" stackId="actual" stroke="hsl(220 70% 45%)" fill="hsl(220 70% 45% / 0.3)" name="Depletions (modeled $)" />
                <Area type="monotone" dataKey="instacart_revenue" stackId="actual" stroke="hsl(30 90% 50%)" fill="hsl(30 90% 50% / 0.3)" name="Instacart" />
                <Line type="monotone" dataKey="projected" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="4 4" dot={false} name={`Projection (${growth.label})`} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}

export function BrandLiftTimeline() {
  const [horizonKey, setHorizonKey] = useState<HorizonKey>("30d");
  const [growthKey, setGrowthKey] = useState<GrowthKey>("flat");
  const horizon = HORIZONS.find((h) => h.key === horizonKey)!;
  const growth = GROWTH_OPTS.find((g) => g.key === growthKey)!;

  const since = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - WINDOW_DAYS);
    return isoDay(d);
  }, []);

  // Default modeled halo coefficient — DTC conversion spend → incremental B&M sales.
  // Calibrated from a literature prior of ~5–12% halo on lower-funnel ads.
  const HALO_COEFFICIENT = 0.08;

  const { data, isLoading } = useQuery({
    queryKey: ["brand-lift-timeline", since],
    queryFn: async () => {
      const channelsRes = await supabase
        .from("ad_channels" as any)
        .select("id, platform, objective");
      const channels = (channelsRes.data ?? []) as any[];
      const channelMap = new Map(channels.map((c) => [c.id, c]));
      const dtcIds = channels.filter((c) => ["meta", "google"].includes(c.platform)).map((c) => c.id);

      const { data: rows } = dtcIds.length
        ? await supabase
            .from("ad_performance_daily" as any)
            .select("date, spend, conversions, revenue, channel_id")
            .gte("date", since)
            .in("channel_id", dtcIds)
            .limit(10000)
        : { data: [] as any[] };

      const byDay = new Map<string, { date: string; dtc_spend: number; dtc_revenue: number; modeled_lift: number; cumulative_lift: number }>();
      for (const r of (rows ?? []) as any[]) {
        const ch = channelMap.get(r.channel_id);
        const platform = ch?.platform ?? "";
        const objective = (ch?.objective ?? "").toLowerCase();
        // Conversion-objective ads on DTC platforms (Meta / Google) are the lift source.
        const isConversion = objective.includes("conversion") || objective.includes("sales") || objective.includes("purchase");
        if (!["meta", "google"].includes(platform)) continue;
        const d = r.date;
        if (!byDay.has(d)) byDay.set(d, { date: d, dtc_spend: 0, dtc_revenue: 0, modeled_lift: 0, cumulative_lift: 0 });
        const row = byDay.get(d)!;
        const spend = Number(r.spend ?? 0);
        row.dtc_spend += spend;
        row.dtc_revenue += Number(r.revenue ?? 0);
        if (isConversion) row.modeled_lift += spend * HALO_COEFFICIENT;
        else row.modeled_lift += spend * (HALO_COEFFICIENT / 2); // softer halo on awareness
      }

      // Build dense series + cumulative
      const arr: { date: string; dtc_spend: number; dtc_revenue: number; modeled_lift: number; cumulative_lift: number }[] = [];
      let cum = 0;
      for (let i = 0; i < WINDOW_DAYS; i++) {
        const d = new Date(since);
        d.setUTCDate(d.getUTCDate() + i);
        const key = isoDay(d);
        const row = byDay.get(key) ?? { date: key, dtc_spend: 0, dtc_revenue: 0, modeled_lift: 0, cumulative_lift: 0 };
        cum += row.modeled_lift;
        row.cumulative_lift = cum;
        arr.push(row);
      }

      const totalSpend = arr.reduce((s, p) => s + p.dtc_spend, 0);
      const totalDtcRev = arr.reduce((s, p) => s + p.dtc_revenue, 0);
      const avgDailySpend = arr.length ? totalSpend / arr.length : 0;
      const avgDailyLift = arr.length ? cum / arr.length : 0;
      return { observed: arr, totalSpend, totalDtcRev, totalLift: cum, coefficient: HALO_COEFFICIENT, avgDailySpend, avgDailyLift };
    },
  });

  const chart = useMemo(() => {
    if (!data) return { points: [] as any[], projSpend: 0, projLift: 0 };
    const today = new Date();
    if (horizon.bucket === "day") {
      let cum = data.totalLift;
      const proj = [] as any[];
      for (let i = 1; i <= horizon.days; i++) {
        const d = new Date(today); d.setUTCDate(d.getUTCDate() + i);
        const yrs = i / 365;
        const spend = data.avgDailySpend * Math.pow(1 + growth.rate, yrs);
        const lift = data.avgDailyLift * Math.pow(1 + growth.rate, yrs);
        cum += lift;
        proj.push({ date: isoDay(d), dtc_spend: spend, dtc_revenue: 0, modeled_lift: lift, cumulative_lift: cum });
      }
      const projSpend = proj.reduce((s, p) => s + p.dtc_spend, 0);
      const projLift = proj.reduce((s, p) => s + p.modeled_lift, 0);
      return { points: [...data.observed, ...proj], projSpend, projLift };
    }
    // Monthly bucketing
    const obsByMonth = new Map<string, any>();
    for (const p of data.observed) {
      const k = p.date.slice(0, 7);
      if (!obsByMonth.has(k)) obsByMonth.set(k, { date: k, dtc_spend: 0, dtc_revenue: 0, modeled_lift: 0, cumulative_lift: 0 });
      const row = obsByMonth.get(k)!;
      row.dtc_spend += p.dtc_spend;
      row.dtc_revenue += p.dtc_revenue;
      row.modeled_lift += p.modeled_lift;
    }
    const obsArr = Array.from(obsByMonth.values()).sort((a, b) => a.date.localeCompare(b.date));
    let cum = 0;
    for (const r of obsArr) { cum += r.modeled_lift; r.cumulative_lift = cum; }
    const months = Math.ceil(horizon.days / 30);
    const proj = [] as any[];
    for (let m = 1; m <= months; m++) {
      const d = new Date(today); d.setUTCMonth(d.getUTCMonth() + m);
      const yrs = m / 12;
      const spend = data.avgDailySpend * 30 * Math.pow(1 + growth.rate, yrs);
      const lift = data.avgDailyLift * 30 * Math.pow(1 + growth.rate, yrs);
      cum += lift;
      proj.push({ date: monthKey(d), dtc_spend: spend, dtc_revenue: 0, modeled_lift: lift, cumulative_lift: cum });
    }
    const projSpend = proj.reduce((s, p) => s + p.dtc_spend, 0);
    const projLift = proj.reduce((s, p) => s + p.modeled_lift, 0);
    return { points: [...obsArr, ...proj], projSpend, projLift };
  }, [data, horizon, growth]);

  return (
    <section className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
      <header className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" />
          <h2 className="text-xs uppercase tracking-brand font-bold text-foreground">Brand Lift Model — DTC Ads → B&M Halo</h2>
          <span className="text-[10px] uppercase tracking-brand text-muted-foreground">· prior-based · {horizon.label} horizon</span>
        </div>
        <HorizonControls
          horizonKey={horizonKey} setHorizonKey={setHorizonKey}
          growthKey={growthKey} setGrowthKey={setGrowthKey}
        />
      </header>

      <CaveatBanner
        title="Modeled estimate — not measured incrementality"
        items={[
          `Halo coefficient is a literature prior (${(HALO_COEFFICIENT * 100).toFixed(0)}% of conversion-ad spend → incremental off-premise sales, half that for awareness).`,
          "True incrementality needs holdout tests or a media-mix model (MMM). Treat this as a planning floor, not attribution.",
          "DTC sources today = Meta + Google conversion campaigns. Retail media (Walmart Connect, Kroger Precision, etc.) and Yahoo DSP are not yet ingested.",
          "When Nielsen scan + retail-media data land, this tile will switch from a coefficient to a calibrated MMM with DTC vs. B&M decomposition.",
        ]}
      />

      {isLoading || !data ? (
        <div className="text-sm text-muted-foreground">Loading lift model…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Spend 90d" value={`$${Math.round(data.totalSpend).toLocaleString()}`} hint="actual" />
            <Stat label="Lift 90d" value={`$${Math.round(data.totalLift).toLocaleString()}`} hint={`at ${(data.coefficient * 100).toFixed(0)}% halo`} />
            <Stat label={`Projected spend ${horizon.label}`} value={`$${Math.round(chart.projSpend).toLocaleString()}`} hint={growth.label.toLowerCase()} />
            <Stat label={`Projected lift ${horizon.label}`} value={`$${Math.round(chart.projLift).toLocaleString()}`} hint={growth.label.toLowerCase()} />
          </div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={chart.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => horizon.bucket === "month" ? d : d.slice(5)} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                <Tooltip
                  contentStyle={{ borderRadius: 0, border: "2px solid hsl(var(--foreground))", fontSize: 12 }}
                  formatter={(value: any, name: string) => [`$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left" type="monotone" dataKey="dtc_spend" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} name="DTC spend" />
                <Line yAxisId="left" type="monotone" dataKey="modeled_lift" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Modeled B&M lift" />
                <Area yAxisId="right" type="monotone" dataKey="cumulative_lift" stroke="hsl(220 70% 45%)" fill="hsl(220 70% 45% / 0.15)" name="Cumulative lift" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}

function HorizonControls({
  horizonKey, setHorizonKey, growthKey, setGrowthKey,
}: {
  horizonKey: HorizonKey; setHorizonKey: (k: HorizonKey) => void;
  growthKey: GrowthKey; setGrowthKey: (k: GrowthKey) => void;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {HORIZONS.map((h) => (
        <Button key={h.key} size="sm" variant={horizonKey === h.key ? "default" : "outline"}
          onClick={() => setHorizonKey(h.key)} style={{ borderRadius: 0 }}
          className="uppercase tracking-brand text-[10px] h-7 px-2">
          {h.label}
        </Button>
      ))}
      <span className="text-[10px] uppercase tracking-brand text-muted-foreground ml-2">growth</span>
      {GROWTH_OPTS.map((g) => (
        <Button key={g.key} size="sm" variant={growthKey === g.key ? "default" : "outline"}
          onClick={() => setGrowthKey(g.key)} style={{ borderRadius: 0 }}
          className="uppercase tracking-brand text-[10px] h-7 px-2">
          {g.label}
        </Button>
      ))}
    </div>
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