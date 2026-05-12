import { Link } from "react-router-dom";
import { Wine, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useCheckoutIntentStore } from "@/stores/checkoutIntentStore";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useIsMember } from "@/hooks/useIsMember";

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

  // Already a member — no need to upsell joining
  if (isMember) return null;

  const joining = intent === "club";
  const blockedBySubscribe = intent === "subscribe";

  const handleToggle = (next: boolean) => {
    setIntent(next ? "club" : "none");
  };

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
        <p className="mt-2 text-[11px] text-primary font-medium">
          ✓ 20% Member discount will be applied at checkout.
        </p>
      )}
    </div>
  );
}
