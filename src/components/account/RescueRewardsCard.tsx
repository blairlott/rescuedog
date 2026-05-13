import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";

interface Account { points_balance: number; lifetime_points_earned: number; tier: string; }
interface Entry { id: string; delta_points: number; event_type: string; reason: string; created_at: string; }

export function RescueRewardsCard() {
  const { user } = useCustomerAuth();
  const [acct, setAcct] = useState<Account | null>(null);
  const [ledger, setLedger] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: a }, { data: l }] = await Promise.all([
        supabase.from("loyalty_accounts").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("loyalty_ledger").select("id, delta_points, event_type, reason, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      ]);
      setAcct(a as Account | null);
      setLedger((l as Entry[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  if (!user) return null;

  return (
    <section className="border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Heart className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-bold uppercase tracking-brand">Rescue Rewards</h2>
      </div>
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="border border-border p-3">
              <div className="text-2xl font-bold font-mono">{acct?.points_balance ?? 0}</div>
              <div className="text-[10px] uppercase tracking-brand text-muted-foreground">Points</div>
            </div>
            <div className="border border-border p-3">
              <div className="text-2xl font-bold font-mono">{acct?.lifetime_points_earned ?? 0}</div>
              <div className="text-[10px] uppercase tracking-brand text-muted-foreground">Lifetime</div>
            </div>
            <div className="border border-border p-3">
              <div className="text-sm font-bold uppercase tracking-brand">{acct?.tier ?? "Rescue"}</div>
              <div className="text-[10px] uppercase tracking-brand text-muted-foreground">Tier</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Earn 1 point per $1 spent. Redeem for swag, free shipping, or donate points to a rescue partner.
          </p>
          {ledger.length > 0 && (
            <ul className="text-xs space-y-1 border-t border-border pt-3">
              {ledger.map((e) => (
                <li key={e.id} className="flex justify-between">
                  <span className="text-muted-foreground">{new Date(e.created_at).toLocaleDateString()} · {e.reason}</span>
                  <span className={`font-mono font-bold ${e.delta_points >= 0 ? "text-primary" : "text-foreground"}`}>
                    {e.delta_points >= 0 ? "+" : ""}{e.delta_points}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}