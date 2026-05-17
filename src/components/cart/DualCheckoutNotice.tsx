import { Wine, ShoppingBag, ShieldCheck } from "lucide-react";

interface DualCheckoutNoticeProps {
  wineCount: number;
  merchCount: number;
  wineTotal: number;
  merchTotal: number;
}

/**
 * Pre-checkout explainer for mixed carts (wine + merch).
 * Federal wine-shipping compliance requires wine and merch to be processed
 * as two separate transactions on two different licensed platforms — surface
 * that clearly so customers aren't surprised by two charges / two emails.
 */
export function DualCheckoutNotice({
  wineCount,
  merchCount,
  wineTotal,
  merchTotal,
}: DualCheckoutNoticeProps) {
  return (
    <div className="border border-primary/30 bg-primary/[0.04] p-3 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <p className="text-[11px] font-bold uppercase tracking-brand text-foreground">
          Two checkouts, one order
        </p>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Wine and merch ship from different licensed partners, so your order is
        split into <strong className="text-foreground">two separate charges</strong>
        {" "}and you'll receive <strong className="text-foreground">two confirmation emails</strong>.
        This is a federal wine-shipping requirement — not an extra fee.
      </p>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="border border-border bg-background p-2">
          <div className="flex items-center gap-1 mb-1">
            <Wine className="h-3 w-3 text-primary" />
            <span className="text-[9px] font-bold uppercase tracking-brand text-primary">
              Step 1 · Wine
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {wineCount} bottle{wineCount !== 1 ? "s" : ""} · 21+ ID at delivery
          </p>
          <p className="text-xs font-bold mt-1">${wineTotal.toFixed(2)}</p>
        </div>
        <div className="border border-border bg-background p-2">
          <div className="flex items-center gap-1 mb-1">
            <ShoppingBag className="h-3 w-3 text-muted-foreground" />
            <span className="text-[9px] font-bold uppercase tracking-brand text-muted-foreground">
              Step 2 · Merch
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {merchCount} item{merchCount !== 1 ? "s" : ""} · opens in a new tab
          </p>
          <p className="text-xs font-bold mt-1">${merchTotal.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}