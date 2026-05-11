import { Truck } from "lucide-react";
import { useCartSettings } from "@/hooks/useCartSettings";

interface Props {
  mode?: "wine" | "merch";
}

/** Wide banner sitting above product grids. Mode-aware: wine = bottle count, merch = dollar threshold. */
export function ShippingIncludedBanner({ mode = "wine" }: Props) {
  const { freeShippingBottleCount, merchFreeShippingThreshold } = useCartSettings();
  const label =
    mode === "merch"
      ? `Shipping Included on Merch Orders $${merchFreeShippingThreshold}+`
      : `Shipping Included on ${freeShippingBottleCount}+ Bottles of Wine`;
  return (
    <div className="mb-6 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-center gap-2 text-center">
      <Truck className="w-4 h-4 shrink-0" />
      <p className="text-xs sm:text-sm font-bold uppercase tracking-brand">{label}</p>
    </div>
  );
}
