import { Truck } from "lucide-react";
import { useCartSettings } from "@/hooks/useCartSettings";
import {
  VS_FLAT_SHIPPING_MIN_BOTTLES,
  VS_FLAT_SHIPPING_USD,
} from "@/lib/vinoshipperConfig";

interface Props {
  mode?: "wine" | "merch";
}

/** Wide banner sitting above product grids. Mode-aware: wine = bottle count, merch = dollar threshold. */
export function ShippingIncludedBanner({ mode = "wine" }: Props) {
  const { freeShippingBottleCount, merchFreeShippingThreshold } = useCartSettings();
  if (mode === "merch") {
    return (
      <div className="mb-6 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-center gap-2 text-center">
        <Truck className="w-4 h-4 shrink-0" />
        <p className="text-xs sm:text-sm font-bold uppercase tracking-brand">
          Shipping Included on Merch Orders ${merchFreeShippingThreshold}+
        </p>
      </div>
    );
  }
  return (
    <div className="mb-6 bg-primary text-primary-foreground px-4 py-2.5 flex flex-col items-center justify-center gap-0.5 text-center">
      <div className="flex items-center gap-2">
        <Truck className="w-4 h-4 shrink-0" />
        <p className="text-xs sm:text-sm font-bold uppercase tracking-brand">
          Shipping Included on {freeShippingBottleCount}+ Bottles of Wine
        </p>
      </div>
      <p className="text-[10px] sm:text-xs uppercase tracking-brand opacity-90">
        Flat ${VS_FLAT_SHIPPING_USD.toFixed(2)} shipping on {VS_FLAT_SHIPPING_MIN_BOTTLES}+ bottles
      </p>
    </div>
  );
}
