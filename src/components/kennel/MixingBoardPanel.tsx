import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sliders } from "lucide-react";

type DowRow = { day_of_week: number; modifier: number; sample_days: number | null };
type MoRow = { month: number; budget_index: number };
type GeoRow = { state: string; modifier: number; tier: string | null; revenue_cents: number | null };
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

/** Vertical fader strip with LED column + knob. */
function Fader({
  label,
  sublabel,
  value,
  min,
  max,
  active,
  centerOne = true,
}: {
  label: string;
  sublabel?: string;
  value: number;
  min: number;
  max: number;
  active?: boolean;
  centerOne?: boolean;
}) {
  const p = pos(value, min, max);
  // Color: red below 1, green above 1, neutral near 1
  const delta = value - 1;
  const ledColor =
    delta > 0.15 ? "bg-[hsl(142,76%,45%)]"
    : delta < -0.15 ? "bg-[hsl(0,75%,55%)]"
    : "bg-[hsl(45,95%,55%)]";

  // LED ladder (20 segments)
  const segs = 20;
  const litCount = Math.round(p * segs);

  return (
    <div className={`flex flex-col items-center gap-1 px-1 py-2 ${active ? "bg-white/5" : ""}`} style={{ borderRadius: 0 }}>
      <div className={`text-[9px] font-bold tabular-nums leading-none ${delta > 0 ? "text-[hsl(142,76%,55%)]" : delta < 0 ? "text-[hsl(0,75%,65%)]" : "text-white/60"}`}>
        {fmtPct(value)}
      </div>
      <div className="relative w-5 h-24 bg-black border border-white/15" style={{ borderRadius: 0 }}>
        {/* center 1.0x marker */}
        {centerOne && (
          <div className="absolute left-0 right-0 border-t border-white/25" style={{ top: `${(1 - pos(1, min, max)) * 100}%` }} />
        )}
        {/* LED ladder */}
        <div className="absolute inset-0.5 flex flex-col-reverse gap-[1px]">
          {Array.from({ length: segs }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 ${i < litCount ? ledColor : "bg-white/5"}`}
              style={{ boxShadow: i < litCount ? "0 0 4px currentColor" : undefined }}
            />
          ))}
        </div>
        {/* knob */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-6 h-2 bg-gradient-to-b from-white/90 to-white/50 border border-black shadow-md"
          style={{ top: `calc(${(1 - p) * 100}% - 4px)`, borderRadius: 0 }}
        />
      </div>
      <div className={`text-[10px] font-bold tracking-brand uppercase leading-none ${active ? "text-white" : "text-white/70"}`}>
        {label}
      </div>
      {sublabel && <div className="text-[8px] text-white/40 leading-none">{sublabel}</div>}
    </div>
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
        supabase.from("kennel_bid_modifiers" as any).select("day_of_week, modifier, sample_days").order("day_of_week"),
        supabase.from("kennel_seasonality_curve" as any).select("month, budget_index").order("month"),
        supabase.from("kennel_geo_modifiers" as any).select("state, modifier, tier, revenue_cents").order("revenue_cents", { ascending: false, nullsFirst: false }).limit(8),
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

  const dowMap = new Map((data?.dow ?? []).map(r => [r.day_of_week, r]));
  const moMap = new Map((data?.mo ?? []).map(r => [r.month, r]));

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
          <span className="text-[10px] text-white/40 uppercase tracking-brand">Live mix · executive view</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-[hsl(142,76%,55%)] animate-pulse" />
          <span className="text-[9px] uppercase tracking-brand text-white/50">Signal</span>
        </div>
      </div>

      {isLoading ? (
        <div className="text-white/40 text-xs py-8 text-center uppercase tracking-brand">Warming up the board…</div>
      ) : (
        <>
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
                const v = r ? Number(r.modifier) : 1;
                return (
                  <Fader
                    key={i}
                    label={d}
                    value={v}
                    min={0.5}
                    max={2.0}
                    active={i === todayDow}
                    sublabel={r?.sample_days ? `${r.sample_days}d` : undefined}
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
                const r = moMap.get(month);
                const v = r ? Number(r.budget_index) : 1;
                return (
                  <Fader
                    key={month}
                    label={m}
                    value={v}
                    min={0.3}
                    max={3.0}
                    active={month === todayMo}
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
                  value={Number(g.modifier)}
                  min={0.5}
                  max={2.0}
                  sublabel={g.tier ?? undefined}
                />
              ))}
              {(data?.geo ?? []).length === 0 && (
                <div className="text-[10px] text-white/30 px-3 py-8 uppercase tracking-brand">No data</div>
              )}
            </div>
          </div>

          {/* RETENTION RISK MASTER VU */}
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
        </div>
        </>
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