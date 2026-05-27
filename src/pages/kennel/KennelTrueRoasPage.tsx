import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";

type DailyRow = {
  id: string;
  day: string;
  channel: string;
  campaign_id: string | null;
  spend_cents: number;
  platform_reported_revenue_cents: number;
  attributed_revenue_cents: number;
  conversions: number;
  attribution_quality: "full" | "partial" | "unmatched";
};

function fmt(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function roas(rev: number, spend: number) {
  if (!spend) return "—";
  return (rev / spend).toFixed(2) + "x";
}

export default function KennelTrueRoasPage() {
  const [running, setRunning] = useState(false);

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ["kennel-channel-perf-30d"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("channel_performance_daily")
        .select("*")
        .gte("day", since)
        .order("day", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DailyRow[];
    },
  });

  const { data: holdoutStats } = useQuery({
    queryKey: ["kennel-holdout-stats"],
    queryFn: async () => {
      const { count: total } = await supabase
        .from("holdout_assignments")
        .select("*", { count: "exact", head: true });
      const { count: inHoldout } = await supabase
        .from("holdout_assignments")
        .select("*", { count: "exact", head: true })
        .eq("in_holdout", true);
      return { total: total ?? 0, in_holdout: inHoldout ?? 0 };
    },
  });

  // Aggregate by channel for last 14d
  const byChannel = (() => {
    const since14 = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
    const recent = (rows ?? []).filter((r) => r.day >= since14);
    const map = new Map<string, { spend: number; platform_rev: number; true_rev: number; conversions: number; partial: boolean }>();
    for (const r of recent) {
      const v = map.get(r.channel) ?? { spend: 0, platform_rev: 0, true_rev: 0, conversions: 0, partial: false };
      v.spend += r.spend_cents;
      v.platform_rev += r.platform_reported_revenue_cents;
      v.true_rev += r.attributed_revenue_cents;
      v.conversions += r.conversions;
      if (r.attribution_quality === "partial") v.partial = true;
      map.set(r.channel, v);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].spend - a[1].spend);
  })();

  async function runRollup() {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("kennel-attribution-rollup", {
        body: { lookback_days: 30 },
      });
      if (error) throw error;
      toast.success("Attribution rollup complete");
      await refetch();
    } catch (e: any) {
      toast.error(`Rollup failed: ${e.message ?? e}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Seo noindex title="Kennel True Roas" />
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-brand">True ROAS</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vinoshipper-attributed revenue per channel vs. platform-reported. Last 14 days.
          </p>
        </div>
        <Button onClick={runRollup} disabled={running} style={{ borderRadius: 0 }}>
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Run rollup
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card style={{ borderRadius: 0 }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">Holdout assignments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{holdoutStats?.total ?? 0}</div>
            <div className="text-xs text-muted-foreground">
              {holdoutStats?.in_holdout ?? 0} in 5% holdout (incrementality control)
            </div>
          </CardContent>
        </Card>
        <Card style={{ borderRadius: 0 }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">Attribution model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Last-click 7d</div>
            <div className="text-xs text-muted-foreground">UTM-required. v1.</div>
          </CardContent>
        </Card>
        <Card style={{ borderRadius: 0 }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">UTM cutoff</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">May 15</div>
            <div className="text-xs text-muted-foreground">GTM Tag 92 live. Pre-cutoff = partial.</div>
          </CardContent>
        </Card>
      </div>

      <Card style={{ borderRadius: 0 }}>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-brand">Channel performance — 14 day</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
            </div>
          ) : byChannel.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No performance data yet. Run rollup or wait for the nightly job.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Channel</th>
                    <th className="py-2 pr-4 text-right">Spend</th>
                    <th className="py-2 pr-4 text-right">Platform rev</th>
                    <th className="py-2 pr-4 text-right">True rev</th>
                    <th className="py-2 pr-4 text-right">Platform ROAS</th>
                    <th className="py-2 pr-4 text-right">True ROAS</th>
                    <th className="py-2 pr-4 text-right">Conv</th>
                    <th className="py-2 pr-4">Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {byChannel.map(([channel, v]) => {
                    const trueR = v.spend ? v.true_rev / v.spend : 0;
                    const platR = v.spend ? v.platform_rev / v.spend : 0;
                    const gap = trueR && platR ? trueR / platR : 1;
                    return (
                      <tr key={channel} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-semibold capitalize">{channel}</td>
                        <td className="py-2 pr-4 text-right">{fmt(v.spend)}</td>
                        <td className="py-2 pr-4 text-right text-muted-foreground">{fmt(v.platform_rev)}</td>
                        <td className="py-2 pr-4 text-right font-semibold">{fmt(v.true_rev)}</td>
                        <td className="py-2 pr-4 text-right text-muted-foreground">{roas(v.platform_rev, v.spend)}</td>
                        <td className="py-2 pr-4 text-right font-semibold">
                          {roas(v.true_rev, v.spend)}
                          {gap < 0.7 && (
                            <Badge variant="destructive" className="ml-2 text-[10px]" style={{ borderRadius: 0 }}>
                              gap
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right">{v.conversions}</td>
                        <td className="py-2 pr-4">
                          {v.partial ? (
                            <Badge variant="secondary" className="text-[10px]" style={{ borderRadius: 0 }}>
                              <AlertTriangle className="h-3 w-3 mr-1" /> partial
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600" style={{ borderRadius: 0 }}>
                              full
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card style={{ borderRadius: 0 }}>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-brand">Daily rows — 30 day</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Day</th>
                  <th className="py-2 pr-3">Channel</th>
                  <th className="py-2 pr-3">Campaign</th>
                  <th className="py-2 pr-3 text-right">Spend</th>
                  <th className="py-2 pr-3 text-right">True rev</th>
                  <th className="py-2 pr-3 text-right">ROAS</th>
                  <th className="py-2 pr-3 text-right">Conv</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-border/30">
                    <td className="py-1 pr-3">{r.day}</td>
                    <td className="py-1 pr-3 capitalize">{r.channel}</td>
                    <td className="py-1 pr-3 text-muted-foreground">{r.campaign_id ?? "—"}</td>
                    <td className="py-1 pr-3 text-right">{fmt(r.spend_cents)}</td>
                    <td className="py-1 pr-3 text-right">{fmt(r.attributed_revenue_cents)}</td>
                    <td className="py-1 pr-3 text-right">{roas(r.attributed_revenue_cents, r.spend_cents)}</td>
                    <td className="py-1 pr-3 text-right">{r.conversions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
    </>
  );
}