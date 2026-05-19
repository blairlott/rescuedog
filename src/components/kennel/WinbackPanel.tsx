import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const SHARP = { borderRadius: 0 } as const;
const TIERS = ["tier_60", "tier_120", "tier_240", "tier_365"] as const;
const CHANNELS = ["mailchimp", "meta", "google"] as const;
const TIER_LABEL: Record<string, string> = {
  tier_60: "60-120d", tier_120: "120-240d", tier_240: "240-365d", tier_365: "365+d",
};

type Snap = { tier: string; channel: string; member_count: number; snapshot_date: string };

export function WinbackPanel() {
  const [latest, setLatest] = useState<Record<string, Snap>>({});
  const [active30d, setActive30d] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("winback_snapshots")
      .select("tier, channel, member_count, snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(500);
    const map: Record<string, Snap> = {};
    let active: number | null = null;
    for (const r of (data ?? []) as Snap[]) {
      const key = `${r.channel}:${r.tier}`;
      if (!map[key]) map[key] = r;
      if (r.tier === "active_30d" && r.channel === "mailchimp" && active === null) active = r.member_count;
    }
    setLatest(map);
    setActive30d(active);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const runNow = async (fn: string, label: string) => {
    setRunning(fn);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`${label} synced`);
      await load();
    } catch (e: any) {
      toast.error(`${label}: ${e.message ?? "failed"}`);
    } finally { setRunning(null); }
  };

  const totalPerTier = (tier: string) =>
    CHANNELS.map((c) => latest[`${c}:${tier}`]?.member_count ?? 0).reduce((a, b) => Math.max(a, b), 0);

  return (
    <Card className="p-4 md:p-5 border-2" style={SHARP}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="font-bold uppercase tracking-brand text-foreground">Winback automation</h3>
          <Badge className="bg-primary text-primary-foreground" style={SHARP}>
            60 / 120 / 240 / 365
          </Badge>
          {active30d !== null && (
            <span className="text-[11px] text-muted-foreground">
              {active30d.toLocaleString()} active-30d suppressed
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" style={SHARP} onClick={() => runNow("kennel-mailchimp-sync", "Mailchimp")} disabled={running !== null}>
            <RefreshCw className={`h-3 w-3 mr-1 ${running === "kennel-mailchimp-sync" ? "animate-spin" : ""}`} /> MC
          </Button>
          <Button size="sm" variant="outline" style={SHARP} onClick={() => runNow("kennel-winback-meta-sync", "Meta")} disabled={running !== null}>
            <RefreshCw className={`h-3 w-3 mr-1 ${running === "kennel-winback-meta-sync" ? "animate-spin" : ""}`} /> Meta
          </Button>
          <Button size="sm" variant="outline" style={SHARP} onClick={() => runNow("kennel-winback-google-sync", "Google")} disabled={running !== null}>
            <RefreshCw className={`h-3 w-3 mr-1 ${running === "kennel-winback-google-sync" ? "animate-spin" : ""}`} /> Google
          </Button>
          <Button size="sm" variant="outline" style={SHARP} onClick={() => runNow("kennel-winback-auto-recs", "Auto-recs")} disabled={running !== null}>
            Recs
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1 pr-2 uppercase tracking-brand">Tier</th>
                <th className="text-right py-1 pr-2 uppercase tracking-brand">Mailchimp</th>
                <th className="text-right py-1 pr-2 uppercase tracking-brand">Meta</th>
                <th className="text-right py-1 pr-2 uppercase tracking-brand">Google</th>
                <th className="text-right py-1 uppercase tracking-brand">Peak</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => (
                <tr key={t} className="border-b border-border/50">
                  <td className="py-1.5 pr-2 font-bold">{TIER_LABEL[t]}</td>
                  {CHANNELS.map((c) => {
                    const s = latest[`${c}:${t}`];
                    return (
                      <td key={c} className="py-1.5 pr-2 text-right tabular-nums font-mono">
                        {s ? s.member_count.toLocaleString() : "—"}
                      </td>
                    );
                  })}
                  <td className="py-1.5 text-right tabular-nums font-bold">
                    {totalPerTier(t).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground mt-2">
            Tiers ≥ 250 members trigger pending recommendations every 14 days. Approve in the Optimization console.
          </p>
        </div>
      )}
    </Card>
  );
}