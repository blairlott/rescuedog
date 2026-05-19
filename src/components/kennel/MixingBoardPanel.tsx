import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sliders, RotateCcw, Save, FlaskConical, TrendingUp, Minus, TrendingDown, Wand2, ListTree, ArrowRight, Columns2, AlertTriangle, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type DowRow = { day_of_week: number; modifier: number; sample_days: number | null; override_modifier: number | null };
type MoRow = { month: number; budget_index: number; override_budget_index: number | null };
type GeoRow = { state: string; modifier: number; tier: string | null; revenue_cents: number | null; override_modifier: number | null };
type RiskRow = { state: string; at_risk_customers: number; at_risk_lifetime_value: number; repeat_buyers_at_risk: number };
type PerfRow = { date: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number };
type TxnRow = { order_total: number; invoice: string; customer_id: string | null; transaction_date: string };

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** Position 0..1 from a modifier clamped to [min,max]. */
function pos(value: number, min: number, max: number) {
  const v = Math.max(min, Math.min(max, value));
  return (v - min) / (max - min);
}

function fmtPct(mod: number) {
  const p = (mod - 1) * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(0)}%`;
}

/** Format a KPI value with appropriate units. */
function fmtKpi(value: number, kind: "x" | "pct" | "usd" | "int") {
  if (!isFinite(value)) return "—";
  if (kind === "x") return `${value.toFixed(2)}×`;
  if (kind === "pct") return `${(value * 100).toFixed(2)}%`;
  if (kind === "usd") return `$${value.toFixed(0)}`;
  return Math.round(value).toLocaleString();
}

/** Clamp helper. */
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Vertical fader strip with LED column + draggable knob. */
function Fader({
  label,
  sublabel,
  value,
  baseline,
  min,
  max,
  active,
  centerOne = true,
  onChange,
  disabled,
  tooltip,
  softMin,
  softMax,
}: {
  label: string;
  sublabel?: string;
  value: number;
  /** Auto-computed baseline (renders as a ghost marker when override is active). */
  baseline?: number;
  min: number;
  max: number;
  active?: boolean;
  centerOne?: boolean;
  onChange?: (next: number) => void;
  disabled?: boolean;
  /** Rich tooltip content shown on hover (desktop) and tap (mobile). */
  tooltip?: { title: string; body: React.ReactNode };
  /** Soft guardrail band — values outside trigger an amber warning. */
  softMin?: number;
  softMax?: number;
}) {
  const p = pos(value, min, max);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [tipOpen, setTipOpen] = useState(false);
  const tapTimer = useRef<number | null>(null);

  // Color: red below 1, green above 1, neutral near 1
  const delta = value - 1;
  const ledColor =
    delta > 0.15 ? "bg-[hsl(142,76%,45%)]"
    : delta < -0.15 ? "bg-[hsl(0,75%,55%)]"
    : "bg-[hsl(45,95%,55%)]";

  // LED ladder (20 segments)
  const segs = 20;
  const litCount = Math.round(p * segs);

  const isDirty = baseline !== undefined && Math.abs(baseline - value) > 0.005;

  // Guardrail state: hard-pinned at clamp, or outside the soft "reasonable" band.
  const atHardLimit = value <= min + 0.001 || value >= max - 0.001;
  const outsideSoft =
    (softMin !== undefined && value < softMin - 0.001) ||
    (softMax !== undefined && value > softMax + 0.001);
  const guardrailWarn = atHardLimit || outsideSoft;

  const setFromClientY = (clientY: number) => {
    if (!onChange || !trackRef.current) return;
    const r = trackRef.current.getBoundingClientRect();
    const ratio = clamp(1 - (clientY - r.top) / r.height, 0, 1);
    const raw = min + ratio * (max - min);
    // Snap to 0.05 steps.
    const snapped = Math.round(raw * 20) / 20;
    onChange(clamp(snapped, min, max));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || !onChange) return;
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setFromClientY(e.clientY);
    // Touch tap → flash tooltip for 2.5s so mobile users get the explanation too.
    if (tooltip && e.pointerType === "touch") {
      setTipOpen(true);
      if (tapTimer.current) window.clearTimeout(tapTimer.current);
      tapTimer.current = window.setTimeout(() => setTipOpen(false), 2500);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setFromClientY(e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (disabled || !onChange) return;
    const step = e.shiftKey ? 0.1 : 0.05;
    if (e.key === "ArrowUp") { e.preventDefault(); onChange(clamp(value + step, min, max)); }
    if (e.key === "ArrowDown") { e.preventDefault(); onChange(clamp(value - step, min, max)); }
    if (e.key === "Home" && baseline !== undefined) { e.preventDefault(); onChange(baseline); }
  };

  useEffect(() => () => {
    if (tapTimer.current) window.clearTimeout(tapTimer.current);
  }, []);

  const inner = (
    <div
      className={`flex flex-col items-center gap-1 px-1 py-2 ${active ? "bg-white/5" : ""} ${
        guardrailWarn
          ? "ring-1 ring-[hsl(25,95%,55%)]/80"
          : isDirty
            ? "ring-1 ring-[hsl(45,95%,55%)]/50"
            : ""
      }`}
      style={{ borderRadius: 0 }}
    >
      <div className="flex items-center gap-0.5 h-3 leading-none">
        {guardrailWarn && <AlertTriangle className="h-2.5 w-2.5 text-[hsl(25,95%,55%)]" />}
        <span className={`text-[9px] font-bold tabular-nums ${delta > 0 ? "text-[hsl(142,76%,55%)]" : delta < 0 ? "text-[hsl(0,75%,65%)]" : "text-white/60"}`}>
          {fmtPct(value)}
        </span>
      </div>
      <div
        ref={trackRef}
        className={`relative w-5 h-24 bg-black border border-white/15 ${onChange && !disabled ? "cursor-ns-resize touch-none" : ""}`}
        style={{ borderRadius: 0 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        tabIndex={onChange && !disabled ? 0 : -1}
        onKeyDown={onKey}
        role={onChange ? "slider" : undefined}
        aria-label={onChange ? `${label} modifier` : undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        {/* center 1.0x marker */}
        {centerOne && (
          <div className="absolute left-0 right-0 border-t border-white/25" style={{ top: `${(1 - pos(1, min, max)) * 100}%` }} />
        )}
        {/* LED ladder */}
        <div className="absolute inset-0.5 flex flex-col-reverse gap-[1px] pointer-events-none">
          {Array.from({ length: segs }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 ${i < litCount ? ledColor : "bg-white/5"}`}
              style={{ boxShadow: i < litCount ? "0 0 4px currentColor" : undefined }}
            />
          ))}
        </div>
        {/* baseline ghost marker when overridden */}
        {baseline !== undefined && isDirty && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-white/40 pointer-events-none"
            style={{ top: `${(1 - pos(baseline, min, max)) * 100}%` }}
            title={`Baseline ${baseline.toFixed(2)}×`}
          />
        )}
        {/* knob */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-6 h-2 border border-black shadow-md pointer-events-none ${isDirty ? "bg-gradient-to-b from-[hsl(45,95%,75%)] to-[hsl(45,95%,45%)]" : "bg-gradient-to-b from-white/90 to-white/50"}`}
          style={{ top: `calc(${(1 - p) * 100}% - 4px)`, borderRadius: 0 }}
        />
      </div>
      <div className={`text-[10px] font-bold tracking-brand uppercase leading-none ${active ? "text-white" : "text-white/70"}`}>
        {label}
      </div>
      {sublabel && <div className="text-[8px] text-white/40 leading-none">{sublabel}</div>}
    </div>
  );

  if (!tooltip) return inner;

  const warnNote = guardrailWarn ? (
    <div className="mt-2 pt-2 border-t border-[hsl(25,95%,55%)]/40 text-[10px] text-[hsl(25,95%,75%)] flex items-start gap-1">
      <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
      <span>
        {atHardLimit
          ? `Pinned at the hard ${value <= min + 0.001 ? "min" : "max"} (${value.toFixed(2)}×). Further moves are blocked.`
          : `Outside the reasonable band${softMin !== undefined && softMax !== undefined ? ` (${softMin.toFixed(2)}–${softMax.toFixed(2)}×)` : ""}. Expect outsized swings in spend or CAC.`}
      </span>
    </div>
  ) : null;

  return (
    <Tooltip open={tipOpen} onOpenChange={setTipOpen} delayDuration={150}>
      <TooltipTrigger asChild>
        {inner}
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={8}
        className={`max-w-[260px] bg-black border text-white px-3 py-2 ${guardrailWarn ? "border-[hsl(25,95%,55%)]/70" : "border-[hsl(45,95%,55%)]/50"}`}
        style={{ borderRadius: 0 }}
      >
        <div className="text-[10px] uppercase tracking-brand font-bold text-[hsl(45,95%,55%)] mb-1">
          {tooltip.title}
        </div>
        <div className="text-[11px] leading-snug text-white/85">
          {tooltip.body}
        </div>
        {warnNote}
      </TooltipContent>
    </Tooltip>
  );
}

/** Big horizontal VU meter for retention risk. */
function VuMeter({ label, value, max, unit, sub }: { label: string; value: number; max: number; unit: string; sub: string }) {
  const p = Math.max(0, Math.min(1, value / Math.max(1, max)));
  const segs = 28;
  const lit = Math.round(p * segs);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-brand font-bold text-white/80">{label}</span>
        <span className="text-[10px] text-white/50">{sub}</span>
      </div>
      <div className="relative h-4 bg-black border border-white/15 flex gap-[2px] p-0.5">
        {Array.from({ length: segs }).map((_, i) => {
          const isLit = i < lit;
          const color =
            i < segs * 0.55 ? "bg-[hsl(142,76%,45%)]"
            : i < segs * 0.8 ? "bg-[hsl(45,95%,55%)]"
            : "bg-[hsl(0,75%,55%)]";
          return (
            <div
              key={i}
              className={`flex-1 ${isLit ? color : "bg-white/5"}`}
              style={{ boxShadow: isLit ? "0 0 3px currentColor" : undefined }}
            />
          );
        })}
      </div>
      <div className="text-base font-bold tabular-nums text-white">
        {value.toLocaleString()} <span className="text-[10px] uppercase tracking-brand text-white/50 font-normal">{unit}</span>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] uppercase tracking-brand font-bold text-white/40 mb-1 pl-1">{children}</div>
  );
}

/** Single row in the side-by-side baseline vs what-if compare grid. */
function CompareRow({
  label,
  value,
  delta,
  deltaUp,
  tone = "default",
}: {
  label: string;
  value: string;
  delta?: string;
  deltaUp?: boolean;
  tone?: "default" | "muted" | "spend" | "roas";
}) {
  const valueTone =
    tone === "muted" ? "text-white/60"
    : tone === "spend" ? "text-[hsl(142,76%,55%)]"
    : tone === "roas" ? "text-[hsl(45,95%,55%)]"
    : "text-white";
  const deltaTone = delta
    ? deltaUp ? "text-[hsl(142,76%,55%)]" : "text-[hsl(0,75%,65%)]"
    : "";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-brand text-white/40">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-sm font-bold tabular-nums ${valueTone}`}>{value}</span>
        {delta && (
          <span className={`text-[9px] tabular-nums font-bold ${deltaTone}`}>{delta}</span>
        )}
      </div>
    </div>
  );
}

/** Generic KPI meter: any reasonable metric with a target/baseline + range. */
function KpiMeter({
  label,
  value,
  target,
  min,
  max,
  kind,
  invert = false,
  sub,
}: {
  label: string;
  value: number;
  target: number;
  min: number;
  max: number;
  kind: "x" | "pct" | "usd" | "int";
  /** If true, lower-is-better (e.g. CAC). */
  invert?: boolean;
  sub?: string;
}) {
  const p = pos(value, min, max);
  const ratio = target > 0 ? value / target : 1;
  const healthy = invert ? ratio <= 1.05 : ratio >= 0.95;
  const warn = invert ? ratio <= 1.25 : ratio >= 0.75;
  const tone = healthy
    ? "text-[hsl(142,76%,55%)]"
    : warn
    ? "text-[hsl(45,95%,55%)]"
    : "text-[hsl(0,75%,65%)]";

  const segs = 24;
  const lit = Math.round(p * segs);
  const targetPos = pos(target, min, max);

  return (
    <div className="flex flex-col gap-1 px-2 py-1.5 border border-white/10 bg-black/30" style={{ borderRadius: 0 }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] uppercase tracking-brand font-bold text-white/70 truncate">{label}</span>
        <span className="text-[8px] text-white/40 tabular-nums">tgt {fmtKpi(target, kind)}</span>
      </div>
      <div className="relative h-3 bg-black border border-white/15 flex gap-[1px] p-0.5">
        {Array.from({ length: segs }).map((_, i) => {
          const isLit = i < lit;
          const segColor =
            i < segs * 0.4 ? "bg-[hsl(0,75%,55%)]"
            : i < segs * 0.75 ? "bg-[hsl(45,95%,55%)]"
            : "bg-[hsl(142,76%,45%)]";
          const segTone = invert
            ? (i < segs * 0.25 ? "bg-[hsl(142,76%,45%)]" : i < segs * 0.6 ? "bg-[hsl(45,95%,55%)]" : "bg-[hsl(0,75%,55%)]")
            : segColor;
          return (
            <div
              key={i}
              className={`flex-1 ${isLit ? segTone : "bg-white/5"}`}
              style={{ boxShadow: isLit ? "0 0 3px currentColor" : undefined }}
            />
          );
        })}
        {/* target marker */}
        <div
          className="absolute top-0 bottom-0 w-px bg-white/80"
          style={{ left: `${targetPos * 100}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between">
        <span className={`text-sm font-bold tabular-nums ${tone}`}>{fmtKpi(value, kind)}</span>
        {sub && <span className="text-[8px] uppercase tracking-brand text-white/40">{sub}</span>}
      </div>
    </div>
  );
}

export function MixingBoardPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["kennel-mixing-board"],
    queryFn: async () => {
      const fromIso = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().slice(0, 10);
      })();

      const [dowR, moR, geoR, riskR] = await Promise.all([
        supabase.from("kennel_bid_modifiers" as any).select("day_of_week, modifier, sample_days, override_modifier").order("day_of_week"),
        supabase.from("kennel_seasonality_curve" as any).select("month, budget_index, override_budget_index").order("month"),
        supabase.from("kennel_geo_modifiers" as any).select("state, modifier, tier, revenue_cents, override_modifier").order("revenue_cents", { ascending: false, nullsFirst: false }).limit(8),
        supabase.from("kennel_retention_risk_summary" as any).select("state, at_risk_customers, at_risk_lifetime_value, repeat_buyers_at_risk"),
      ]);

      // Pull recent ad performance + consumer transactions for KPI meters.
      const perfR = await supabase
        .from("ad_performance_daily" as any)
        .select("date, spend, impressions, clicks, conversions, revenue")
        .gte("date", fromIso);

      // Page consumer txns for AOV/repeat rate.
      const txns: TxnRow[] = [];
      const PAGE = 1000;
      for (let from = 0; from < 20000; from += PAGE) {
        const { data: tdata, error } = await supabase
          .from("vs_transactions" as any)
          .select("order_total, invoice, customer_id, transaction_date")
          .gte("transaction_date", fromIso)
          .eq("order_type", "CONSUMER")
          .neq("chain_status", "Cancelled")
          .range(from, from + PAGE - 1);
        if (error) break;
        const rows = ((tdata as any) ?? []) as TxnRow[];
        txns.push(...rows);
        if (rows.length < PAGE) break;
      }

      const perf = ((perfR.data as any) ?? []) as PerfRow[];
      const totals = perf.reduce(
        (a, r) => ({
          spend: a.spend + Number(r.spend || 0),
          impr: a.impr + Number(r.impressions || 0),
          clicks: a.clicks + Number(r.clicks || 0),
          conv: a.conv + Number(r.conversions || 0),
          rev: a.rev + Number(r.revenue || 0),
        }),
        { spend: 0, impr: 0, clicks: 0, conv: 0, rev: 0 }
      );

      // Consumer-side metrics from Vinoshipper (canonical revenue truth).
      const uniqueOrders = new Map<string, number>();
      txns.forEach(t => uniqueOrders.set(t.invoice, Number(t.order_total || 0)));
      const orderCount = uniqueOrders.size;
      const grossRev = Array.from(uniqueOrders.values()).reduce((a, b) => a + b, 0);
      const aov = orderCount > 0 ? grossRev / orderCount : 0;

      // Repeat rate: % of customers with 2+ orders in window.
      const byCustomer = new Map<string, Set<string>>();
      txns.forEach(t => {
        if (!t.customer_id) return;
        if (!byCustomer.has(t.customer_id)) byCustomer.set(t.customer_id, new Set());
        byCustomer.get(t.customer_id)!.add(t.invoice);
      });
      const customerCount = byCustomer.size;
      const repeatCount = Array.from(byCustomer.values()).filter(s => s.size >= 2).length;
      const repeatRate = customerCount > 0 ? repeatCount / customerCount : 0;

      const trueRoas = totals.spend > 0 ? grossRev / totals.spend : 0;
      const ctr = totals.impr > 0 ? totals.clicks / totals.impr : 0;
      const cvr = totals.clicks > 0 ? totals.conv / totals.clicks : 0;
      const cac = orderCount > 0 ? totals.spend / orderCount : 0;
      const dailySpend = totals.spend / 30;

      return {
        dow: ((dowR.data as any) ?? []) as DowRow[],
        mo: ((moR.data as any) ?? []) as MoRow[],
        geo: ((geoR.data as any) ?? []) as GeoRow[],
        risk: ((riskR.data as any) ?? []) as RiskRow[],
        kpi: { trueRoas, ctr, cvr, aov, cac, repeatRate, dailySpend, orderCount, grossRev },
      };
    },
    staleTime: 60 * 1000,
  });

  const todayDow = new Date().getDay();
  const todayMo = new Date().getMonth() + 1;

  const qc = useQueryClient();

  // What-if draft state: keyed maps that override the persisted "effective" value
  // (= override ?? computed) only while the user is dragging.
  const [draftDow, setDraftDow] = useState<Record<number, number>>({});
  const [draftMo, setDraftMo] = useState<Record<number, number>>({});
  const [draftGeo, setDraftGeo] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // Reset drafts when fresh data lands.
  useEffect(() => {
    setDraftDow({});
    setDraftMo({});
    setDraftGeo({});
  }, [data?.dow, data?.mo, data?.geo]);

  const dowMap = new Map((data?.dow ?? []).map(r => [r.day_of_week, r]));
  const moMap = new Map((data?.mo ?? []).map(r => [r.month, r]));

  const dowEff = (i: number) => {
    if (draftDow[i] !== undefined) return draftDow[i];
    const r = dowMap.get(i);
    return r ? Number(r.override_modifier ?? r.modifier) : 1;
  };
  const dowBaseline = (i: number) => {
    const r = dowMap.get(i);
    return r ? Number(r.modifier) : 1;
  };
  const moEff = (m: number) => {
    if (draftMo[m] !== undefined) return draftMo[m];
    const r = moMap.get(m);
    return r ? Number(r.override_budget_index ?? r.budget_index) : 1;
  };
  const moBaseline = (m: number) => {
    const r = moMap.get(m);
    return r ? Number(r.budget_index) : 1;
  };
  const geoEff = (s: string, computed: number, override: number | null) => {
    if (draftGeo[s] !== undefined) return draftGeo[s];
    return override !== null ? Number(override) : computed;
  };

  // What-if preview math: today's blended index = today's DoW × today's month.
  // Projected daily spend = current daily spend × blended index.
  // Projected ROAS = current True ROAS × (geo avg of dirty states / baseline).
  const preview = useMemo(() => {
    const dowToday = dowEff(todayDow);
    const dowTodayBase = dowBaseline(todayDow);
    const moToday = moEff(todayMo);
    const moTodayBase = moBaseline(todayMo);
    const blended = dowToday * moToday;
    const blendedBase = dowTodayBase * moTodayBase;
    const blendedDelta = blendedBase > 0 ? blended / blendedBase : 1;

    const dailySpend = data?.kpi?.dailySpend ?? 0;
    const trueRoas = data?.kpi?.trueRoas ?? 0;
    const projDailySpend = dailySpend * blendedDelta;

    // Geo avg (weighted by revenue) — projected lift = sum(eff)/sum(base)
    const geos = data?.geo ?? [];
    let baseSum = 0, effSum = 0, wSum = 0;
    for (const g of geos) {
      const w = Math.max(1, Number(g.revenue_cents ?? 0));
      const base = Number(g.modifier);
      const eff = geoEff(g.state, base, g.override_modifier);
      baseSum += base * w;
      effSum += eff * w;
      wSum += w;
    }
    const geoLift = baseSum > 0 ? effSum / baseSum : 1;
    const projRoas = trueRoas * geoLift;

    const dirtyCount =
      Object.keys(draftDow).length +
      Object.keys(draftMo).length +
      Object.keys(draftGeo).length;

    return { blended, blendedBase, blendedDelta, projDailySpend, dailySpend, projRoas, trueRoas, geoLift, dirtyCount };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftDow, draftMo, draftGeo, data, todayDow, todayMo]);

  // Side-by-side compare mode: render a frozen "Baseline" column alongside the
  // live what-if values. Toggle persists in component state only.
  const [compareMode, setCompareMode] = useState(true);

  // ---- Guardrail warnings: per-fader + aggregate (spend swing, ROAS drop, etc.)
  type Warn = { level: "warn" | "danger"; label: string; detail: string };
  const warnings = useMemo<Warn[]>(() => {
    const out: Warn[] = [];
    const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    // Per-fader band checks
    for (const [k, v] of Object.entries(draftDow)) {
      const name = DAY_NAMES[Number(k)];
      if (v <= 0.501 || v >= 1.999) out.push({ level: "danger", label: `${name} pinned at hard ${v <= 0.501 ? "min" : "max"}`, detail: `${v.toFixed(2)}× — bid pacing will be jagged. Consider a smoother value.` });
      else if (v < 0.7 || v > 1.5) out.push({ level: "warn", label: `${name} outside 0.70–1.50× band`, detail: `Value ${v.toFixed(2)}× will produce outsized swings vs typical DoW lift.` });
    }
    for (const [k, v] of Object.entries(draftMo)) {
      const name = MONTH_NAMES[Number(k) - 1];
      if (v <= 0.301 || v >= 2.999) out.push({ level: "danger", label: `${name} pinned at hard ${v <= 0.301 ? "min" : "max"}`, detail: `${v.toFixed(2)}× — monthly budget cap will hit the clamp.` });
      else if (v < 0.5 || v > 2.0) out.push({ level: "warn", label: `${name} outside 0.50–2.00× band`, detail: `Value ${v.toFixed(2)}× will skew the seasonality curve.` });
    }
    for (const [k, v] of Object.entries(draftGeo)) {
      if (v <= 0.501 || v >= 1.999) out.push({ level: "danger", label: `${k} pinned at hard ${v <= 0.501 ? "min" : "max"}`, detail: `${v.toFixed(2)}× — geo bid will saturate.` });
      else if (v < 0.7 || v > 1.5) out.push({ level: "warn", label: `${k} outside 0.70–1.50× band`, detail: `Value ${v.toFixed(2)}× is unusual for a state-level adjustment.` });
    }

    // Aggregate impact checks (only when we have a meaningful baseline)
    if (preview.dailySpend > 0) {
      const swing = preview.projDailySpend / preview.dailySpend;
      if (swing >= 1.5) out.push({ level: "danger", label: `Daily spend +${((swing - 1) * 100).toFixed(0)}%`, detail: `Projected $${preview.projDailySpend.toFixed(0)}/day vs $${preview.dailySpend.toFixed(0)} baseline — exceeds the 1.5× safety threshold.` });
      else if (swing <= 0.6) out.push({ level: "warn", label: `Daily spend −${((1 - swing) * 100).toFixed(0)}%`, detail: `Projected $${preview.projDailySpend.toFixed(0)}/day — risk of starving the auction below 0.6× baseline.` });
    }
    if (preview.trueRoas > 0) {
      const roasRatio = preview.projRoas / preview.trueRoas;
      if (roasRatio <= 0.85) out.push({ level: "danger", label: `Projected ROAS drop ${((1 - roasRatio) * 100).toFixed(0)}%`, detail: `${preview.projRoas.toFixed(2)}× vs ${preview.trueRoas.toFixed(2)}× baseline — below 3.0× target risk.` });
    }
    return out;
  }, [draftDow, draftMo, draftGeo, preview]);

  // ---- Change Summary: explicit list of every parameter delta vs baseline,
  // with the metrics each one is expected to move. Drives the executive panel.
  type DeltaRow = {
    key: string;
    group: "DoW" | "Month" | "Geo";
    label: string;
    baseline: number;
    next: number;
    pctChange: number;
    impacts: string[];
  };
  const deltas = useMemo<DeltaRow[]>(() => {
    const rows: DeltaRow[] = [];
    const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    for (const [k, v] of Object.entries(draftDow)) {
      const i = Number(k);
      const base = dowBaseline(i);
      if (Math.abs(base - v) < 0.005) continue;
      rows.push({
        key: `dow-${i}`,
        group: "DoW",
        label: DAY_NAMES[i],
        baseline: base,
        next: v,
        pctChange: base > 0 ? (v / base - 1) * 100 : 0,
        impacts: ["Meta/Google bid prices on this weekday", "Daily spend pacing", "Click volume & CTR mix"],
      });
    }
    for (const [k, v] of Object.entries(draftMo)) {
      const m = Number(k);
      const base = moBaseline(m);
      if (Math.abs(base - v) < 0.005) continue;
      rows.push({
        key: `mo-${m}`,
        group: "Month",
        label: MONTH_NAMES[m - 1],
        baseline: base,
        next: v,
        pctChange: base > 0 ? (v / base - 1) * 100 : 0,
        impacts: ["Monthly ad budget cap", "Seasonal share of voice", "Forecasted revenue this month"],
      });
    }
    const geoMap = new Map((data?.geo ?? []).map(g => [g.state, g]));
    for (const [k, v] of Object.entries(draftGeo)) {
      const g = geoMap.get(k);
      const base = g ? Number(g.modifier) : 1;
      if (Math.abs(base - v) < 0.005) continue;
      rows.push({
        key: `geo-${k}`,
        group: "Geo",
        label: `${k}${g?.tier ? ` · ${g.tier}` : ""}`,
        baseline: base,
        next: v,
        pctChange: base > 0 ? (v / base - 1) * 100 : 0,
        impacts: ["State-level bid adjustment", "Geo-weighted ROAS", "Acquisition cost in this state"],
      });
    }
    // Sort: largest absolute change first.
    rows.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
    return rows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftDow, draftMo, draftGeo, data]);

  const resetDraft = () => {
    setDraftDow({});
    setDraftMo({});
    setDraftGeo({});
    setActivePreset("custom");
  };

  /** Scenario presets — apply a multiplier to every baseline value as a draft. */
  type Preset = "boost" | "hold" | "pull" | "auto" | "custom";
  const [activePreset, setActivePreset] = useState<Preset>("custom");

  const applyPreset = (preset: Preset) => {
    if (preset === "auto") {
      // Revert all faders to the auto-computed baseline (drop any override).
      const dow: Record<number, number> = {};
      const mo: Record<number, number> = {};
      const geo: Record<string, number> = {};
      (data?.dow ?? []).forEach(r => { dow[r.day_of_week] = Number(r.modifier); });
      (data?.mo ?? []).forEach(r => { mo[r.month] = Number(r.budget_index); });
      (data?.geo ?? []).forEach(r => { geo[r.state] = Number(r.modifier); });
      setDraftDow(dow); setDraftMo(mo); setDraftGeo(geo);
      setActivePreset("auto");
      return;
    }
    if (preset === "hold") {
      // Neutralize every fader to 1.0×.
      const dow: Record<number, number> = {};
      const mo: Record<number, number> = {};
      const geo: Record<string, number> = {};
      (data?.dow ?? []).forEach(r => { dow[r.day_of_week] = 1.0; });
      (data?.mo ?? []).forEach(r => { mo[r.month] = 1.0; });
      (data?.geo ?? []).forEach(r => { geo[r.state] = 1.0; });
      setDraftDow(dow); setDraftMo(mo); setDraftGeo(geo);
      setActivePreset("hold");
      return;
    }
    // Boost = baseline × 1.2 clamped; Pull = baseline × 0.8 clamped.
    const mult = preset === "boost" ? 1.2 : 0.8;
    const dow: Record<number, number> = {};
    const mo: Record<number, number> = {};
    const geo: Record<string, number> = {};
    (data?.dow ?? []).forEach(r => { dow[r.day_of_week] = clamp(Number(r.modifier) * mult, 0.5, 2.0); });
    (data?.mo ?? []).forEach(r => { mo[r.month] = clamp(Number(r.budget_index) * mult, 0.3, 3.0); });
    (data?.geo ?? []).forEach(r => { geo[r.state] = clamp(Number(r.modifier) * mult, 0.5, 2.0); });
    setDraftDow(dow); setDraftMo(mo); setDraftGeo(geo);
    setActivePreset(preset);
  };

  // Drop the preset highlight as soon as the user drags a fader manually.
  useEffect(() => {
    if (activePreset === "custom") return;
    // No-op: applyPreset sets drafts which triggers this effect; we only flip back to
    // "custom" via the Fader onChange path below.
  }, [activePreset]);

  const saveDraft = async () => {
    setSaving(true);
    try {
      const ops: PromiseLike<any>[] = [];
      for (const [k, v] of Object.entries(draftDow)) {
        ops.push(
          supabase.from("kennel_bid_modifiers" as any)
            .update({ override_modifier: v })
            .eq("day_of_week", Number(k))
        );
      }
      for (const [k, v] of Object.entries(draftMo)) {
        ops.push(
          supabase.from("kennel_seasonality_curve" as any)
            .update({ override_budget_index: v })
            .eq("month", Number(k))
        );
      }
      for (const [k, v] of Object.entries(draftGeo)) {
        ops.push(
          supabase.from("kennel_geo_modifiers" as any)
            .update({ override_modifier: v })
            .eq("state", k)
        );
      }
      const results = await Promise.all(ops);
      const failed = results.find(r => r.error);
      if (failed) throw failed.error;
      toast.success(`Saved ${ops.length} override${ops.length === 1 ? "" : "s"}`);
      await qc.invalidateQueries({ queryKey: ["kennel-mixing-board"] });
      resetDraft();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const clearAllOverrides = async () => {
    setSaving(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        supabase.from("kennel_bid_modifiers" as any).update({ override_modifier: null }).gte("day_of_week", 0),
        supabase.from("kennel_seasonality_curve" as any).update({ override_budget_index: null }).gte("month", 1),
        supabase.from("kennel_geo_modifiers" as any).update({ override_modifier: null }).neq("state", ""),
      ]);
      if (r1.error || r2.error || r3.error) throw (r1.error || r2.error || r3.error);
      toast.success("All overrides cleared — back to auto");
      await qc.invalidateQueries({ queryKey: ["kennel-mixing-board"] });
      resetDraft();
    } catch (e: any) {
      toast.error(e?.message ?? "Clear failed");
    } finally {
      setSaving(false);
    }
  };

  // Wrap state-setters so any manual drag flips us back to "Custom".
  const setDow = (i: number, v: number) => {
    setDraftDow(p => ({ ...p, [i]: v }));
    if (activePreset !== "custom") setActivePreset("custom");
  };
  const setMo = (m: number, v: number) => {
    setDraftMo(p => ({ ...p, [m]: v }));
    if (activePreset !== "custom") setActivePreset("custom");
  };
  const setGeo = (s: string, v: number) => {
    setDraftGeo(p => ({ ...p, [s]: v }));
    if (activePreset !== "custom") setActivePreset("custom");
  };

  const riskTotals = (data?.risk ?? []).reduce(
    (a, r) => ({
      customers: a.customers + Number(r.at_risk_customers || 0),
      value: a.value + Number(r.at_risk_lifetime_value || 0),
      repeat: a.repeat + Number(r.repeat_buyers_at_risk || 0),
    }),
    { customers: 0, value: 0, repeat: 0 }
  );

  const k = data?.kpi;

  return (
    <div
      className="border-2 border-foreground p-4 text-white"
      style={{
        borderRadius: 0,
        background:
          "linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.8)",
      }}
    >
      {/* Console header */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-[hsl(45,95%,55%)]" />
          <h3 className="text-sm uppercase tracking-brand font-bold">Optimization Console</h3>
          <span className="text-[10px] text-white/40 uppercase tracking-brand">Drag faders · what-if mode</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-[hsl(142,76%,55%)] animate-pulse" />
          <span className="text-[9px] uppercase tracking-brand text-white/50">Signal</span>
        </div>
      </div>

      {isLoading ? (
        <div className="text-white/40 text-xs py-8 text-center uppercase tracking-brand">Warming up the board…</div>
      ) : (
        <TooltipProvider delayDuration={150}>
        {/* MASTER KPI RACK — any reasonable metric */}
        {k && (
          <div className="mb-4">
            <SectionLabel>Master KPIs · trailing 30d</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-1.5">
              <KpiMeter label="True ROAS" value={k.trueRoas} target={3.0} min={0} max={6} kind="x" sub="rev/spend" />
              <KpiMeter label="CTR" value={k.ctr} target={0.02} min={0} max={0.05} kind="pct" sub="clicks/impr" />
              <KpiMeter label="CVR" value={k.cvr} target={0.03} min={0} max={0.08} kind="pct" sub="conv/clicks" />
              <KpiMeter label="AOV" value={k.aov} target={120} min={0} max={250} kind="usd" sub="per order" />
              <KpiMeter label="CAC" value={k.cac} target={40} min={0} max={150} kind="usd" invert sub="lower better" />
              <KpiMeter label="Repeat Rate" value={k.repeatRate} target={0.25} min={0} max={0.5} kind="pct" sub="2+ orders" />
              <KpiMeter label="Daily Spend" value={k.dailySpend} target={k.dailySpend || 100} min={0} max={Math.max(500, k.dailySpend * 2)} kind="usd" sub="30d avg" />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[auto_auto_1fr_auto] gap-4">
          {/* DAY OF WEEK */}
          <div>
            <SectionLabel>Day of week</SectionLabel>
            <div className="flex gap-0.5 border border-white/10 bg-black/30 p-1">
              {DAYS.map((d, i) => {
                const r = dowMap.get(i);
                const dayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][i];
                return (
                  <Fader
                    key={i}
                    label={d}
                    value={dowEff(i)}
                    baseline={dowBaseline(i)}
                    min={0.5}
                    max={2.0}
                    softMin={0.7}
                    softMax={1.5}
                    active={i === todayDow}
                    sublabel={r?.sample_days ? `${r.sample_days}d` : undefined}
                    onChange={(next) => setDow(i, next)}
                    tooltip={{
                      title: `${dayName} bid modifier`,
                      body: (
                        <>
                          Multiplier applied to <b>ad bid prices</b> (Meta / Google) on {dayName}s.
                          Based on the last 90 days of consumer revenue vs the weekly average
                          {r?.sample_days ? ` (${r.sample_days} day samples).` : "."}
                          <div className="mt-1 text-white/60">
                            1.20× = bid 20% higher · 0.80× = bid 20% lower · clamped 0.5×–2.0×.
                          </div>
                        </>
                      ),
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* MONTH */}
          <div>
            <SectionLabel>Month of year</SectionLabel>
            <div className="flex gap-0.5 border border-white/10 bg-black/30 p-1">
              {MONTHS.map((m, i) => {
                const month = i + 1;
                const monthName = ["January","February","March","April","May","June","July","August","September","October","November","December"][i];
                return (
                  <Fader
                    key={month}
                    label={m}
                    value={moEff(month)}
                    baseline={moBaseline(month)}
                    min={0.3}
                    max={3.0}
                    softMin={0.5}
                    softMax={2.0}
                    active={month === todayMo}
                    onChange={(next) => setMo(month, next)}
                    tooltip={{
                      title: `${monthName} budget index`,
                      body: (
                        <>
                          Multiplier on the <b>monthly ad budget</b> for {monthName}.
                          Lifetime consumer revenue this month vs the average month — Q4
                          typically runs 2–3× while Jan/Feb fall well below.
                          <div className="mt-1 text-white/60">
                            Push to Meta/Google campaign budget rules. Clamped 0.3×–3.0×.
                          </div>
                        </>
                      ),
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* GEO TOP 8 */}
          <div className="min-w-0">
            <SectionLabel>Geo — top 8 states</SectionLabel>
            <div className="flex gap-0.5 border border-white/10 bg-black/30 p-1 overflow-x-auto">
              {(data?.geo ?? []).map((g) => (
                <Fader
                  key={g.state}
                  label={g.state}
                  value={geoEff(g.state, Number(g.modifier), g.override_modifier)}
                  baseline={Number(g.modifier)}
                  min={0.5}
                  max={2.0}
                  softMin={0.7}
                  softMax={1.5}
                  sublabel={g.tier ?? undefined}
                  onChange={(next) => setGeo(g.state, next)}
                  tooltip={{
                    title: `${g.state} geo bid modifier`,
                    body: (
                      <>
                        <b>State-level bid adjustment</b> based on lifetime consumer LTV vs the
                        median state{g.tier ? `. Tier ${g.tier}.` : "."}
                        <div className="mt-1 text-white/60">
                          Raises or lowers ad bids when targeting customers in {g.state}.
                          Tier A states get the biggest boost; C states get pulled back.
                          Clamped 0.5×–2.0×.
                        </div>
                      </>
                    ),
                  }}
                />
              ))}
              {(data?.geo ?? []).length === 0 && (
                <div className="text-[10px] text-white/30 px-3 py-8 uppercase tracking-brand">No data</div>
              )}
            </div>
          </div>

          {/* RETENTION RISK MASTER VU */}
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
          <div className="lg:w-56 flex flex-col gap-2 border border-white/10 bg-black/30 p-3" style={{ borderRadius: 0 }}>
            <SectionLabel>Retention risk · master</SectionLabel>
            <VuMeter
              label="At-risk customers"
              value={riskTotals.customers}
              max={Math.max(50, riskTotals.customers * 1.2)}
              unit="60–90d window"
              sub="all states"
            />
            <VuMeter
              label="Repeat buyers"
              value={riskTotals.repeat}
              max={Math.max(10, riskTotals.repeat * 1.2)}
              unit="proven LTV"
              sub="winback priority"
            />
            <div className="mt-1 pt-2 border-t border-white/10">
              <div className="text-[9px] uppercase tracking-brand text-white/40">LTV at risk</div>
              <div className="text-lg font-bold tabular-nums text-[hsl(45,95%,55%)]">
                ${Math.round(riskTotals.value).toLocaleString()}
              </div>
            </div>
          </div>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={8}
              className="max-w-[280px] bg-black border border-[hsl(45,95%,55%)]/50 text-white px-3 py-2"
              style={{ borderRadius: 0 }}
            >
              <div className="text-[10px] uppercase tracking-brand font-bold text-[hsl(45,95%,55%)] mb-1">
                Retention risk meters
              </div>
              <div className="text-[11px] leading-snug text-white/85">
                Customers whose last consumer order was <b>60–90 days ago</b> — the median
                time-to-2nd-order is 77 days, so this is the winback sweet spot.
                <div className="mt-1 text-white/60">
                  Feeds Meta Custom Audiences and Mailchimp winback flows. The LTV figure is
                  the dollar value at stake if these customers don't reorder.
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* SCENARIO PRESETS */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border border-white/10 bg-black/40 p-2" style={{ borderRadius: 0 }}>
          <span className="text-[10px] uppercase tracking-brand font-bold text-white/60 px-1">
            Scenario
          </span>
          {([
            { id: "boost", label: "Boost +20%", icon: TrendingUp, hint: "Multiply every baseline by 1.2× (clamped)" },
            { id: "hold",  label: "Hold 1.00×", icon: Minus,      hint: "Flatten every fader to neutral 1.0×" },
            { id: "pull",  label: "Pull −20%", icon: TrendingDown, hint: "Multiply every baseline by 0.8× (clamped)" },
            { id: "auto",  label: "Auto",       icon: Wand2,       hint: "Revert to nightly auto-computed values" },
          ] as const).map(p => {
            const Icon = p.icon;
            const isActive = activePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                title={p.hint}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-brand font-bold border transition-colors ${
                  isActive
                    ? "bg-[hsl(45,95%,55%)] text-black border-[hsl(45,95%,55%)]"
                    : "bg-transparent text-white/70 border-white/20 hover:bg-white/10 hover:text-white"
                }`}
                style={{ borderRadius: 0 }}
              >
                <Icon className="h-3 w-3" />
                {p.label}
              </button>
            );
          })}
          <div className={`flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-brand font-bold border ${
            activePreset === "custom"
              ? "bg-white/10 text-white border-white/40"
              : "text-white/40 border-white/10"
          }`} style={{ borderRadius: 0 }}>
            <Sliders className="h-3 w-3" />
            Custom
          </div>
          <span className="ml-auto text-[9px] uppercase tracking-brand text-white/40">
            Compare signals below — nothing saves until you hit Save.
          </span>
        </div>

        {/* WHAT-IF PREVIEW BAR */}
        <div className="mt-4 border border-[hsl(45,95%,55%)]/40 bg-black/40 p-3" style={{ borderRadius: 0 }}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <FlaskConical className="h-3.5 w-3.5 text-[hsl(45,95%,55%)]" />
              <span className="text-[10px] uppercase tracking-brand font-bold text-[hsl(45,95%,75%)]">
                Signals
              </span>
              {preview.dirtyCount > 0 && (
                <span className="text-[9px] uppercase tracking-brand text-[hsl(45,95%,55%)] bg-[hsl(45,95%,55%)]/15 px-1.5 py-0.5">
                  {preview.dirtyCount} unsaved
                </span>
              )}
              {warnings.length > 0 && (
                <span
                  className={`flex items-center gap-1 text-[9px] uppercase tracking-brand px-1.5 py-0.5 ${
                    warnings.some(w => w.level === "danger")
                      ? "text-[hsl(0,75%,75%)] bg-[hsl(0,75%,55%)]/15"
                      : "text-[hsl(25,95%,75%)] bg-[hsl(25,95%,55%)]/15"
                  }`}
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {warnings.length} guardrail{warnings.length === 1 ? "" : "s"}
                </span>
              )}
              {warnings.length === 0 && preview.dirtyCount > 0 && (
                <span className="flex items-center gap-1 text-[9px] uppercase tracking-brand text-[hsl(142,76%,75%)] bg-[hsl(142,76%,45%)]/15 px-1.5 py-0.5">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  Within bounds
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCompareMode(v => !v)}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-brand font-bold border ${
                  compareMode
                    ? "bg-[hsl(45,95%,55%)] text-black border-[hsl(45,95%,55%)]"
                    : "bg-transparent text-white/70 border-white/20 hover:bg-white/10"
                }`}
                style={{ borderRadius: 0 }}
                title="Show the baseline signals side-by-side with what-if"
              >
                <Columns2 className="h-3 w-3" />
                Compare {compareMode ? "on" : "off"}
              </button>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="mb-2 border border-[hsl(25,95%,55%)]/40 bg-[hsl(25,95%,15%)]/40 p-2" style={{ borderRadius: 0 }}>
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="h-3 w-3 text-[hsl(25,95%,55%)]" />
                <span className="text-[10px] uppercase tracking-brand font-bold text-[hsl(25,95%,75%)]">
                  Guardrail warnings
                </span>
                <span className="text-[9px] uppercase tracking-brand text-white/40">
                  Hard min/max enforced · soft bands flagged
                </span>
              </div>
              <ul className="space-y-1">
                {warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10px]">
                    <span
                      className={`mt-0.5 h-2 w-2 flex-shrink-0 ${
                        w.level === "danger" ? "bg-[hsl(0,75%,55%)]" : "bg-[hsl(25,95%,55%)]"
                      }`}
                    />
                    <span className="text-white/90 font-bold">{w.label}.</span>
                    <span className="text-white/60">{w.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {compareMode ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {/* BASELINE COLUMN */}
              <div className="border border-white/15 bg-black/40 p-2.5" style={{ borderRadius: 0 }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] uppercase tracking-brand font-bold text-white/50">
                    Baseline · auto-computed
                  </span>
                  <span className="text-[8px] uppercase tracking-brand text-white/30">Frozen reference</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-white/70">
                  <CompareRow label="Today's blend" value={`${preview.blendedBase.toFixed(2)}×`} tone="muted" />
                  <CompareRow label="Daily spend" value={`$${preview.dailySpend.toFixed(0)}`} tone="muted" />
                  <CompareRow label="Geo lift" value="1.00×" tone="muted" />
                  <CompareRow label="True ROAS" value={`${preview.trueRoas.toFixed(2)}×`} tone="muted" />
                </div>
              </div>
              {/* WHAT-IF COLUMN */}
              <div className="border border-[hsl(45,95%,55%)]/40 bg-[hsl(45,95%,55%)]/5 p-2.5" style={{ borderRadius: 0 }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] uppercase tracking-brand font-bold text-[hsl(45,95%,75%)]">
                    What-if · live preview
                  </span>
                  <span className="text-[8px] uppercase tracking-brand text-white/40">Drag faders to update</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CompareRow
                    label="Today's blend"
                    value={`${preview.blended.toFixed(2)}×`}
                    delta={`${preview.blendedDelta >= 1 ? "+" : ""}${((preview.blendedDelta - 1) * 100).toFixed(0)}%`}
                    deltaUp={preview.blendedDelta >= 1}
                  />
                  <CompareRow
                    label="Daily spend"
                    value={`$${preview.projDailySpend.toFixed(0)}`}
                    delta={`${preview.projDailySpend - preview.dailySpend >= 0 ? "+" : ""}$${(preview.projDailySpend - preview.dailySpend).toFixed(0)}`}
                    deltaUp={preview.projDailySpend >= preview.dailySpend}
                    tone="spend"
                  />
                  <CompareRow
                    label="Geo lift"
                    value={`${preview.geoLift.toFixed(2)}×`}
                    delta={`${preview.geoLift >= 1 ? "+" : ""}${((preview.geoLift - 1) * 100).toFixed(0)}%`}
                    deltaUp={preview.geoLift >= 1}
                  />
                  <CompareRow
                    label="Proj. ROAS"
                    value={`${preview.projRoas.toFixed(2)}×`}
                    delta={`${preview.projRoas - preview.trueRoas >= 0 ? "+" : ""}${(preview.projRoas - preview.trueRoas).toFixed(2)}×`}
                    deltaUp={preview.projRoas >= preview.trueRoas}
                    tone="roas"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-brand text-white/40">Today's blend</span>
                <span className="text-sm font-bold tabular-nums text-white">{preview.blended.toFixed(2)}×</span>
                <span className="text-[9px] tabular-nums text-white/40">
                  ({preview.blendedDelta >= 1 ? "+" : ""}{((preview.blendedDelta - 1) * 100).toFixed(0)}% vs auto)
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-brand text-white/40">Proj. daily spend</span>
                <span className="text-sm font-bold tabular-nums text-[hsl(142,76%,55%)]">
                  ${preview.projDailySpend.toFixed(0)}
                </span>
                <span className="text-[9px] tabular-nums text-white/40">(was ${preview.dailySpend.toFixed(0)})</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-brand text-white/40">Geo lift</span>
                <span className="text-sm font-bold tabular-nums text-white">{preview.geoLift.toFixed(2)}×</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-brand text-white/40">Proj. ROAS</span>
                <span className="text-sm font-bold tabular-nums text-[hsl(45,95%,55%)]">
                  {preview.projRoas.toFixed(2)}×
                </span>
                <span className="text-[9px] tabular-nums text-white/40">(was {preview.trueRoas.toFixed(2)}×)</span>
              </div>
            </div>
          )}

          <div className="mt-3 pt-2 border-t border-white/10 flex flex-wrap items-center gap-2">
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] uppercase tracking-brand border-white/20 text-white hover:bg-white/10"
                onClick={resetDraft}
                disabled={preview.dirtyCount === 0 || saving}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset draft
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] uppercase tracking-brand border-white/20 text-white/70 hover:bg-white/10"
                onClick={clearAllOverrides}
                disabled={saving}
                title="Wipe all saved overrides and revert to nightly auto-computed values"
              >
                Clear all overrides
              </Button>
              <Button
                size="sm"
                className="h-7 text-[10px] uppercase tracking-brand bg-[hsl(45,95%,55%)] text-black hover:bg-[hsl(45,95%,65%)]"
                onClick={saveDraft}
                disabled={preview.dirtyCount === 0 || saving}
              >
                <Save className="h-3 w-3 mr-1" />
                {saving ? "Saving…" : `Save ${preview.dirtyCount || ""}`}
              </Button>
            </div>
          </div>
          <div className="mt-2 text-[9px] uppercase tracking-brand text-white/40">
            Drag a knob or use ↑/↓ (Shift = larger step, Home = revert). Overrides take precedence over the nightly auto-computed value.
          </div>
        </div>

        {/* CHANGE SUMMARY — explicit deltas + expected metric impact */}
        <div className="mt-4 border border-white/15 bg-black/40 p-3" style={{ borderRadius: 0 }}>
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <ListTree className="h-3.5 w-3.5 text-[hsl(45,95%,55%)]" />
              <span className="text-[10px] uppercase tracking-brand font-bold text-white/80">
                Change summary
              </span>
              <span className="text-[9px] uppercase tracking-brand text-white/40">
                Parameter deltas vs baseline
              </span>
            </div>
            <span className="text-[9px] uppercase tracking-brand text-white/50 tabular-nums">
              {deltas.length} {deltas.length === 1 ? "change" : "changes"}
            </span>
          </div>

          {deltas.length === 0 ? (
            <div className="text-[10px] uppercase tracking-brand text-white/30 py-3 text-center">
              No pending changes — every fader matches the baseline.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] uppercase tracking-brand text-white/40 border-b border-white/10">
                    <th className="text-left font-bold py-1.5 pr-2 w-16">Group</th>
                    <th className="text-left font-bold py-1.5 pr-2">Parameter</th>
                    <th className="text-right font-bold py-1.5 px-2 w-20">Baseline</th>
                    <th className="text-right font-bold py-1.5 px-2 w-20">New</th>
                    <th className="text-right font-bold py-1.5 px-2 w-20">Δ</th>
                    <th className="text-left font-bold py-1.5 pl-3">Expected metric impact</th>
                  </tr>
                </thead>
                <tbody>
                  {deltas.map(d => {
                    const up = d.pctChange > 0;
                    const tone = Math.abs(d.pctChange) < 1
                      ? "text-white/60"
                      : up
                        ? "text-[hsl(142,76%,55%)]"
                        : "text-[hsl(0,75%,65%)]";
                    return (
                      <tr key={d.key} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                        <td className="py-1.5 pr-2">
                          <span className="text-[9px] uppercase tracking-brand font-bold text-white/50 border border-white/15 px-1.5 py-0.5" style={{ borderRadius: 0 }}>
                            {d.group}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-white/90 font-medium">{d.label}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-white/60">{d.baseline.toFixed(2)}×</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-white">
                          <span className="inline-flex items-center gap-1">
                            <ArrowRight className="h-3 w-3 text-white/30" />
                            {d.next.toFixed(2)}×
                          </span>
                        </td>
                        <td className={`py-1.5 px-2 text-right tabular-nums font-bold ${tone}`}>
                          {up ? "+" : ""}{d.pctChange.toFixed(0)}%
                        </td>
                        <td className="py-1.5 pl-3 text-white/70">
                          <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                            {d.impacts.map((m, idx) => (
                              <li key={idx} className="flex items-center gap-1">
                                <span className={`h-1 w-1 ${up ? "bg-[hsl(142,76%,55%)]" : "bg-[hsl(0,75%,65%)]"}`} />
                                <span className="text-[10px]">{m}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-2 pt-2 border-t border-white/10 text-[9px] uppercase tracking-brand text-white/40">
                Roll-up: blended index {preview.blended.toFixed(2)}× ({preview.blendedDelta >= 1 ? "+" : ""}{((preview.blendedDelta - 1) * 100).toFixed(0)}% vs auto) ·
                projected daily spend ${preview.projDailySpend.toFixed(0)} (was ${preview.dailySpend.toFixed(0)}) ·
                projected ROAS {preview.projRoas.toFixed(2)}× (was {preview.trueRoas.toFixed(2)}×).
              </div>
            </div>
          )}
        </div>
        </TooltipProvider>
      )}

      {/* Footer legend */}
      <div className="mt-3 pt-2 border-t border-white/10 flex flex-wrap items-center gap-3 text-[9px] uppercase tracking-brand text-white/40">
        <span className="flex items-center gap-1"><span className="h-2 w-2 bg-[hsl(142,76%,45%)]" /> Boost</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 bg-[hsl(45,95%,55%)]" /> Hold</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 bg-[hsl(0,75%,55%)]" /> Pull back</span>
        <span className="ml-auto">Center line = 1.00× baseline</span>
      </div>
    </div>
  );
}