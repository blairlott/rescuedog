import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useCartStore, CartItem } from "@/stores/cartStore";
import { toast } from "sonner";

/**
 * Inline size swap for a cart line. Only renders when the product has more
 * than one in-stock sized variant. Picking a new size removes the old line
 * and adds the chosen variant at the same quantity — so customers don't
 * have to delete + re-find the item just to fix an XL → L.
 */
export function CartLineSizePicker({ item }: { item: CartItem }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const addItem = useCartStore(s => s.addItem);
  const removeItem = useCartStore(s => s.removeItem);

  const variants = item.product.node.variants.edges.map(e => e.node).filter(v => v.availableForSale);
  const sizeOption = item.product.node.options?.find(o => /size/i.test(o.name));
  const hasSizes = variants.length > 1 || (sizeOption && sizeOption.values.length > 1);
  if (!hasSizes) return null;

  const currentSize =
    item.selectedOptions?.find(o => /size/i.test(o.name))?.value ?? item.variantTitle;

  const handleSwap = async (variant: typeof variants[number]) => {
    if (variant.id === item.variantId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const qty = item.quantity;
      await removeItem(item.variantId);
      await addItem({
        product: item.product,
        variantId: variant.id,
        variantTitle: variant.title,
        price: variant.price,
        quantity: qty,
        selectedOptions: variant.selectedOptions || [],
      });
      const newSize = variant.selectedOptions?.find(o => /size/i.test(o.name))?.value ?? variant.title;
      toast.success(`Size updated to ${newSize}`, { position: "top-center" });
      setOpen(false);
    } catch (err) {
      toast.error("Could not change size");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-medium text-foreground/80 hover:text-foreground underline-offset-2 hover:underline"
          disabled={busy}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Size: <span className="font-semibold">{currentSize}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Change size
        </p>
        <div className="flex flex-wrap gap-1.5">
          {variants.map(v => {
            const sizeVal = v.selectedOptions?.find(o => /size/i.test(o.name))?.value ?? v.title;
            const isCurrent = v.id === item.variantId;
            return (
              <Button
                key={v.id}
                size="sm"
                variant={isCurrent ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                disabled={busy}
                onClick={() => handleSwap(v)}
              >
                {sizeVal}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}