import { Truck } from "lucide-react";

/** Wide banner sitting above wine product grids. Clarifies the threshold applies to wine bottles, not merch. */
export function ShippingIncludedBanner() {
  return (
    <div className="mb-6 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-center gap-2 text-center">
      <Truck className="w-4 h-4 shrink-0" />
      <p className="text-xs sm:text-sm font-bold uppercase tracking-brand">
        Shipping Included on 6+ Bottles of Wine
      </p>
    </div>
  );
}
