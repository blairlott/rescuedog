import { Link } from "react-router-dom";
import { Wine, Sparkles, Gift } from "lucide-react";

const HALF_CASE = 6;
const FULL_CASE = 12;
const CLUB_DISCOUNT = 0.2;

interface CartUpsellBannerProps {
  totalBottles: number;
  cartTotal: number;
}

export function CartUpsellBanner({ totalBottles, cartTotal }: CartUpsellBannerProps) {
  const clubSavings = cartTotal * CLUB_DISCOUNT;

  return (
    <div className="space-y-2">
      {/* Bottle count nudge */}
      {totalBottles > 0 && totalBottles < HALF_CASE && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm">
          <Wine className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-amber-800 dark:text-amber-200">
            Add <strong>{HALF_CASE - totalBottles} more bottle{HALF_CASE - totalBottles !== 1 ? 's' : ''}</strong> for a half-case — save on shipping!
          </p>
        </div>
      )}

      {totalBottles >= HALF_CASE && totalBottles < FULL_CASE && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm">
          <Gift className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-amber-800 dark:text-amber-200">
            You're <strong>{FULL_CASE - totalBottles} bottle{FULL_CASE - totalBottles !== 1 ? 's' : ''}</strong> away from a full case — save 10%!
          </p>
        </div>
      )}

      {totalBottles >= FULL_CASE && (
        <div className="flex items-start gap-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-sm">
          <Gift className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
          <p className="text-green-700 dark:text-green-300 font-semibold">
            🎉 Full case! You qualify for 10% off at checkout.
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
