import { Progress } from "@/components/ui/progress";
import { Truck, PartyPopper } from "lucide-react";

const FREE_SHIPPING_THRESHOLD = 150;

interface FreeShippingBarProps {
  cartTotal: number;
}

export function FreeShippingBar({ cartTotal }: FreeShippingBarProps) {
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - cartTotal);
  const progress = Math.min(100, (cartTotal / FREE_SHIPPING_THRESHOLD) * 100);
  const qualified = remaining <= 0;

  return (
    <div className={`rounded-md p-3 text-sm ${qualified ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' : 'bg-muted border border-border'}`}>
      <div className="flex items-center gap-2 mb-2">
        {qualified ? (
          <>
            <PartyPopper className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
            <span className="font-semibold text-green-700 dark:text-green-300">
              You've earned FREE shipping! 🎉
            </span>
          </>
        ) : (
          <>
            <Truck className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">
              Add <strong>${remaining.toFixed(2)}</strong> more for <strong>FREE shipping</strong>
            </span>
          </>
        )}
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}

export { FREE_SHIPPING_THRESHOLD };
