import { Link } from "react-router-dom";
import { Wine, Sparkles, Gift } from "lucide-react";
import { useCartSettings } from "@/hooks/useCartSettings";
import { useIsMember } from "@/hooks/useIsMember";

interface CartUpsellBannerProps {
  totalBottles: number;
  cartTotal: number;
}

export function CartUpsellBanner({ totalBottles, cartTotal }: CartUpsellBannerProps) {
  const { halfCaseCount, fullCaseCount, fullCaseDiscount, clubDiscount } = useCartSettings();
  const { isMember, discountPercent } = useIsMember();
  // Members earn the higher club discount on full cases; guests get the
  // public case discount.
  const effectiveCaseDiscount = isMember ? discountPercent : fullCaseDiscount;
  // For the "join the club" teaser, show the *incremental* savings a guest
  // would unlock by becoming a member (club rate − public case rate).
  const clubUpliftPct = Math.max(0, clubDiscount - fullCaseDiscount);
  const clubSavings = cartTotal * (clubUpliftPct / 100);

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
            You're <strong>{fullCaseCount - totalBottles} bottle{fullCaseCount - totalBottles !== 1 ? 's' : ''}</strong> away from a full case — save {effectiveCaseDiscount}%!
          </p>
        </div>
      )}

      {totalBottles >= fullCaseCount && (
        <div className="flex items-start gap-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-sm">
          <Gift className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
          <div className="text-green-700 dark:text-green-300 text-sm">
            <p className="font-semibold">
              🎉 Full case! You qualify for {effectiveCaseDiscount}% off at checkout{isMember ? " (Wine Club rate — auto-applied)" : ""}.
            </p>
            {!isMember && caseDiscountCode && (
              <p className="mt-1 text-[12px] font-normal">
                We'll auto-apply code{" "}
                <span className="font-mono font-bold tracking-wider bg-green-600 text-white px-1.5 py-0.5">
                  {caseDiscountCode}
                </span>{" "}
                at checkout.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Wine Club savings callout — only for non-members, and only when
          there's an actual uplift over the public case rate */}
      {cartTotal > 0 && !isMember && clubUpliftPct > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 p-3 text-sm">
          <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-foreground">
            Wine Club members save an extra <strong>${clubSavings.toFixed(2)}</strong> ({clubUpliftPct}% more) on this order.{" "}
            <Link to="/club" className="text-primary font-semibold hover:underline">
              Join now →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
