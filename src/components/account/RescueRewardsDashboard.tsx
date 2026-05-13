import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Loader2, Gift, ShoppingBag, CalendarHeart, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { isRewardsRedemptionAllowed, REWARDS_BLOCKED_STATES, REWARDS_RULES } from "@/lib/rewardsCompliance";

interface Account { points_balance: number; lifetime_points_earned: number; tier: string; }
interface Entry { id: string; delta_points: number; event_type: string; reason: string; created_at: string; }

const REWARDS = [
  { id: "merch-tee", category: "merch", title: "Rescue Dog Tee", cost: 1500, icon: ShoppingBag, desc: "Redeem points for any tee in the merch shop." },
  { id: "merch-hat", category: "merch", title: "Trucker Hat", cost: 1200, icon: ShoppingBag, desc: "Embroidered Rescue Dog hat." },
  { id: "exp-tasting", category: "experience", title: "Private Tasting Seat", cost: 2500, icon: CalendarHeart, desc: "One seat at an upcoming ambassador tasting." },
  { id: "donation-25", category: "donation", title: "$25 to Your Rescue", cost: 2500, icon: Heart, desc: "Direct donation to your favorite rescue partner." },
  { id: "donation-50", category: "donation", title: "$50 to Your Rescue", cost: 5000, icon: Heart, desc: "Direct donation to your favorite rescue partner." },
] as const;

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

export function RescueRewardsDashboard() {
  const { user } = useCustomerAuth();
  const [acct, setAcct] = useState<Account | null>(null);
  const [ledger, setLedger] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [shipState, setShipState] = useState<string>(() => localStorage.getItem("rewards_ship_state") || "");

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const [{ data: a }, { data: l }] = await Promise.all([
        supabase.from("loyalty_accounts").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("loyalty_ledger").select("id, delta_points, event_type, reason, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      ]);
      setAcct(a as Account | null);
      setLedger((l as Entry[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => { if (shipState) localStorage.setItem("rewards_ship_state", shipState); }, [shipState]);

  const allowed = useMemo(() => isRewardsRedemptionAllowed(shipState), [shipState]);
  const balance = acct?.points_balance ?? 0;

  if (!user) {
    return (
      <section className="border border-border bg-card p-6 text-center space-y-3">
        <Heart className="h-8 w-8 text-primary mx-auto" />
        <h2 className="font-display text-xl font-bold uppercase tracking-brand">Rescue Rewards</h2>
        <p className="text-sm text-muted-foreground">Sign in to view your points balance and redeem.</p>
        <Button asChild><Link to="/login">Sign In</Link></Button>
      </section>
    );
  }

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Balance hero */}
      <section className="border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-bold uppercase tracking-brand">Your Rewards</h2>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="border border-border p-3">
            <div className="text-2xl font-bold font-mono">{balance}</div>
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
          Earn 1 point per $1 spent (excludes shipping &amp; tax). Points expire after {REWARDS_RULES.pointsExpireMonths} months of account inactivity.
        </p>
      </section>

      {/* Shipping state gate */}
      <section className="border border-border p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-display text-sm font-bold uppercase tracking-brand">Shipping State</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Redemption availability depends on your shipping state. Set your state to see what you can redeem.
        </p>
        <Select value={shipState} onValueChange={setShipState}>
          <SelectTrigger className="max-w-[200px]"><SelectValue placeholder="Select state" /></SelectTrigger>
          <SelectContent>
            {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {shipState && !allowed && (
          <div className="border border-primary bg-primary/5 p-3 text-xs">
            <strong className="uppercase tracking-brand">Redemption unavailable in {shipState}.</strong>
            <p className="mt-1 text-muted-foreground">
              State alcohol-loyalty regulations restrict redemption in {REWARDS_BLOCKED_STATES.join(", ")}. You can still earn points on every order.
            </p>
          </div>
        )}
      </section>

      {/* Catalog */}
      <section className="space-y-3">
        <h3 className="font-display text-sm font-bold uppercase tracking-brand">Redeem</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {REWARDS.map(r => {
            const Icon = r.icon;
            const canAfford = balance >= r.cost;
            const disabled = !allowed || !canAfford;
            return (
              <div key={r.id} className="border border-border p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <h4 className="font-bold text-sm uppercase tracking-brand">{r.title}</h4>
                </div>
                <p className="text-xs text-muted-foreground flex-1">{r.desc}</p>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold">{r.cost} pts</span>
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() => alert(allowed ? "Redemption coming soon — your request will be queued for fulfillment." : "Redemption not available in your state.")}
                  >
                    {!allowed ? "Blocked" : !canAfford ? "Need more" : "Redeem"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Ledger */}
      <section className="space-y-3">
        <h3 className="font-display text-sm font-bold uppercase tracking-brand">Recent Activity</h3>
        {ledger.length === 0 ? (
          <p className="text-xs text-muted-foreground border border-border p-4">No activity yet — points appear here after your first qualifying order.</p>
        ) : (
          <ul className="text-xs border border-border divide-y divide-border">
            {ledger.map(e => (
              <li key={e.id} className="flex justify-between p-3">
                <span className="text-muted-foreground">{new Date(e.created_at).toLocaleDateString()} · {e.reason}</span>
                <span className={`font-mono font-bold ${e.delta_points >= 0 ? "text-primary" : "text-foreground"}`}>
                  {e.delta_points >= 0 ? "+" : ""}{e.delta_points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[10px] uppercase tracking-brand text-muted-foreground border-t border-border pt-3">
        Points are not redeemable on wine. Void where prohibited.{" "}
        <Link to="/rewards/terms" className="underline">Full terms</Link>.
      </p>
    </div>
  );
}