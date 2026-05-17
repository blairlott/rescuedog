import { useMemo, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useCartStore, CartItem } from "@/stores/cartStore";
import { toast } from "sonner";

/**
 * Inline variant swap for a cart line. Renders one chip per multi-value
 * product option (Size, Color, etc.). Picking a new value finds the matching
 * variant and hot-swaps it (remove + add, preserves quantity) so customers
 * don't have to delete and re-add the item to fix a size or color choice.
 *
 * Wine is single-variant by convention, so this is effectively a merch tool.
 */
export function CartLineSizePicker({ item }: { item: CartItem }) {
  const variants = useMemo(
    () => item.product.node.variants.edges.map(e => e.node).filter(v => v.availableForSale),
    [item.product],
  );

  // Surface every option that actually has more than one selectable value.
  const adjustableOptions = useMemo(
    () =>
      (item.product.node.options || []).filter(
        o => o.values.filter(Boolean).length > 1,
      ),
    [item.product],
  );

  if (adjustableOptions.length === 0 || variants.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
      {adjustableOptions.map(opt => (
        <CartLineOptionPicker
          key={opt.name}
          item={item}
          variants={variants}
          optionName={opt.name}
        />
      ))}
    </div>
  );
}

function CartLineOptionPicker({
  item,
  variants,
  optionName,
}: {
  item: CartItem;
  variants: CartItem["product"]["node"]["variants"]["edges"][number]["node"][];
  optionName: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const addItem = useCartStore(s => s.addItem);
  const removeItem = useCartStore(s => s.removeItem);

  const currentValue =
    item.selectedOptions?.find(o => o.name === optionName)?.value ?? "";

  // For the chosen option, list each distinct value with a backing variant
  // that matches every OTHER option already selected on this cart line.
  const valueChoices = useMemo(() => {
    const seen = new Map<string, typeof variants[number]>();
    for (const v of variants) {
      const value = v.selectedOptions?.find(o => o.name === optionName)?.value;
      if (!value) continue;
      const otherMatches = (item.selectedOptions || [])
        .filter(o => o.name !== optionName)
        .every(o => v.selectedOptions?.some(vo => vo.name === o.name && vo.value === o.value));
      if (!otherMatches) continue;
      if (!seen.has(value)) seen.set(value, v);
    }
    return Array.from(seen.entries()); // [value, variant][]
  }, [variants, optionName, item.selectedOptions]);

  if (valueChoices.length <= 1) return null;

  const isColor = /colou?r/i.test(optionName);

  const handleSwap = async (variant: typeof variants[number], label: string) => {
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
      toast.success(`${optionName} updated to ${label}`, { position: "top-center" });
      setOpen(false);
    } catch {
      toast.error(`Could not change ${optionName.toLowerCase()}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/80 hover:text-foreground underline-offset-2 hover:underline"
          disabled={busy}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {optionName}: <span className="font-semibold">{currentValue || "—"}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Change {optionName.toLowerCase()}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {valueChoices.map(([value, variant]) => {
            const isCurrent = variant.id === item.variantId;
            if (isColor) {
              return (
                <button
                  key={value}
                  type="button"
                  title={value}
                  disabled={busy}
                  onClick={() => handleSwap(variant, value)}
                  className={`h-7 px-2 inline-flex items-center gap-1.5 border text-[11px] ${
                    isCurrent ? "border-foreground" : "border-border hover:border-foreground/60"
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-3 w-3 inline-block border border-border"
                    style={{ background: cssColorFor(value) }}
                  />
                  {value}
                </button>
              );
            }
            return (
              <Button
                key={value}
                size="sm"
                variant={isCurrent ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                disabled={busy}
                onClick={() => handleSwap(variant, value)}
              >
                {value}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Best-effort CSS color from a Shopify color option value. */
function cssColorFor(value: string): string {
  const v = value.trim().toLowerCase();
  const named: Record<string, string> = {
    black: "#111111",
    white: "#f7f7f7",
    grey: "#9ca3af",
    gray: "#9ca3af",
    charcoal: "#374151",
    navy: "#1f2a44",
    blue: "#2563eb",
    red: "#c30017",
    burgundy: "#7a0f2b",
    wine: "#7a0f2b",
    green: "#15803d",
    olive: "#6b7a3a",
    cream: "#f3ead0",
    tan: "#d1b48c",
    brown: "#6b4423",
    pink: "#ec4899",
    purple: "#7c3aed",
    yellow: "#facc15",
    orange: "#f97316",
  };
  for (const key of Object.keys(named)) {
    if (v.includes(key)) return named[key];
  }
  // Hex passthrough (e.g. "#abc123")
  if (/^#?[0-9a-f]{6}$/i.test(v)) return v.startsWith("#") ? v : `#${v}`;
  return "#d4d4d4";
}
