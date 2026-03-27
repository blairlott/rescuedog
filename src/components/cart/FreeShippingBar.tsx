import { Progress } from "@/components/ui/progress";
import { Truck, PartyPopper } from "lucide-react";
import { useCartSettings } from "@/hooks/useCartSettings";

interface FreeShippingBarProps {
  totalBottles: number;
}

export function FreeShippingBar({ totalBottles }: FreeShippingBarProps) {
  const { freeShippingBottleCount } = useCartSettings();
  const remaining = Math.max(0, freeShippingBottleCount - totalBottles);
  const progress = Math.min(100, (totalBottles / freeShippingBottleCount) * 100);
  const qualified = remaining <= 0;

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
              Add <strong>{remaining} more bottle{remaining !== 1 ? 's' : ''}</strong> for <strong>shipping included</strong>
            </span>
          </>
        )}
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}
