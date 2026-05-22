import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtCents } from "@/lib/financeTiles";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fetchConversionPathways } from "@/lib/wineClubMembers";
import { format } from "date-fns";
import { AdCommandTiles } from "@/components/kennel/AdCommandTiles";
import { KennelSystemHealthStrip } from "@/components/kennel/KennelSystemHealthStrip";
import { CronStatusPanel } from "@/components/kennel/CronStatusPanel";
import { IngestionStatusPanel } from "@/components/kennel/IngestionStatusPanel";
import { RetentionRiskPanel } from "@/components/kennel/RetentionRiskPanel";
import { ConversionPathwaysPanel } from "@/components/kennel/ConversionPathwaysPanel";

const PIE_COLORS = ["#c30017", "#222", "#888", "#c97a85", "#5a5a5a", "#a93a45"];

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function rangeDates(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  return { start: isoDate(start), end: isoDate(end) };
}

/** Use explicit start/end if provided, else compute from rolling `days`. */
function resolveRange(days: number, start?: string, end?: string) {
  if (start && end) return { start, end };
  return rangeDates(days);
}

export type TileRangeProps = { days: number; start?: string; end?: string };

function Loading() { return <div className="text-xs text-muted-foreground">Loading…</div>; }
function Empty({ msg = "No data in range" }: { msg?: string }) {
  return <div className="text-xs text-muted-foreground py-4">{msg}</div>;
}

/**
 * Shows a red config warning when a tile has data flowing in but key fields
 * (vendor names, categories, subcategories, etc.) are missing/unparsed —
 * i.e. QuickBooks is not configured to standard accounting practices.
 */
function QbConfigWarning({ field }: { field: string }) {
  return (
    <div className="border border-red-600 bg-red-50 dark:bg-red-950/30 p-2 text-[11px] text-red-700 dark:text-red-400 mb-2">
      <strong>QuickBooks not parsing {field}.</strong> Data is flowing but {field} are blank.
      Configure QBO to standard accounting practices (require {field} on every transaction)
      so this tile renders accurately.
    </div>
  );
}

/* ---------------- QuickBooks tiles ---------------- */

export function QbPnlTile({ days, start: s, end: e }: TileRangeProps) {
  const { start, end } = resolveRange(days, s, e);
  const { data, isLoading } = useQuery({
    queryKey: ["finance_pnl_summary", start, end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("finance_pnl_summary" as any, { _start: start, _end: end });
      if (error) throw error;
      return data as Array<{ entry_type: string; total_cents: number; txn_count: number }>;
    },
  });
  if (isLoading) return <Loading />;
  if (!data?.length) return <Empty />;
  const get = (k: string) => Number(data.find(d => d.entry_type === k)?.total_cents ?? 0);
  const revenue = get("revenue");
  const cogs = get("cogs");
  const expense = get("expense");
  const refund = get("refund");
  const net = revenue - cogs - expense - refund;
  const rows = [
    { label: "Revenue", v: revenue, pos: true },
    { label: "COGS", v: cogs, pos: false },
    { label: "Operating Expense", v: expense, pos: false },
    { label: "Refunds", v: refund, pos: false },
    { label: "Net", v: net, pos: net >= 0 },
  ];
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.label} className="flex items-center justify-between text-sm border-b border-border py-1.5 last:border-0">
          <span className="text-muted-foreground">{r.label}</span>
          <span className={`tabular-nums font-medium ${r.label === "Net" ? (r.pos ? "text-emerald-600" : "text-destructive") : ""}`}>
            {r.label === "Revenue" || r.label === "Net" ? "" : "-"}{fmtCents(r.v)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function QbRevenueChannelTile({ days, start: s, end: e }: TileRangeProps) {
  const { start, end } = resolveRange(days, s, e);
  const { data, isLoading } = useQuery({
    queryKey: ["finance_revenue_by_channel", start, end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("finance_revenue_by_channel" as any, { _start: start, _end: end });
      if (error) throw error;
      return data as Array<{ channel: string; revenue_cents: number; orders: number }>;
    },
  });
  if (isLoading) return <Loading />;
  if (!data?.length) return <Empty />;
  const chartData = data.map(d => ({ name: d.channel, value: Number(d.revenue_cents) / 100 }));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={70} label={(e: any) => e.name}>
            {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function QbAdSpendTile({ days, start: s, end: e }: TileRangeProps) {
  const { start, end } = resolveRange(days, s, e);
  const { data, isLoading } = useQuery({
    queryKey: ["finance_spend_by_platform", start, end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("finance_spend_by_platform" as any, { _start: start, _end: end });
      if (error) throw error;
      return data as Array<{ platform: string; spend_cents: number }>;
    },
  });
  if (isLoading) return <Loading />;
  if (!data?.length) return <Empty msg="No ad spend recorded in range." />;
  const chartData = data.map(d => ({ name: d.platform, spend: Number(d.spend_cents) / 100 }));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
          <Bar dataKey="spend" fill="#c30017" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function QbCashTrendTile({ days, start: s, end: e }: TileRangeProps) {
  const { start, end } = resolveRange(days, s, e);
  const spanDays = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
  const bucket = spanDays <= 31 ? "day" : spanDays <= 120 ? "week" : "month";
  const { data, isLoading } = useQuery({
    queryKey: ["finance_cash_trend", start, end, bucket],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("finance_cash_trend" as any, { _start: start, _end: end, _bucket: bucket });
      if (error) throw error;
      return data as Array<{ bucket_start: string; cash_in_cents: number; cash_out_cents: number; net_cents: number }>;
    },
  });
  if (isLoading) return <Loading />;
  if (!data?.length) return <Empty />;
  const chartData = data.map(d => ({
    date: format(new Date(d.bucket_start), bucket === "day" ? "MMM d" : bucket === "week" ? "MMM d" : "MMM yy"),
    in: Number(d.cash_in_cents) / 100,
    out: Number(d.cash_out_cents) / 100,
    net: Number(d.net_cents) / 100,
  }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
          <Line type="monotone" dataKey="in" stroke="#10b981" name="Cash in" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="out" stroke="#c30017" name="Cash out" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="net" stroke="#222" name="Net" dot={false} strokeWidth={2} strokeDasharray="4 4" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function QbTopVendorsTile({ days, start: s, end: e }: TileRangeProps) {
  const { start, end } = resolveRange(days, s, e);
  const { data, isLoading } = useQuery({
    queryKey: ["finance_top_vendors", start, end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("finance_top_vendors" as any, { _start: start, _end: end, _limit: 100 });
      if (error) throw error;
      return data as Array<{ vendor: string; category: string; spend_cents: number; txn_count: number }>;
    },
  });
  const categories = useMemo(
    () => Array.from(new Set((data ?? []).map(d => d.category || "(uncategorized)"))).sort(),
    [data]
  );
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const toggle = (c: string) =>
    setExcluded(prev => {
      const n = new Set(prev);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  const filtered = useMemo(
    () => (data ?? []).filter(d => !excluded.has(d.category || "(uncategorized)")).slice(0, 8),
    [data, excluded]
  );
  if (isLoading) return <Loading />;
  if (!data?.length) return <Empty />;
  const unparsed = data.every(d => !d.vendor || d.vendor === "(unspecified)");
  return (
    <div className="space-y-1.5 text-sm">
      {unparsed && <QbConfigWarning field="vendor names" />}
      <div className="flex items-center justify-between pb-1">
        <div className="text-[11px] uppercase tracking-brand text-muted-foreground">
          {filtered.length} of {data.length} vendors
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs rounded-none">
              Categories {excluded.size > 0 && `(${categories.length - excluded.size}/${categories.length})`}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2 max-h-80 overflow-y-auto">
            <div className="flex items-center justify-between pb-2 mb-2 border-b">
              <button
                className="text-[11px] uppercase tracking-brand text-muted-foreground hover:text-foreground"
                onClick={() => setExcluded(new Set())}
              >
                Show all
              </button>
              <button
                className="text-[11px] uppercase tracking-brand text-muted-foreground hover:text-foreground"
                onClick={() => setExcluded(new Set(categories))}
              >
                Clear all
              </button>
            </div>
            <div className="space-y-1.5">
              {categories.map(c => (
                <label key={c} className="flex items-center gap-2 cursor-pointer text-xs py-0.5">
                  <Checkbox
                    checked={!excluded.has(c)}
                    onCheckedChange={() => toggle(c)}
                  />
                  <span className="truncate">{c}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {filtered.length === 0 && <Empty msg="All categories filtered out" />}
      {filtered.map(d => (
        <div key={`${d.vendor}-${d.category}`} className="flex items-center justify-between border-b border-border py-1.5 last:border-0">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{d.vendor}</div>
            <div className="text-xs text-muted-foreground truncate">{d.category}</div>
          </div>
          <div className="tabular-nums font-medium ml-3">{fmtCents(d.spend_cents)}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Vinoshipper tiles ---------------- */

function useVsSummary(days: number, s?: string, e?: string) {
  const { start, end } = resolveRange(days, s, e);
  return useQuery({
    queryKey: ["finance_vs_summary", start, end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("finance_vs_summary" as any, { _start: start, _end: end });
      if (error) throw error;
      const row = (data as any[])?.[0];
      return row as {
        order_count: number; revenue_cents: number; aov_cents: number;
        gross_revenue_cents: number; net_revenue_cents: number; discount_cents: number;
        wine_club_cents: number; ala_carte_cents: number; wholesale_cents: number;
      } | undefined;
    },
  });
}

export function VsSummaryTile({ days, start, end }: TileRangeProps) {
  const { data, isLoading } = useVsSummary(days, start, end);
  if (isLoading) return <Loading />;
  if (!data) return <Empty />;
  const rows = [
    { label: "Orders", v: Number(data.order_count).toLocaleString() },
    { label: "Gross Revenue", v: fmtCents(data.gross_revenue_cents ?? 0) },
    { label: "Net Revenue", v: fmtCents(data.net_revenue_cents ?? 0) },
    { label: "Discounts", v: fmtCents(data.discount_cents ?? 0) },
    { label: "Order Total (paid)", v: fmtCents(data.revenue_cents) },
    { label: "AOV", v: fmtCents(data.aov_cents) },
    { label: "DTC", v: fmtCents(data.ala_carte_cents + data.wine_club_cents) },
    { label: "Wholesale", v: fmtCents(data.wholesale_cents) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {rows.map(r => (
        <div key={r.label} className="border border-border p-2">
          <div className="text-[10px] uppercase tracking-brand text-muted-foreground">{r.label}</div>
          <div className="text-lg font-bold tabular-nums">{r.v}</div>
        </div>
      ))}
    </div>
  );
}

export function VsWcVsAlcTile({ days, start, end }: TileRangeProps) {
  const { data, isLoading } = useVsSummary(days, start, end);
  if (isLoading) return <Loading />;
  if (!data) return <Empty />;
  const chartData = [
    { name: "Wine Club", value: Number(data.wine_club_cents) / 100 },
    { name: "À la Carte", value: Number(data.ala_carte_cents) / 100 },
    { name: "Wholesale", value: Number(data.wholesale_cents) / 100 },
  ].filter(d => d.value > 0);
  if (!chartData.length) return <Empty />;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={70} label={(e: any) => e.name}>
            {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VsWaterfallTile({ days, start: s, end: e }: TileRangeProps) {
  const { start, end } = resolveRange(days, s, e);
  const { data, isLoading } = useQuery({
    queryKey: ["finance_vs_waterfall", start, end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("finance_vs_waterfall" as any, { _start: start, _end: end });
      if (error) throw error;
      return (data as any[])?.[0] as {
        gross_revenue_cents: number; discount_cents: number; net_revenue_cents: number;
        ala_carte_net_cents: number; wine_club_net_cents: number; wholesale_net_cents: number;
        cogs_cents: number; net_after_cogs_cents: number;
        converting_ad_spend_cents: number; contribution_after_ads_cents: number;
        net_after_cogs_and_ads_cents: number;
        ad_conversions: number; ad_attributed_revenue_cents: number;
      } | undefined;
    },
  });
  if (isLoading) return <Loading />;
  if (!data) return <Empty />;
  const finalNeg = Number(data.net_after_cogs_and_ads_cents) < 0;
  const contribNeg = Number(data.contribution_after_ads_cents) < 0;
  // Standard accounting waterfall, top-to-bottom. Subtotals are bold.
  type Row = { label: string; v: number; sub?: string; subtotal?: boolean; tone?: string; indent?: boolean };
  const rows: Row[] = [
    { label: "À la Carte Orders",                v: data.ala_carte_net_cents,         sub: "Net of discounts",                                              indent: true },
    { label: "Conversion-Attributed Orders",     v: data.ad_attributed_revenue_cents, sub: `${Number(data.ad_conversions).toLocaleString()} conv · Meta + Google (subset of above)`, indent: true },
    { label: "Wine Club Shipments",              v: data.wine_club_net_cents,         sub: "Net of discounts",                                              indent: true },
    ...(Number(data.wholesale_net_cents) > 0
      ? [{ label: "Wholesale *", v: data.wholesale_net_cents, sub: "Net of discounts", indent: true } as Row]
      : []),
    { label: "Net Revenue (Vinoshipper)",        v: data.net_revenue_cents,           sub: `Gross ${fmtCents(data.gross_revenue_cents)} − ${fmtCents(data.discount_cents)} discounts`, subtotal: true },
    { label: "Contribution after Ad Spend",      v: data.contribution_after_ads_cents, sub: `− ${fmtCents(data.converting_ad_spend_cents)} converting ad spend`, subtotal: true, tone: contribNeg ? "text-red-600 dark:text-red-400" : undefined },
    { label: "Net Profit (after COGS & Ads)",    v: data.net_after_cogs_and_ads_cents, sub: `− ${fmtCents(data.cogs_cents)} COGS (QBO)`,                    subtotal: true, tone: finalNeg ? "text-red-600 dark:text-red-400" : undefined },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div
          key={r.label}
          className={`flex items-baseline justify-between gap-3 px-2 py-1.5 ${
            r.subtotal ? "border-t-2 border-foreground bg-muted/30" : "border-b border-border/50"
          } ${r.indent ? "pl-4" : ""}`}
        >
          <div className="min-w-0">
            <div className={`text-[11px] uppercase tracking-brand ${r.subtotal ? "font-bold text-foreground" : "text-muted-foreground"}`}>
              {r.label}
            </div>
            {r.sub && <div className="text-[10px] text-muted-foreground truncate">{r.sub}</div>}
          </div>
          <div className={`tabular-nums whitespace-nowrap ${r.subtotal ? "text-lg font-bold" : "text-sm font-semibold"} ${r.tone ?? "text-foreground"}`}>
            {fmtCents(r.v)}
          </div>
        </div>
      ))}
      {data.converting_ad_spend_cents > 0 && (
        <div className="text-[10px] text-muted-foreground pt-1">
          Platform-reported ROAS:{" "}
          {(Number(data.ad_attributed_revenue_cents) / Number(data.converting_ad_spend_cents)).toFixed(2)}× ·
          Conversion-attributed lines reflect Meta + Google only.
        </div>
      )}
      {Number(data.wholesale_net_cents) > 0 && (
        <div className="text-[10px] text-muted-foreground pt-1 italic">
          * Wholesale reflects a one-off shipment via Vinoshipper, not a recurring channel.
        </div>
      )}
    </div>
  );
}

/* ---------------- Command Center read-only imports ---------------- */

export function CcRoasTile({ days, start: s, end: e }: TileRangeProps) {
  const { start, end } = resolveRange(days, s, e);
  const { data, isLoading, error } = useQuery({
    queryKey: ["finance_cc_roas", start, end],
    queryFn: async () => {
      // Pull revenue and ad spend from finance entries (same source the
      // Kennel uses for blended ROAS when GA/Meta data is missing).
      const [{ data: revRows, error: revErr }, { data: spendRows, error: spErr }] = await Promise.all([
        supabase.rpc("finance_pnl_summary" as any, { _start: start, _end: end }),
        supabase.rpc("finance_spend_by_platform" as any, { _start: start, _end: end }),
      ]);
      if (revErr) throw revErr;
      if (spErr) throw spErr;
      const revenue = Number((revRows as any[])?.find(r => r.entry_type === "revenue")?.total_cents ?? 0);
      const spend = ((spendRows as any[]) ?? []).reduce((s, r) => s + Number(r.spend_cents), 0);
      return { revenue, spend };
    },
  });
  if (isLoading) return <Loading />;
  if (error) {
    return (
      <div className="border border-red-600 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-400">
        <strong>Tile failed to load.</strong> {(error as Error).message}
      </div>
    );
  }
  if (!data) return <Empty />;
  const noData = data.revenue === 0 && data.spend === 0;
  const roas = data.spend > 0 ? data.revenue / data.spend : null;
  const mer = roas;
  return (
    <div className="grid grid-cols-2 gap-3">
      {noData && (
        <div className="col-span-2">
          <QbConfigWarning field="revenue or ad spend in this date range" />
        </div>
      )}
      <div className="border border-border p-2">
        <div className="text-[10px] uppercase tracking-brand text-muted-foreground">Revenue</div>
        <div className="text-lg font-bold tabular-nums">{fmtCents(data.revenue)}</div>
      </div>
      <div className="border border-border p-2">
        <div className="text-[10px] uppercase tracking-brand text-muted-foreground">Ad Spend</div>
        <div className="text-lg font-bold tabular-nums">{fmtCents(data.spend)}</div>
      </div>
      <div className="border border-border p-2 col-span-2">
        <div className="text-[10px] uppercase tracking-brand text-muted-foreground">Blended ROAS / MER</div>
        <div className="text-2xl font-bold tabular-nums">{roas != null ? `${roas.toFixed(2)}x` : "—"}</div>
        {mer != null && <div className="text-xs text-muted-foreground">Every $1 of ad spend → ${roas?.toFixed(2)} revenue</div>}
      </div>
    </div>
  );
}

export function CcWineClubTile({ days: _days }: { days: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["finance_cc_wine_club"],
    queryFn: async () => {
      const { count: active, error: e1 } = await supabase
        .from("wine_club_memberships" as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "active");
      const { count: cancelled, error: e2 } = await supabase
        .from("wine_club_memberships" as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "cancelled");
      if (e1) console.warn(e1.message); if (e2) console.warn(e2.message);
      return { active: active ?? 0, cancelled: cancelled ?? 0 };
    },
  });
  if (isLoading) return <Loading />;
  if (!data) return <Empty />;
  const total = data.active + data.cancelled;
  const churnPct = total > 0 ? (data.cancelled / total) * 100 : 0;
  // MRR approximation: active * average shipment value (placeholder $75)
  const estMrrCents = data.active * 7500;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="border border-border p-2">
        <div className="text-[10px] uppercase tracking-brand text-muted-foreground">Active Members</div>
        <div className="text-lg font-bold tabular-nums">{data.active}</div>
      </div>
      <div className="border border-border p-2">
        <div className="text-[10px] uppercase tracking-brand text-muted-foreground">Cancelled</div>
        <div className="text-lg font-bold tabular-nums">{data.cancelled}</div>
      </div>
      <div className="border border-border p-2">
        <div className="text-[10px] uppercase tracking-brand text-muted-foreground">Lifetime Churn</div>
        <div className="text-lg font-bold tabular-nums">{churnPct.toFixed(1)}%</div>
      </div>
      <div className="border border-border p-2">
        <div className="text-[10px] uppercase tracking-brand text-muted-foreground">Est. MRR</div>
        <div className="text-lg font-bold tabular-nums">{fmtCents(estMrrCents)}</div>
      </div>
    </div>
  );
}

export function CcPathwaysTile({ days: _days }: { days: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["finance_cc_pathways"],
    queryFn: async () => {
      try { return await fetchConversionPathways(); } catch { return null; }
    },
  });
  if (isLoading) return <Loading />;
  if (!data) return <Empty />;
  const rate = data.conversionRate != null ? `${(data.conversionRate * 100).toFixed(1)}%` : "—";
  const median = data.medianDaysToConvert != null ? `${data.medianDaysToConvert}d` : "—";
  const alc = data.alaCarte ? fmtCents(Math.round(data.alaCarte.totalRevenueCents)) : "—";
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="border border-border p-2">
        <div className="text-[10px] uppercase tracking-brand text-muted-foreground">Guest → Club</div>
        <div className="text-lg font-bold tabular-nums">{rate}</div>
      </div>
      <div className="border border-border p-2">
        <div className="text-[10px] uppercase tracking-brand text-muted-foreground">Median Days</div>
        <div className="text-lg font-bold tabular-nums">{median}</div>
      </div>
      <div className="border border-border p-2 col-span-2">
        <div className="text-[10px] uppercase tracking-brand text-muted-foreground">À la Carte Revenue</div>
        <div className="text-lg font-bold tabular-nums">{alc}</div>
      </div>
    </div>
  );
}

/* ---------------- Tile renderer ---------------- */

export function renderTile(key: string, days: number, range?: { start?: string; end?: string }) {
  const p = { days, start: range?.start, end: range?.end };
  switch (key) {
    case "qb_pnl": return <QbPnlTile {...p} />;
    case "qb_revenue_ch": return <QbRevenueChannelTile {...p} />;
    case "qb_ad_spend": return <QbAdSpendTile {...p} />;
    case "qb_cash_trend": return <QbCashTrendTile {...p} />;
    case "qb_top_vendors": return <QbTopVendorsTile {...p} />;
    case "vs_summary": return <VsSummaryTile {...p} />;
    case "vs_wc_vs_alc": return <VsWcVsAlcTile {...p} />;
    case "vs_waterfall": return <VsWaterfallTile {...p} />;
    case "cc_roas": return <CcRoasTile {...p} />;
    case "cc_wine_club": return <CcWineClubTile days={days} />;
    case "cc_pathways": return <CcPathwaysTile days={days} />;
    case "km_ad_command":    return <KennelMirror><AdCommandTiles /></KennelMirror>;
    case "km_system_health": return <KennelMirror><KennelSystemHealthStrip /></KennelMirror>;
    case "km_cron":          return <KennelMirror><CronStatusPanel /></KennelMirror>;
    case "km_ingestion":     return <KennelMirror><IngestionStatusPanel /></KennelMirror>;
    case "km_retention":     return <KennelMirror><RetentionRiskPanel /></KennelMirror>;
    case "km_pathways":      return <KennelMirror><ConversionPathwaysPanel /></KennelMirror>;
    default: return <Empty msg={`Unknown tile: ${key}`} />;
  }
}

/* ---------------- Kennel mirror wrapper ---------------- */

function KennelMirror({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute top-0 right-0 z-10 px-1.5 py-0.5 text-[9px] uppercase tracking-brand bg-foreground/10 text-foreground">
        Read-only · Kennel
      </div>
      <div className="pointer-events-none select-none">
        {children}
      </div>
    </div>
  );
}