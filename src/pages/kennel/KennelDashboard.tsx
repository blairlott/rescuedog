import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard } from "@/components/kennel/MetricCard";
import { ChannelPerformanceTable, type ChannelRow } from "@/components/kennel/ChannelPerformanceTable";
import { SpendChart, type SpendDatum } from "@/components/kennel/SpendChart";
import { Button } from "@/components/ui/button";

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

  const { data, isLoading } = useQuery({
    queryKey: ["kennel-dashboard", range],
    queryFn: async () => {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - range);
      const fromIso = fromDate.toISOString().slice(0, 10);

      const [channelsRes, perfRes, syncRes] = await Promise.all([
        supabase.from("ad_channels" as any).select("id, name, platform").order("name"),
        supabase.from("ad_performance_daily" as any).select("channel_id, date, spend, impressions, clicks, conversions, revenue, roas, cpa").gte("date", fromIso).order("date"),
        supabase.from("channel_sync_status" as any).select("channel_id, last_primary_sync"),
      ]);
      return {
        channels: ((channelsRes.data as any) || []) as Channel[],
        perf: (((perfRes.data as any) || []) as PerfRow[]).map(r => ({
          ...r,
          spend: Number(r.spend), revenue: Number(r.revenue), roas: Number(r.roas), cpa: Number(r.cpa),
        })),
        sync: ((syncRes.data as any) || []) as SyncRow[],
      };
    },
  });

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

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground uppercase tracking-brand" style={{ fontFamily: '"Nunito Sans", system-ui, sans-serif' }}>
            Command Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Last {range} days · all channels</p>
        </div>
        <div className="flex gap-1">
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
        </div>
      </header>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Spend" value={`$${(aggregates?.spend ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
            <MetricCard label="Revenue" value={`$${(aggregates?.revenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
            <MetricCard label="ROAS" value={`${(aggregates?.roas ?? 0).toFixed(2)}x`} hint="Revenue ÷ Spend" />
            <MetricCard label="Conversions" value={(aggregates?.conversions ?? 0).toLocaleString()} hint={`$${(aggregates?.cpa ?? 0).toFixed(2)} CPA`} />
          </div>

          <SpendChart data={chartData} channels={channelNames} />

          <section>
            <h2 className="text-sm uppercase tracking-brand font-bold text-foreground mb-3">Channel breakdown</h2>
            <ChannelPerformanceTable rows={channelRows} />
          </section>
        </>
      )}
    </div>
  );
}