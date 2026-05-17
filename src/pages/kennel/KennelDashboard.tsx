import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard } from "@/components/kennel/MetricCard";
import { ChannelPerformanceTable, type ChannelRow } from "@/components/kennel/ChannelPerformanceTable";
import { SpendChart, type SpendDatum } from "@/components/kennel/SpendChart";
import { VinoshipperPanel } from "@/components/kennel/VinoshipperPanel";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Range = 7 | 14 | 30;

interface PerfRow {
  channel_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
}
interface Channel { id: string; name: string; platform: string; }
interface SyncRow { channel_id: string; last_primary_sync: string | null; }

export default function KennelDashboard() {
  const [range, setRange] = useState<Range>(30);
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["kennel-dashboard", range],
    queryFn: async () => {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - range);
      const fromIso = fromDate.toISOString().slice(0, 10);

      const [channelsRes, perfRes, syncRes, dtcRes, bmRes, bmLifetimeRes] = await Promise.all([
        supabase.from("ad_channels" as any).select("id, name, platform").order("name"),
        supabase.from("ad_performance_daily" as any).select("channel_id, date, spend, impressions, clicks, conversions, revenue, roas, cpa").gte("date", fromIso).order("date"),
        supabase.from("channel_sync_status" as any).select("channel_id, last_primary_sync"),
        // Real DTC revenue: page through Vinoshipper transactions (canonical source).
        (async () => {
          const PAGE = 1000;
          const acc: { order_total: number; invoice: string }[] = [];
          for (let from = 0; from < 50000; from += PAGE) {
            const { data, error } = await supabase
              .from("vs_transactions" as any)
              .select("order_total, invoice")
              .gte("transaction_date", fromIso)
              .order("transaction_date", { ascending: true })
              .range(from, from + PAGE - 1);
            if (error) return { data: acc };
            const rows = (data as any[]) ?? [];
            acc.push(...rows);
            if (rows.length < PAGE) break;
          }
          return { data: acc };
        })(),
        // Brick & mortar — period rows for state/channel breakdown
        supabase
          .from("business_revenue_facts" as any)
          .select("date, channel, state, net_revenue_cents, units, orders")
          .in("channel", ["brick_mortar_off", "brick_mortar_on", "distributor_depletion"])
          .gte("date", fromIso),
        // Brick & mortar — lifetime totals
        supabase
          .from("business_revenue_facts" as any)
          .select("net_revenue_cents, units")
          .in("channel", ["brick_mortar_off", "brick_mortar_on", "distributor_depletion"]),
      ]);
      return {
        channels: ((channelsRes.data as any) || []) as Channel[],
        perf: (((perfRes.data as any) || []) as PerfRow[]).map(r => ({
          ...r,
          spend: Number(r.spend), revenue: Number(r.revenue), roas: Number(r.roas), cpa: Number(r.cpa),
        })),
        sync: ((syncRes.data as any) || []) as SyncRow[],
        dtc: ((dtcRes.data as any) || []) as { order_total: number; invoice: string }[],
        bm: ((bmRes.data as any) || []) as { date: string; channel: string; state: string | null; net_revenue_cents: number; units: number; orders: number }[],
        bmLifetime: ((bmLifetimeRes.data as any) || []) as { net_revenue_cents: number; units: number }[],
      };
    },
  });
  const dtc = useMemo(() => {
    if (!data) return { revenue: 0, orders: 0 };
    const invoices = new Set<string>();
    let revenue = 0;
    for (const r of (data.dtc ?? [])) {
      revenue += Number(r.order_total || 0);
      if (r.invoice) invoices.add(r.invoice);
    }
    return { revenue, orders: invoices.size };
  }, [data]);

  const bm = useMemo(() => {
    if (!data) return null;
    const rows = data.bm ?? [];
    let periodRev = 0, periodUnits = 0, periodOrders = 0;
    const byChannel = new Map<string, number>();
    const byState = new Map<string, number>();
    for (const r of rows) {
      const cents = Number(r.net_revenue_cents || 0);
      periodRev += cents;
      periodUnits += Number(r.units || 0);
      periodOrders += Number(r.orders || 0);
      byChannel.set(r.channel, (byChannel.get(r.channel) ?? 0) + cents);
      if (r.state) byState.set(r.state, (byState.get(r.state) ?? 0) + cents);
    }
    const lifetimeRev = (data.bmLifetime ?? []).reduce((s, r) => s + Number(r.net_revenue_cents || 0), 0);
    const lifetimeUnits = (data.bmLifetime ?? []).reduce((s, r) => s + Number(r.units || 0), 0);
    const topStates = Array.from(byState.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      periodRev: periodRev / 100,
      periodUnits,
      periodOrders,
      lifetimeRev: lifetimeRev / 100,
      lifetimeUnits,
      off: (byChannel.get("brick_mortar_off") ?? 0) / 100,
      on: (byChannel.get("brick_mortar_on") ?? 0) / 100,
      depl: (byChannel.get("distributor_depletion") ?? 0) / 100,
      topStates: topStates.map(([s, c]) => [s, c / 100] as [string, number]),
      hasData: rows.length > 0 || lifetimeRev > 0,
    };
  }, [data]);


  const aggregates = useMemo(() => {
    if (!data) return null;
    const totals = data.perf.reduce(
      (acc, r) => {
        acc.spend += r.spend;
        acc.revenue += r.revenue;
        acc.conversions += r.conversions;
        acc.clicks += r.clicks;
        return acc;
      },
      { spend: 0, revenue: 0, conversions: 0, clicks: 0 }
    );
    const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
    const cpa = totals.conversions > 0 ? totals.spend / totals.conversions : 0;
    return { ...totals, roas, cpa };
  }, [data]);

  const channelRows: ChannelRow[] = useMemo(() => {
    if (!data) return [];
    const syncMap = new Map(data.sync.map(s => [s.channel_id, s.last_primary_sync]));
    return data.channels.map(c => {
      const rows = data.perf.filter(r => r.channel_id === c.id);
      const spend = rows.reduce((s, r) => s + r.spend, 0);
      const revenue = rows.reduce((s, r) => s + r.revenue, 0);
      const impressions = rows.reduce((s, r) => s + r.impressions, 0);
      const clicks = rows.reduce((s, r) => s + r.clicks, 0);
      const conversions = rows.reduce((s, r) => s + r.conversions, 0);
      return {
        channel_id: c.id,
        name: c.name,
        platform: c.platform,
        spend, impressions, clicks, conversions, revenue,
        roas: spend > 0 ? revenue / spend : 0,
        cpa: conversions > 0 ? spend / conversions : 0,
        last_primary_sync: syncMap.get(c.id) ?? null,
      };
    });
  }, [data]);

  const chartData: SpendDatum[] = useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, SpendDatum>();
    const channelById = new Map(data.channels.map(c => [c.id, c.name]));
    for (const r of data.perf) {
      if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date.slice(5) });
      const row = byDate.get(r.date)!;
      const name = channelById.get(r.channel_id) ?? "Unknown";
      row[name] = (Number(row[name] ?? 0) + r.spend);
    }
    return Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [data]);

  const channelNames = data?.channels.map(c => c.name) ?? [];

  const lindyStale = useMemo(() => {
    if (!data) return false;
    const cutoff = Date.now() - 25 * 3600 * 1000;
    return data.sync.length > 0 && data.sync.every(s => !s.last_primary_sync || new Date(s.last_primary_sync).getTime() < cutoff);
  }, [data]);

  const runBackfill = async () => {
    setSyncing(true);
    try {
      toast.message("Pulling historical data…", { description: "Meta · Google · Instacart + Vinoshipper" });
      const [adRes, bizRes] = await Promise.all([
        supabase.functions.invoke("kennel-backfill-daily", { body: { days: 365 } }),
        supabase.functions.invoke("business-rollup", { body: { since: "2019-01-01" } }),
      ]);
      if (adRes.error) throw adRes.error;
      if (bizRes.error) throw bizRes.error;
      toast.success("Historical data synced");
      await qc.invalidateQueries({ queryKey: ["kennel-dashboard"] });
    } catch (e: any) {
      toast.error("Sync failed", { description: e?.message ?? String(e) });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] min-w-0">
      {lindyStale && (
        <div className="border-2 border-destructive bg-destructive/10 p-3 flex items-center gap-2 text-sm" style={{ borderRadius: 0 }}>
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <span><strong className="uppercase tracking-brand">Lindy silent &gt;25h.</strong> Verify ingestion mode in Settings.</span>
        </div>
      )}
      <header className="flex items-start md:items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground uppercase tracking-brand" style={{ fontFamily: '"Nunito Sans", system-ui, sans-serif' }}>
            Command Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Last {range} days · all channels</p>
        </div>
        <div className="flex gap-1 items-center flex-wrap">
          {([7, 14, 30] as Range[]).map(r => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "outline"}
              onClick={() => setRange(r)}
              style={{ borderRadius: 0 }}
              className="uppercase tracking-brand text-xs"
            >
              {r}d
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={runBackfill}
            disabled={syncing}
            style={{ borderRadius: 0 }}
            className="uppercase tracking-brand text-xs ml-2"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync history"}
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-brand font-bold text-muted-foreground">Paid media (ad channels)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="Ad Spend" value={`$${(aggregates?.spend ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} hint="Meta + Google + Instacart" />
              <MetricCard label="Attributed Revenue" value={`$${(aggregates?.revenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} hint="From ad platforms" />
              <MetricCard label="ROAS" value={`${(aggregates?.roas ?? 0).toFixed(2)}x`} hint="Attributed ÷ Spend" />
              <MetricCard label="Conversions" value={(aggregates?.conversions ?? 0).toLocaleString()} hint={`$${(aggregates?.cpa ?? 0).toFixed(2)} CPA`} />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-brand font-bold text-muted-foreground">DTC sales (Vinoshipper)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="DTC Revenue" value={`$${dtc.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} hint="Vinoshipper orders" />
              <MetricCard label="DTC Orders" value={dtc.orders.toLocaleString()} hint="From Z3a / CAPI feed" />
              <MetricCard label="True ROAS" value={(aggregates?.spend ?? 0) > 0 ? `${(dtc.revenue / (aggregates?.spend ?? 1)).toFixed(2)}x` : "—"} hint="DTC Revenue ÷ Ad Spend" />
              <MetricCard label="AOV" value={dtc.orders > 0 ? `$${(dtc.revenue / dtc.orders).toFixed(0)}` : "—"} hint="Average order value" />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-brand font-bold text-muted-foreground">Vinoshipper DTC (full history)</h2>
            <VinoshipperPanel rangeDays={range} />
          </section>

          <SpendChart data={chartData} channels={channelNames} />

          <section>
            <h2 className="text-sm uppercase tracking-brand font-bold text-foreground mb-3">Channel breakdown</h2>
            <ChannelPerformanceTable
              rows={channelRows}
              onRowClick={(r) => navigate(`/kennel/channels?platform=${encodeURIComponent(r.platform)}`)}
            />
          </section>
        </>
      )}
    </div>
  );
}