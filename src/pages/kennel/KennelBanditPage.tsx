import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <Bot className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold uppercase tracking-brand">Bandit · MABWiser</h1>
        <Badge variant="outline" className="uppercase tracking-brand text-[10px]" style={{ borderRadius: 0 }}>
          Phase 1 · LinUCB
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground border border-border p-3 bg-muted/30" style={{ borderRadius: 0 }}>
        Contextual bandit replacing Z1/Z3 heuristics. Arms = Meta ad IDs from Evergreen Max Volume (act_23490172, campaign 6929798677659).
        Context = channel, audience_tier (1-3), day_of_week, hour_of_day. Reward = 14d rolling attributed sales / spend.
        Z8 reads ranked recs before pause/budget decisions; vinoshipper-poll fires reward updates. Read-only view.
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
    </div>
  );
}