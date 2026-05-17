import { useMemo, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { ShopifyProduct } from "@/lib/shopify";

type Variant = ShopifyProduct["node"]["variants"]["edges"][number]["node"];
type Option = ShopifyProduct["node"]["options"][number];

interface Props {
  product: ShopifyProduct;
  variants: Variant[];
  adjustableOptions: Option[];
  isLoading: boolean;
  onPick: (variant: Variant) => void;
}

/**
 * Popover-driven option picker for cart recommendations. Lets the customer
 * choose Size and/or Color (any multi-value option) before adding the merch
 * suggestion to the cart — no jumping out of the cart drawer.
 */
export function RecommendationOptionPicker({
  product,
  variants,
  adjustableOptions,
  isLoading,
  onPick,
}: Props) {
  const [open, setOpen] = useState(false);
  // Seed selection from the first in-stock variant so the picker is always
  // in a valid state — customer just confirms or changes individual options.
  const seed = variants[0]?.selectedOptions || [];
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(seed.map(o => [o.name, o.value])),
  );

  const matchedVariant = useMemo(
    () =>
      variants.find(v =>
        adjustableOptions.every(
          o => v.selectedOptions?.find(vo => vo.name === o.name)?.value === selected[o.name],
        ),
      ),
    [variants, adjustableOptions, selected],
  );

  const handleConfirm = () => {
    if (!matchedVariant) return;
    onPick(matchedVariant);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs flex-shrink-0"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <>
              <Plus className="w-3 h-3 mr-1" />
              Pick {adjustableOptions.map(o => o.name.toLowerCase()).join(" & ")}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 space-y-3">
        {adjustableOptions.map(opt => {
          const isColor = /colou?r/i.test(opt.name);
          return (
            <div key={opt.name} className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {opt.name}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {opt.values.filter(Boolean).map(value => {
                  const isCurrent = selected[opt.name] === value;
                  if (isColor) {
                    return (
                      <button
                        key={value}
                        type="button"
                        title={value}
                        onClick={() =>
                          setSelected(prev => ({ ...prev, [opt.name]: value }))
                        }
                        className={`h-7 px-2 inline-flex items-center gap-1.5 border text-[11px] ${
                          isCurrent
                            ? "border-foreground"
                            : "border-border hover:border-foreground/60"
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
                      onClick={() =>
                        setSelected(prev => ({ ...prev, [opt.name]: value }))
                      }
                    >
                      {value}
                    </Button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <Button
          size="sm"
          className="w-full h-8 text-xs"
          disabled={!matchedVariant || isLoading}
          onClick={handleConfirm}
        >
          {matchedVariant
            ? `Add to cart`
            : "Unavailable combo"}
        </Button>
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
  if (/^#?[0-9a-f]{6}$/i.test(v)) return v.startsWith("#") ? v : `#${v}`;
  return "#d4d4d4";
}
