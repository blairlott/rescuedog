import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Truck, Lock } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { WineClubDisclaimer } from "@/components/WineClubDisclaimer";
import { useCheckoutIntentStore } from "@/stores/checkoutIntentStore";
import { useState } from "react";

const FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "bimonthly", label: "Every 2 Months" },
  { value: "quarterly", label: "Every 3 Months" },
] as const;

// Subscribe & Save tiers — mirror VS / Shopify SUBSAVE codes.
// Discount is driven by cart subtotal, not frequency.
const SUBSAVE_TIERS = [
  { minSubtotal: 350, percent: 20 },
  { minSubtotal: 200, percent: 15 },
  { minSubtotal: 100, percent: 10 },
  { minSubtotal: 0,   percent: 5  },
] as const;
const MAX_SUBSAVE_PERCENT = SUBSAVE_TIERS[0].percent;

function getTier(subtotal: number) {
  return SUBSAVE_TIERS.find((t) => subtotal >= t.minSubtotal) ?? SUBSAVE_TIERS[SUBSAVE_TIERS.length - 1];
}
function getNextTier(subtotal: number) {
  const higher = SUBSAVE_TIERS.filter((t) => t.minSubtotal > subtotal);
  return higher.length ? higher[higher.length - 1] : null;
}

interface CartSubscribeToggleProps {
  price: number;
  quantity: number;
  cartSubtotal: number;
}

export function CartSubscribeToggle({ price, quantity, cartSubtotal }: CartSubscribeToggleProps) {
  const [frequency, setFrequency] = useState("monthly");
  const { user } = useCustomerAuth();
  const intent = useCheckoutIntentStore((s) => s.intent);
  const setIntent = useCheckoutIntentStore((s) => s.setIntent);

  const enabled = intent === "subscribe";
  const blockedByClub = intent === "club";
  const handleToggle = (next: boolean) => setIntent(next ? "subscribe" : "none");

  const tier = getTier(cartSubtotal);
  const nextTier = getNextTier(cartSubtotal);
  const lineTotal = price * quantity;
  const savings = lineTotal * (tier.percent / 100);
  const amountToNext = nextTier ? Math.max(0, nextTier.minSubtotal - cartSubtotal) : 0;

  return (
    <div className={`mt-2 rounded border text-xs transition-colors ${enabled ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"}`}>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
          <span className="font-medium">Subscribe & Save</span>
          {!enabled && (
            <span className="text-muted-foreground">up to {MAX_SUBSAVE_PERCENT}%</span>
          )}
        </div>
        {user ? (
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={blockedByClub}
            className="scale-75 origin-right"
          />
        ) : (
          <Link
            to="/login"
            className="text-[10px] font-bold uppercase tracking-brand text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Lock className="w-3 h-3" />
            Sign in
          </Link>
        )}
      </div>

      {blockedByClub && user && !enabled && (
        <div className="px-2.5 pb-2 text-[11px] text-muted-foreground border-t border-border/50 pt-2">
          Wine Club join is active — discounts can't be combined.
        </div>
      )}

      {enabled && (
        <div className="px-2.5 pb-2.5 pt-0 space-y-2 border-t border-border/50">
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger className="h-7 text-xs mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-primary font-semibold">
            {tier.percent}% off — save ${savings.toFixed(2)} on this line
          </p>
          {nextTier && (
            <p className="text-[11px] text-muted-foreground">
              Add ${amountToNext.toFixed(2)} more to unlock {nextTier.percent}% off.
            </p>
          )}
          <p className="flex items-center gap-1 text-primary font-medium">
            <Truck className="w-3.5 h-3.5" />
            {quantity >= 6
              ? "Shipping now included with future Ship & Save Shipments"
              : "Shipping included with Ship & Save Shipments of 6 bottles or more"}
          </p>
          <WineClubDisclaimer variant="subscription" />
        </div>
      )}
    </div>
  );
}
