import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { Wine, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { fetchActiveVsMemberEmails } from "./WineClubGrowthPanel";
import {
  DateRangeControls, defaultStart, defaultEnd, todayUTC, isoDay,
  monthKey, pickBucket, daysBetween, formatAxisDate,
} from "./DateRangeControls";

type Membership = {
  id: string;
  tier_id: string;
  status: string;
  origin: string | null;
  is_gift: boolean | null;
  joined_at: string | null;
  cancelled_at: string | null;
  created_at: string | null;
};
type Tier = { id: string; name: string; price_cents: number };

const GROWTH_MAP: Record<string, number> = { flat: 0, g10: 0.10, g25: 0.25, g50: 0.50 };

function rangeLabel(start: Date, end: Date) {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `${fmt(start)} → ${fmt(end)}`;
}

function bucketKey(d: Date, bucket: "day" | "month") {
  return bucket === "day" ? isoDay(d) : monthKey(d);
}
function bucketIterator(start: Date, end: Date, bucket: "day" | "month"): string[] {
  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(bucketKey(cur, bucket));
    if (bucket === "day") cur.setUTCDate(cur.getUTCDate() + 1);
    else { cur.setUTCDate(1); cur.setUTCMonth(cur.getUTCMonth() + 1); }
  }
  return Array.from(new Set(out));
}

export function WineClubTimeline({
  start: startProp, end: endProp, setStart: setStartProp, setEnd: setEndProp, hidePicker,
}: {
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
      await queryClient.refetchQueries({ queryKey: ["wine-club-timeline"], type: "active" });
      toast.success("Wine club timeline refreshed");
    } catch (e: any) {
      toast.error("Refresh failed", { description: e?.message ?? String(e) });
    } finally {
      setRefreshing(false);
    }
  };

  const totalSpanDays = Math.max(1, daysBetween(start, end));
  const bucket = pickBucket(totalSpanDays);
  const observedEnd = end < today ? end : today;

  const { data, isLoading } = useQuery({
    queryKey: ["wine-club-timeline"],
    queryFn: async () => {
      const [tiersRes, mRes, vsActiveEmails] = await Promise.all([
        supabase.from("wine_club_tiers" as any).select("id, name, price_cents"),
        supabase.from("wine_club_memberships" as any)
          .select("id, tier_id, status, origin, is_gift, joined_at, cancelled_at, created_at"),
        fetchActiveVsMemberEmails(),
      ]);
      return {
        tiers: ((tiersRes.data as any) || []) as Tier[],
        memberships: ((mRes.data as any) || []) as Membership[],
        vsActiveEmails,
      };
    },
  });

  const chart = useMemo(() => {
    if (!data) return { points: [] as any[], activeNow: 0, activeMrr: 0, projectedEndActive: 0, projectedEndMrr: 0, avgTier: 0, dailyNewBaseline: 0, dailyChurnBaseline: 0 };

    const tierMap = new Map(data.tiers.map(t => [t.id, t.price_cents]));
    const priceOf = (tid: string) => tierMap.get(tid) ?? 0;

    // Daily aggregation across full history
    const dailyNew = new Map<string, { count: number; mrr_cents: number }>();
    const dailyChurn = new Map<string, { count: number; mrr_cents: number }>();
    for (const r of data.memberships) {
      const joinedIso = r.joined_at ?? r.created_at;
      if (joinedIso && r.origin !== "vinoshipper_legacy") {
        const k = joinedIso.slice(0, 10);
        const cur = dailyNew.get(k) ?? { count: 0, mrr_cents: 0 };
        cur.count += 1;
        cur.mrr_cents += priceOf(r.tier_id);
        dailyNew.set(k, cur);
      }
      if (r.cancelled_at) {
        const k = r.cancelled_at.slice(0, 10);
        const cur = dailyChurn.get(k) ?? { count: 0, mrr_cents: 0 };
        cur.count += 1;
        cur.mrr_cents += priceOf(r.tier_id);
        dailyChurn.set(k, cur);
      }
    }

    // Snapshot of currently active for headline metrics
    const activeRows = data.memberships.filter(r => r.status === "active");
    const activeAppNow = activeRows.length;
    const activeVsNow = data.vsActiveEmails.size;
    const activeNow = activeVsNow + activeAppNow;
    const activeMrr = activeRows.reduce((s, r) => s + priceOf(r.tier_id), 0) / 100;
    const avgTier = activeNow > 0 ? activeMrr / activeNow : (data.tiers[0]?.price_cents ?? 0) / 100;

    // Running active members series (history). We approximate "active at end of period"
    // by cumulative (new - churn) from earliest date forward, anchored so the value
    // on the most recent day matches activeNow.
    const allDays = Array.from(new Set([...dailyNew.keys(), ...dailyChurn.keys()])).sort();
    let running = 0;
    const cumByDay = new Map<string, number>();
    for (const d of allDays) {
      running += (dailyNew.get(d)?.count ?? 0) - (dailyChurn.get(d)?.count ?? 0);
      cumByDay.set(d, running);
    }
    // Anchor: shift so the final cumulative equals activeNow.
    const finalCum = allDays.length > 0 ? cumByDay.get(allDays[allDays.length - 1])! : 0;
    const anchorOffset = activeNow - finalCum;

    // Build observed buckets across the requested range
    const observedKeys = bucketIterator(start, observedEnd, bucket);
    const observed = observedKeys.map((k) => {
      let newCount = 0, churnCount = 0, newMrr = 0, churnMrr = 0;
      if (bucket === "day") {
        newCount = dailyNew.get(k)?.count ?? 0;
        churnCount = dailyChurn.get(k)?.count ?? 0;
        newMrr = (dailyNew.get(k)?.mrr_cents ?? 0) / 100;
        churnMrr = (dailyChurn.get(k)?.mrr_cents ?? 0) / 100;
      } else {
        for (const [day, v] of dailyNew.entries()) {
          if (day.startsWith(k)) { newCount += v.count; newMrr += v.mrr_cents / 100; }
        }
        for (const [day, v] of dailyChurn.entries()) {
          if (day.startsWith(k)) { churnCount += v.count; churnMrr += v.mrr_cents / 100; }
        }
      }
      // running active at end of this bucket
      const cutoff = bucket === "day" ? k : `${k}-31`;
      let cum = 0;
      for (const d of allDays) {
        if (d <= cutoff) cum = cumByDay.get(d) ?? cum;
        else break;
      }
      const activeEnd = cum + anchorOffset;
      return {
        date: k,
        new_signups: newCount,
        cancellations: -churnCount, // negative bar for visual contrast
        active_members: activeEnd,
        mrr: activeEnd * avgTier,
        projected_active: null as number | null,
        projected_mrr: null as number | null,
      };
    });

    // Trailing-90d baseline for forward projection
    const lookback = new Date(today); lookback.setUTCDate(lookback.getUTCDate() - 90);
    let recentNew = 0, recentChurn = 0, days = 0;
    for (const d of allDays) {
      const dt = new Date(d + "T00:00:00Z");
      if (dt >= lookback && dt <= today) {
        recentNew += dailyNew.get(d)?.count ?? 0;
        recentChurn += dailyChurn.get(d)?.count ?? 0;
      }
    }
    days = 90;
    const dailyNewBaseline = recentNew / days;
    const dailyChurnBaseline = recentChurn / days;

    // Projection from today → end
    const projection: any[] = [];
    let active = activeNow;
    if (end > today) {
      if (bucket === "day") {
        const span = daysBetween(today, end);
        for (let i = 1; i <= span; i++) {
          const d = new Date(today); d.setUTCDate(d.getUTCDate() + i);
          const yrs = i / 365;
          const uplift = Math.pow(1 + growth, yrs);
          const added = dailyNewBaseline * uplift;
          const lost = dailyChurnBaseline; // churn doesn't scale with growth lever
          active = Math.max(0, active + added - lost);
          projection.push({
            date: isoDay(d),
            new_signups: null, cancellations: null, active_members: null, mrr: null,
            projected_active: active,
            projected_mrr: active * avgTier,
          });
        }
      } else {
        const cur = new Date(today);
        cur.setUTCDate(1); cur.setUTCMonth(cur.getUTCMonth() + 1);
        let m = 1;
        while (cur <= end) {
          const daysInMonth = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0)).getUTCDate();
          const yrs = m / 12;
          const uplift = Math.pow(1 + growth, yrs);
          const added = dailyNewBaseline * daysInMonth * uplift;
          const lost = dailyChurnBaseline * daysInMonth;
          active = Math.max(0, active + added - lost);
          projection.push({
            date: monthKey(cur),
            new_signups: null, cancellations: null, active_members: null, mrr: null,
            projected_active: active,
            projected_mrr: active * avgTier,
          });
          cur.setUTCMonth(cur.getUTCMonth() + 1);
          m++;
        }
      }
    }

    const projectedEndActive = projection.length > 0 ? projection[projection.length - 1].projected_active : activeNow;
    const projectedEndMrr = projectedEndActive * avgTier;

    return {
      points: [...observed, ...projection],
      activeNow, activeMrr, projectedEndActive, projectedEndMrr,
      avgTier, dailyNewBaseline, dailyChurnBaseline,
    };
  }, [data, start, end, observedEnd, bucket, growth, today]);

  const todayKey = bucket === "day" ? isoDay(today) : monthKey(today);
  const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString()}`;

  return (
    <section className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
      <header className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Wine className="h-4 w-4 text-primary" />
          <h2 className="text-xs uppercase tracking-brand font-bold text-foreground">Wine Club Timeline · The Pack</h2>
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
                { key: "g50", label: "+50%/yr" },
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
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading club timeline…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
            <div className="border-2 border-border p-2" style={{ borderRadius: 0 }}>
              <div className="text-muted-foreground uppercase tracking-brand">Active members</div>
              <div className="text-lg font-bold tabular-nums">{chart.activeNow.toLocaleString()}</div>
              <div className="text-muted-foreground">avg tier {fmtUsd(chart.avgTier)}</div>
            </div>
            <div className="border-2 border-border p-2" style={{ borderRadius: 0 }}>
              <div className="text-muted-foreground uppercase tracking-brand">Active MRR</div>
              <div className="text-lg font-bold tabular-nums text-primary">{fmtUsd(chart.activeMrr)}</div>
              <div className="text-muted-foreground">recurring · today</div>
            </div>
            <div className="border-2 border-border p-2" style={{ borderRadius: 0 }}>
              <div className="text-muted-foreground uppercase tracking-brand">Projected EOH members</div>
              <div className="text-lg font-bold tabular-nums">{Math.round(chart.projectedEndActive).toLocaleString()}</div>
              <div className="text-muted-foreground">at {growthKey === "flat" ? "flat" : growthKey.replace("g", "+") + "%/yr"} growth</div>
            </div>
            <div className="border-2 border-border p-2" style={{ borderRadius: 0 }}>
              <div className="text-muted-foreground uppercase tracking-brand">Projected EOH MRR</div>
              <div className="text-lg font-bold tabular-nums text-primary">{fmtUsd(chart.projectedEndMrr)}</div>
              <div className="text-muted-foreground">end of horizon</div>
            </div>
          </div>

          <div className="h-[280px] -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart.points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatAxisDate} stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
                <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} width={48} />
                <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} width={56}
                  tickFormatter={(v) => `$${Math.round((v as number) / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--background))", border: "2px solid hsl(var(--foreground))", borderRadius: 0, fontSize: 11 }}
                  formatter={(value: any, name: any) => {
                    if (value == null) return ["—", name];
                    if (name === "MRR" || name === "Projected MRR") return [fmtUsd(value), name];
                    return [Math.round(Math.abs(value)).toLocaleString(), name];
                  }}
                  labelFormatter={(l) => formatAxisDate(String(l))}
                />
                <Legend wrapperStyle={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }} />
                <ReferenceLine x={todayKey} yAxisId="left" stroke="hsl(var(--primary))" strokeDasharray="3 3"
                  label={{ value: "today", position: "top", fill: "hsl(var(--primary))", fontSize: 10 }} />
                <Bar yAxisId="left" dataKey="new_signups" name="New signups" fill="hsl(var(--primary))" />
                <Bar yAxisId="left" dataKey="cancellations" name="Cancellations" fill="hsl(var(--destructive))" />
                <Line yAxisId="left" type="monotone" dataKey="active_members" name="Active members" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="projected_active" name="Projected active" stroke="hsl(var(--foreground))" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="mrr" name="MRR" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="projected_mrr" name="Projected MRR" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
            <p>
              Projection uses the trailing 90-day signup rate (
              <strong className="text-foreground">{chart.dailyNewBaseline.toFixed(2)}/day new</strong>
              {" · "}
              <strong className="text-foreground">{chart.dailyChurnBaseline.toFixed(2)}/day churn</strong>
              ) and compounds new signups by the selected growth lever. MRR uses average active tier price ({fmtUsd(chart.avgTier)}). Net new from a Meta OUTCOME_LEADS push will lift the new-signup baseline directly.
            </p>
          </div>
        </>
      )}
    </section>
  );
}