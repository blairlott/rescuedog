import { Link } from "react-router-dom";
import { Wine, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCheckoutIntentStore } from "@/stores/checkoutIntentStore";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useIsMember } from "@/hooks/useIsMember";
import { useWineClubTiers } from "@/hooks/useWineClub";
import { useEffect } from "react";

/**
 * Cart-level Wine Club join nudge. Toggling it ON applies the 20% member
 * discount to this order at the Vinoshipper handoff and enrolls the
 * customer in the club. Mutually exclusive with Subscribe & Save —
 * Vinoshipper does not stack member pricing with recurring-SKU discounts.
 */
export function CartWineClubUpsell() {
  const { user } = useCustomerAuth();
  const { isMember } = useIsMember();
  const intent = useCheckoutIntentStore((s) => s.intent);
  const setIntent = useCheckoutIntentStore((s) => s.setIntent);
  const clubTierId = useCheckoutIntentStore((s) => s.clubTierId);
  const setClubTierId = useCheckoutIntentStore((s) => s.setClubTierId);
  const { data: tiers } = useWineClubTiers();

  // Already a member — no need to upsell joining
  if (isMember) return null;

  const joining = intent === "club";
  const blockedBySubscribe = intent === "subscribe";

  // Default to lowest sort_order tier the first time user opts in
  useEffect(() => {
    if (joining && !clubTierId && tiers && tiers.length > 0) {
      setClubTierId(tiers[0].id);
    }
  }, [joining, clubTierId, tiers, setClubTierId]);

  const handleToggle = (next: boolean) => {
    setIntent(next ? "club" : "none");
    if (!next) setClubTierId(null);
  };

  const selectedTier = tiers?.find((t) => t.id === clubTierId) ?? null;

  return (
    <div
      className={`rounded border px-3 py-3 transition-colors ${
        joining ? "border-primary bg-primary/10" : "border-primary/20 bg-primary/5"
      }`}
    >
      <div className="flex items-center gap-3">
        <Wine className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">
            Join the Wine Club & save 20% today
          </p>
          <p className="text-[11px] text-muted-foreground">
            Applied to this order. Pick your tier after checkout · cancel anytime.
          </p>
        </div>
        {user ? (
          <Switch
            checked={joining}
            onCheckedChange={handleToggle}
            disabled={blockedBySubscribe}
            className="scale-90 origin-right"
          />
        ) : (
          <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </div>

      {!user && (
        <div className="mt-2 pt-2 border-t border-primary/20 flex gap-1.5">
          <Link
            to="/login"
            className="flex-1 text-center border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
          >
            Sign In
          </Link>
          <Link
            to="/signup"
            className="flex-1 text-center border border-primary bg-primary text-primary-foreground px-2 py-1 text-[11px] font-medium hover:bg-primary/90"
          >
            Create Account
          </Link>
        </div>
      )}

      {blockedBySubscribe && user && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Turn off Subscribe & Save above to join the Club instead — discounts can't combine.
        </p>
      )}

      {joining && (
        <div className="mt-3 pt-3 border-t border-primary/20 space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-brand text-foreground block">
            Choose your membership
          </label>
          <Select value={clubTierId ?? undefined} onValueChange={setClubTierId}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Select a club tier" />
            </SelectTrigger>
            <SelectContent>
              {(tiers ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">
                  {t.name} — {t.bottle_count} btl · {t.frequency} · ${(t.price_cents / 100).toFixed(0)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTier?.description && (
            <p className="text-[11px] text-muted-foreground">{selectedTier.description}</p>
          )}
          <p className="text-[11px] text-primary font-medium">
            ✓ 20% Member discount applied to this order. First club shipment ships next cycle.
          </p>
          <p className="text-[10px] text-muted-foreground">
            Change tier anytime in your account · cancel after first shipment.
          </p>
        </div>
      )}
    </div>
  );
}
