import { useEffect } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

interface Props {
  open: boolean;
  onDone: () => void;
  durationMs?: number;
}

/**
 * Branded interstitial shown for ~700ms before opening Shopify checkout
 * in a new tab. Keeps the handoff feeling intentional and on-brand
 * instead of a jarring jump to checkout.shopify.com.
 */
export const ShopifyHandoffInterstitial = ({ open, onDone, durationMs = 700 }: Props) => {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onDone, durationMs);
    return () => clearTimeout(t);
  }, [open, onDone, durationMs]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm"
      role="dialog"
      aria-live="polite"
      aria-label="Opening secure checkout"
    >
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em]">
            Rescue Dog Wines
          </span>
        </div>
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
        <p className="max-w-xs text-sm text-foreground">
          Opening your secure checkout…
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Payment is processed by our PCI-compliant partner. Every order helps fund a rescue partner.
        </p>
      </div>
    </div>
  );
};