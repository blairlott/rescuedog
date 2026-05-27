import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Bot, TrendingUp, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMemo } from "react";
import { Seo } from "@/components/Seo";

type Arm = {
  id: string;
  arm_key: string;
  channel: string;
  label: string | null;
  status: string;
  exposures: number;
  rewards: number;
  reward_value: number;
  last_reward_at: string | null;
  created_at: string;
};

type Experiment = {
  id: string;
  key: string;
  name: string;
  slot_key: string;
  status: string;
  primary_metric: string;
  exploration_floor: number;
  decay_half_life_days: number;
  reward_weight_order: number;
  created_at: string;
};

type Variant = {
  id: string;
  experiment_id: string;
  key: string;
  name: string;
  exposures: number;
  conversions: number;
  revenue_cents: number;
  is_control: boolean;
};

type SegStat = {
  experiment_id: string;
  variant_id: string;
  segment_bucket: string;
  exposures: number;
  conversions: number;
  revenue_cents: number;
  decayed_exposures: number;
  decayed_reward: number;
};

export default function KennelBanditPage() {
  const { data: arms = [], isLoading } = useQuery({
    queryKey: ["bandit-arms"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bandit_arms" as any)
        .select("*")
        .order("reward_value", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Arm[];
    },
  });

  const { data: experiments = [], isLoading: expLoading } = useQuery({
    queryKey: ["ts-experiments"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("experiments")
        .select("*")
        .eq("status", "running")
        .order("slot_key", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Experiment[];
    },
  });

  const { data: variants = [] } = useQuery({
    queryKey: ["ts-variants", experiments.map((e) => e.id).join(",")],
    enabled: experiments.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("experiment_variants")
        .select("*")
        .in(
          "experiment_id",
          experiments.map((e) => e.id),
        );
      if (error) throw error;
      return (data ?? []) as unknown as Variant[];
    },
  });

  const { data: segStats = [] } = useQuery({
    queryKey: ["ts-seg-stats", experiments.map((e) => e.id).join(",")],
    enabled: experiments.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("experiment_variant_segment_stats")
        .select("*")
        .in(
          "experiment_id",
          experiments.map((e) => e.id),
        );
      if (error) throw error;
      return (data ?? []) as unknown as SegStat[];
    },
  });

  const grouped = useMemo(() => {
    return experiments.map((exp) => {
      const vs = variants.filter((v) => v.experiment_id === exp.id);
      const totalExposures = vs.reduce((s, v) => s + Number(v.exposures || 0), 0);
      const rows = vs.map((v) => {
        const pooled = segStats.filter((s) => s.variant_id === v.id);
        const de = pooled.reduce((s, x) => s + Number(x.decayed_exposures || 0), 0);
        const dr = pooled.reduce((s, x) => s + Number(x.decayed_reward || 0), 0);
        const expo = Number(v.exposures || 0);
        const conv = Number(v.conversions || 0);
        const rev = Number(v.revenue_cents || 0);
        // Same smoothed mean as get_slot_variant_scores
        const score = de >= 1 ? (dr + 1) / (de + 4) : 0.25;
        const rpv = expo > 0 ? rev / expo / 100 : 0;
        const cvr = expo > 0 ? conv / expo : 0;
        const share = totalExposures > 0 ? expo / totalExposures : 0;
        return { v, score, rpv, cvr, share, expo, conv, rev };
      });
      rows.sort((a, b) => b.score - a.score);
      const best = rows[0];
      const exploredEnough = totalExposures >= exp.exploration_floor;
      return { exp, rows, totalExposures, best, exploredEnough };
    });
  }, [experiments, variants, segStats]);

  return (
    <>
      <Seo noindex title="Kennel Bandit" />
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <Bot className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold uppercase tracking-brand">Bandit Lab</h1>
        <Badge variant="outline" className="uppercase tracking-brand text-[10px]" style={{ borderRadius: 0 }}>
          Thompson Sampling · MABWiser
        </Badge>
      </div>

      <Tabs defaultValue="onsite" className="w-full">
        <TabsList className="bg-muted/50" style={{ borderRadius: 0 }}>
          <TabsTrigger value="onsite" className="uppercase tracking-brand text-xs">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            On-site experiments
          </TabsTrigger>
          <TabsTrigger value="ads" className="uppercase tracking-brand text-xs">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
            Paid ads (LinUCB)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="onsite" className="space-y-4 mt-4">
          <div className="text-xs text-muted-foreground border border-border p-3 bg-muted/30" style={{ borderRadius: 0 }}>
            Per-segment Thompson Sampling across hero, cart upsell, PDP pairing, post-purchase, recommended rail, and
            Smart Sort slots. Reward = decayed revenue-per-impression (14d half-life). Variants below the exploration
            floor are still exploring — promote winners only once the floor is cleared.
          </div>

          {expLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : grouped.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No running experiments yet.</p>
          ) : (
            <div className="space-y-6">
              {grouped.map(({ exp, rows, totalExposures, best, exploredEnough }) => (
                <div key={exp.id} className="border border-border" style={{ borderRadius: 0 }}>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                    <div>
                      <div className="text-xs uppercase tracking-brand font-bold">{exp.slot_key}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{exp.key}</div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-brand">
                      <Badge variant="outline" style={{ borderRadius: 0 }}>{exp.primary_metric}</Badge>
                      <Badge
                        variant={exploredEnough ? "default" : "outline"}
                        style={{ borderRadius: 0 }}
                      >
                        {totalExposures} / {exp.exploration_floor} exposures
                      </Badge>
                      <Badge variant="outline" style={{ borderRadius: 0 }}>
                        decay {exp.decay_half_life_days}d
                      </Badge>
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-background">
                      <tr className="text-left uppercase tracking-brand text-[10px] text-muted-foreground">
                        <th className="px-3 py-2">Variant</th>
                        <th className="px-2 py-2 text-right">Exposures</th>
                        <th className="px-2 py-2 text-right">Conv.</th>
                        <th className="px-2 py-2 text-right">CVR</th>
                        <th className="px-2 py-2 text-right">RPV</th>
                        <th className="px-2 py-2 text-right">Score</th>
                        <th className="px-2 py-2 text-right">Lift</th>
                        <th className="px-2 py-2 text-right">Traffic</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const isBest = best && r.v.id === best.v.id;
                        const lift = best && best.score > 0 ? (r.score - best.score) / best.score : 0;
                        return (
                          <tr key={r.v.id} className="border-t border-border">
                            <td className="px-3 py-1.5">
                              <span className={isBest ? "font-bold text-primary" : ""}>{r.v.name || r.v.key}</span>
                              {r.v.is_control && (
                                <span className="ml-1.5 text-[9px] uppercase tracking-brand text-muted-foreground">control</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{r.expo}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{r.conv}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{(r.cvr * 100).toFixed(1)}%</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">${r.rpv.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{r.score.toFixed(3)}</td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${isBest ? "text-muted-foreground" : lift < 0 ? "text-destructive" : "text-foreground"}`}>
                              {isBest ? "—" : `${(lift * 100).toFixed(1)}%`}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{(r.share * 100).toFixed(0)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ads" className="space-y-4 mt-4">
          <div className="text-xs text-muted-foreground border border-border p-3 bg-muted/30" style={{ borderRadius: 0 }}>
            Contextual bandit replacing Z1/Z3 heuristics. Arms = Meta ad IDs from Evergreen Max Volume. Context =
            channel, audience_tier (1-3), day_of_week, hour_of_day. Reward = 14d rolling attributed sales / spend.
          </div>
          {isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : arms.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No arms registered yet. Bandit microservice will seed arms from Meta ad set on first run.
            </p>
          ) : (
            <div className="border border-border" style={{ borderRadius: 0 }}>
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-left uppercase tracking-brand">
                    <th className="px-2 py-2">Arm</th>
                    <th className="px-2 py-2">Channel</th>
                    <th className="px-2 py-2 text-right">Exposures</th>
                    <th className="px-2 py-2 text-right">Rewards</th>
                    <th className="px-2 py-2 text-right">Reward Value</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Last Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {arms.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="px-2 py-1.5 font-mono">{a.label || a.arm_key}</td>
                      <td className="px-2 py-1.5">{a.channel}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{a.exposures}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{a.rewards}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{Number(a.reward_value).toFixed(3)}</td>
                      <td className="px-2 py-1.5">{a.status}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {a.last_reward_at ? new Date(a.last_reward_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </>
  );
}