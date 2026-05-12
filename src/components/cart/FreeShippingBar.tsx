import { Progress } from "@/components/ui/progress";
import { Truck, PartyPopper, Check, Percent } from "lucide-react";
import { useCartSettings } from "@/hooks/useCartSettings";
import { useIsMember } from "@/hooks/useIsMember";

interface FreeShippingBarProps {
  /** For wine mode: bottle count. For merch mode: cart total in dollars. */
  totalBottles: number;
  cartTotal?: number;
  mode?: "wine" | "merch";
}

export function FreeShippingBar({ totalBottles, cartTotal = 0, mode = "wine" }: FreeShippingBarProps) {
  const { freeShippingBottleCount, merchFreeShippingThreshold, fullCaseCount, fullCaseDiscount } = useCartSettings();
  const { isMember, discountPercent } = useIsMember();
  const isMerch = mode === "merch";

  // Merch mode: single shipping threshold (no case mechanic)
  if (isMerch) {
    const remaining = Math.max(0, merchFreeShippingThreshold - cartTotal);
    const progress = Math.min(100, (cartTotal / merchFreeShippingThreshold) * 100);
    const qualified = remaining <= 0;
    return (
      <div className={`rounded-md p-3 text-sm ${qualified ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' : 'bg-muted border border-border'}`}>
        <div className="flex items-center gap-2 mb-2">
          {qualified ? (
            <><PartyPopper className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" /><span className="font-semibold text-green-700 dark:text-green-300">Shipping included! 🎉</span></>
          ) : (
            <><Truck className="w-4 h-4 text-muted-foreground flex-shrink-0" /><span className="text-foreground">You're <strong>${remaining.toFixed(2)}</strong> away from <strong>shipping included</strong></span></>
          )}
        </div>
        <Progress value={progress} className="h-2" />
      </div>
    );
  }

  // Wine mode: stacked rewards. Tied-house / ABC laws prohibit giving away
  // merch with wine purchases — no "free gift" tiers allowed.
  // Members get the higher club discount on cases; everyone else sees the
  // public case discount.
  const effectiveCaseDiscount = isMember ? discountPercent : fullCaseDiscount;
  const milestones = [
    { at: freeShippingBottleCount, label: "Shipping included", icon: Truck },
    {
      at: fullCaseCount,
      label: isMember
        ? `Member case ${effectiveCaseDiscount}% off`
        : `Case ${effectiveCaseDiscount}% off`,
      icon: Percent,
    },
  ];
  const max = milestones[milestones.length - 1].at;
  const progress = Math.min(100, (totalBottles / max) * 100);
  const allDone = totalBottles >= max;

  return (
    <div className={`rounded-md p-3 text-xs ${allDone ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' : 'bg-muted border border-border'}`}>
      <div className="flex items-center gap-2 mb-2">
        {allDone ? (
          <><PartyPopper className="w-4 h-4 text-green-600 dark:text-green-400" /><span className="font-semibold text-green-700 dark:text-green-300">All rewards unlocked!</span></>
        ) : (
          <span className="text-foreground"><strong>{totalBottles}</strong> / {max} bottles toward your next reward</span>
        )}
      </div>
      <div className="relative">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between mt-2">
          {milestones.map((m) => {
            const reached = totalBottles >= m.at;
            const Icon = reached ? Check : m.icon;
            return (
              <div key={m.label} className="flex flex-col items-center gap-0.5 flex-1 text-center">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${reached ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-border text-muted-foreground'}`}>
                  <Icon className="w-3 h-3" />
                </div>
                <span className={`text-[10px] leading-tight ${reached ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                  {m.label}
                </span>
                <span className="text-[9px] text-muted-foreground">{m.at} bottles</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
