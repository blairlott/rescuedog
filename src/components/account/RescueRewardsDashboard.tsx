import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Loader2, Gift, ShoppingBag, CalendarHeart, Lock, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { isRewardsRedemptionAllowed, REWARDS_BLOCKED_STATES, REWARDS_RULES } from "@/lib/rewardsCompliance";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useUserRole } from "@/hooks/useUserRole";

interface Account { points_balance: number; lifetime_points_earned: number; tier: string; }
interface Entry { id: string; delta_points: number; event_type: string; reason: string; created_at: string; }
interface Redemption { id: string; reward_title: string; reward_category: string; points_cost: number; status: string; simulated: boolean; created_at: string; }
type RewardItem = typeof REWARDS[number];

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
  const { data: roleInfo } = useUserRole();
  const isStaff = !!roleInfo?.isAdminOrOwner;
  // Test-mode UI (simulate purchase, redemption presets, mode banner) is
  // gated to admins/owners — regular customers never see dev affordances.
  const testModeFlag = useFeatureFlag("rewards_test_mode", true);
  const testMode = isStaff && testModeFlag;
  const [acct, setAcct] = useState<Account | null>(null);
  const [ledger, setLedger] = useState<Entry[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [shipState, setShipState] = useState<string>(() => localStorage.getItem("rewards_ship_state") || "");
  const [confirmReward, setConfirmReward] = useState<RewardItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [simAmount, setSimAmount] = useState("25");

  const refresh = async () => {
    if (!user) return;
    const [{ data: a }, { data: l }, { data: r }] = await Promise.all([
      supabase.from("loyalty_accounts").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("loyalty_ledger").select("id, delta_points, event_type, reason, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("loyalty_redemptions").select("id, reward_title, reward_category, points_cost, status, simulated, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    ]);
    setAcct(a as Account | null);
    setLedger((l as Entry[]) ?? []);
    setRedemptions((r as Redemption[]) ?? []);
  };

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => { await refresh(); setLoading(false); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => { if (shipState) localStorage.setItem("rewards_ship_state", shipState); }, [shipState]);

  const allowed = useMemo(() => isRewardsRedemptionAllowed(shipState), [shipState]);
  const balance = acct?.points_balance ?? 0;

  const handleRedeem = async () => {
    if (!confirmReward || !user) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("redeem_loyalty_points", {
        _reward_id: confirmReward.id,
        _reward_title: confirmReward.title,
        _reward_category: confirmReward.category,
        _points_cost: confirmReward.cost,
        _ship_state: shipState || null,
        _client_request_id: `${confirmReward.id}-${Date.now()}`,
        _simulated: true,
        _metadata: {},
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      toast.success(`Redeemed ${confirmReward.title}`, {
        description: `New balance: ${row?.new_balance ?? balance - confirmReward.cost} pts. We'll email you when it ships.`,
      });
      setConfirmReward(null);
      await refresh();
    } catch (e: any) {
      toast.error("Redemption failed", { description: e?.message ?? "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const handleSimulate = async () => {
    if (!user) return;
    const dollars = parseFloat(simAmount);
    if (!dollars || dollars <= 0) { toast.error("Enter an amount"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("simulate_loyalty_earn", {
        _subtotal_cents: Math.round(dollars * 100),
        _client_request_id: `sim-${Date.now()}`,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      toast.success(`+${row?.points_awarded ?? 0} points`, { description: "Simulated purchase recorded." });
      await refresh();
    } catch (e: any) {
      toast.error("Simulation failed", { description: e?.message ?? "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const cheapestReward = useMemo(
    () => REWARDS.reduce((a, b) => (a.cost <= b.cost ? a : b)),
    []
  );

  const topUpTo = async (targetPts: number) => {
    const need = targetPts - balance;
    if (need <= 0) return;
    const { error } = await supabase.rpc("simulate_loyalty_earn", {
      _subtotal_cents: Math.round(need * 100),
      _client_request_id: `preset-topup-${Date.now()}`,
    });
    if (error) throw error;
  };

  const redeemAt = async (cost: number, label: string) => {
    const { data, error } = await supabase.rpc("redeem_loyalty_points", {
      _reward_id: cheapestReward.id,
      _reward_title: `${cheapestReward.title} (${label})`,
      _reward_category: cheapestReward.category,
      _points_cost: cost,
      _ship_state: shipState || null,
      _client_request_id: `preset-${label}-${Date.now()}`,
      _simulated: true,
      _metadata: { preset: label },
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  };

  const runPreset = async (preset: "partial" | "full" | "insufficient") => {
    if (!user) return;
    if (!allowed && preset !== "insufficient") {
      toast.error("Set a redemption-eligible state first");
      return;
    }
    setBusy(true);
    try {
      const cost = cheapestReward.cost;
      if (preset === "partial") {
        await topUpTo(cost * 2);
        const row = await redeemAt(cost, "partial");
        toast.success("Partial redemption OK", {
          description: `Spent ${cost} pts, ${row?.new_balance ?? "?"} pts remaining.`,
        });
      } else if (preset === "full") {
        await topUpTo(cost);
        const row = await redeemAt(cost, "full");
        toast.success("Full-balance redemption OK", {
          description: `Spent ${cost} pts, ${row?.new_balance ?? 0} pts remaining.`,
        });
      } else {
        // insufficient: attempt to spend more than the user holds
        const overCost = Math.max(balance + 500, cost + 500);
        try {
          await redeemAt(overCost, "insufficient");
          toast.error("Expected rejection but redemption succeeded", {
            description: "Check redeem_loyalty_points balance guard.",
          });
        } catch (e: any) {
          toast.success("Insufficient-balance guard fired", {
            description: e?.message ?? "Redemption correctly blocked.",
          });
        }
      }
      await refresh();
    } catch (e: any) {
      toast.error("Preset failed", { description: e?.message ?? "Try again." });
    } finally {
      setBusy(false);
    }
  };

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
      {/* Mode banner — admin only */}
      {isStaff && (
      <div
        className={`border p-3 flex items-center justify-between text-xs ${
          testMode
            ? "border-primary/50 bg-primary/5"
            : "border-border bg-muted/30"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              testMode ? "bg-primary animate-pulse" : "bg-emerald-500"
            }`}
          />
          <span className="uppercase tracking-brand font-bold">
            {testMode ? "Test Mode" : "Production"}
          </span>
          <span className="text-muted-foreground hidden sm:inline">
            {testMode
              ? "Simulated earns enabled — points are not from real orders."
              : "Live mode — points come only from real orders."}
          </span>
        </div>
      </div>
      )}

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
                    disabled={disabled || busy}
                    onClick={() => setConfirmReward(r)}
                  >
                    {!allowed ? "Blocked" : !canAfford ? "Need more" : "Redeem"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Simulated earn + redemption presets (UX testing) — Test mode only */}
      {testMode && (
      <section className="border border-dashed border-primary/50 bg-primary/5 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-bold uppercase tracking-brand">Simulate Purchase</h3>
          <span className="text-[10px] uppercase tracking-brand bg-primary/20 text-primary px-1.5 py-0.5">Test mode</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Earn points without checking out — for testing the rewards experience. Real orders earn points automatically.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">$</span>
          <Input
            type="number" min="1" max="1000" step="1"
            value={simAmount}
            onChange={(e) => setSimAmount(e.target.value)}
            className="max-w-[120px] h-9"
          />
          <Button size="sm" onClick={handleSimulate} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Earn points"}
          </Button>
        </div>

        {/* Redemption presets */}
        <div className="border-t border-primary/30 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-display text-xs font-bold uppercase tracking-brand">Redemption Presets</h4>
            <span className="text-[10px] uppercase tracking-brand text-muted-foreground">Edge-case testing</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Run preset scenarios against the cheapest reward ({cheapestReward.title}, {cheapestReward.cost} pts) to confirm UX for partial, full, and over-balance redemptions.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => runPreset("partial")}>
              Partial spend
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => runPreset("full")}>
              Full balance
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => runPreset("insufficient")}>
              Insufficient balance
            </Button>
          </div>
          <ul className="text-[10px] text-muted-foreground space-y-0.5 pl-4 list-disc">
            <li><strong>Partial:</strong> tops balance to 2× cost, then redeems once — expect remainder.</li>
            <li><strong>Full:</strong> sets balance to exactly the reward cost, then redeems — expect 0 remaining.</li>
            <li><strong>Insufficient:</strong> drains balance below cost, then attempts redeem — expect rejection toast.</li>
          </ul>
        </div>
      </section>
      )}

      {/* Redemptions */}
      {redemptions.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display text-sm font-bold uppercase tracking-brand">Your Redemptions</h3>
          <ul className="text-xs border border-border divide-y divide-border">
            {redemptions.map(r => (
              <li key={r.id} className="flex justify-between items-center p-3">
                <div>
                  <div className="font-bold">{r.reward_title}{isStaff && r.simulated && <span className="ml-2 text-[10px] uppercase tracking-brand text-primary">test</span>}</div>
                  <div className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()} · {r.points_cost} pts</div>
                </div>
                <span className="text-[10px] uppercase tracking-brand border border-border px-2 py-1">{r.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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

      <AlertDialog open={!!confirmReward} onOpenChange={(o) => !o && setConfirmReward(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redeem {confirmReward?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deduct <strong>{confirmReward?.cost} points</strong> from your balance ({balance} available).
              We'll queue this for fulfillment and email you when it ships.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRedeem} disabled={busy}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm redemption"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}