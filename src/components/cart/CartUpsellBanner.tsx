import { Link } from "react-router-dom";
import { Wine, Sparkles, Gift } from "lucide-react";
import { useCartSettings } from "@/hooks/useCartSettings";

interface CartUpsellBannerProps {
  totalBottles: number;
  cartTotal: number;
}

export function CartUpsellBanner({ totalBottles, cartTotal }: CartUpsellBannerProps) {
  const { halfCaseCount, fullCaseCount, fullCaseDiscount, clubDiscount } = useCartSettings();
  const clubSavings = cartTotal * (clubDiscount / 100);

  return (
    <div className="space-y-2">
      {/* Bottle count nudge */}
      {totalBottles > 0 && totalBottles < halfCaseCount && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm">
          <Wine className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-amber-800 dark:text-amber-200">
            Add <strong>{halfCaseCount - totalBottles} more bottle{halfCaseCount - totalBottles !== 1 ? 's' : ''}</strong> for a half-case — save on shipping!
          </p>
        </div>
      )}

      {totalBottles >= halfCaseCount && totalBottles < fullCaseCount && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm">
          <Gift className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-amber-800 dark:text-amber-200">
            You're <strong>{fullCaseCount - totalBottles} bottle{fullCaseCount - totalBottles !== 1 ? 's' : ''}</strong> away from a full case — save {fullCaseDiscount}%!
          </p>
        </div>
      )}

      {totalBottles >= fullCaseCount && (
        <div className="flex items-start gap-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-sm">
          <Gift className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
          <p className="text-green-700 dark:text-green-300 font-semibold">
            🎉 Full case! You qualify for {fullCaseDiscount}% off at checkout.
          </p>
        </div>
      )}

      {/* Wine Club savings callout */}
      {cartTotal > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 p-3 text-sm">
          <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-foreground">
            Wine Club members save <strong>${clubSavings.toFixed(2)}</strong> on this order.{" "}
            <Link to="/club" className="text-primary font-semibold hover:underline">
              Join now →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
