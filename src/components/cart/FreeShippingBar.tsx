import { Progress } from "@/components/ui/progress";
import { Truck, PartyPopper } from "lucide-react";
import { useCartSettings } from "@/hooks/useCartSettings";

interface FreeShippingBarProps {
  /** For wine mode: bottle count. For merch mode: cart total in dollars. */
  totalBottles: number;
  cartTotal?: number;
  mode?: "wine" | "merch";
}

export function FreeShippingBar({ totalBottles, cartTotal = 0, mode = "wine" }: FreeShippingBarProps) {
  const { freeShippingBottleCount, merchFreeShippingThreshold } = useCartSettings();
  const isMerch = mode === "merch";
  const current = isMerch ? cartTotal : totalBottles;
  const target = isMerch ? merchFreeShippingThreshold : freeShippingBottleCount;
  const remaining = Math.max(0, target - current);
  const progress = Math.min(100, (current / target) * 100);
  const qualified = remaining <= 0;
  const remainingLabel = isMerch
    ? `$${remaining.toFixed(2)}`
    : `${remaining} more bottle${remaining !== 1 ? "s" : ""}`;

  return (
    <div className={`rounded-md p-3 text-sm ${qualified ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' : 'bg-muted border border-border'}`}>
      <div className="flex items-center gap-2 mb-2">
        {qualified ? (
          <>
            <PartyPopper className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
            <span className="font-semibold text-green-700 dark:text-green-300">
              Shipping included! 🎉
            </span>
          </>
        ) : (
          <>
            <Truck className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">
              {isMerch ? <>You're <strong>{remainingLabel}</strong> away from <strong>shipping included</strong></> : <>Add <strong>{remainingLabel}</strong> for <strong>shipping included</strong></>}
            </span>
          </>
        )}
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}
