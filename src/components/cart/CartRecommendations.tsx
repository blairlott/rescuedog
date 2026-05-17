import { useState } from "react";
import { Wine, BadgePercent } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { useCartStore, CartItem } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCartSettings } from "@/hooks/useCartSettings";
import { isAgeVerified } from "@/lib/ageVerification";
import { isWineProduct } from "@/lib/productUtils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface CartRecommendationsProps {
  cartItems: CartItem[];
  cartTotal: number;
}

export function CartRecommendations({ cartItems, cartTotal }: CartRecommendationsProps) {
  const { data: allProducts } = useProducts(50);
  const addItem = useCartStore(state => state.addItem);
  const isLoading = useCartStore(state => state.isLoading);
  const applyDiscountCode = useCartStore(state => state.applyDiscountCode);
  const discountCodes = useCartStore(state => state.discountCodes);
  const { freeShippingBottleCount } = useCartSettings();
  // Local re-render trigger after the user confirms 21+ inline.
  const [ageOverride, setAgeOverride] = useState(false);

  if (!allProducts || allProducts.length === 0) return null;

  // Suggest the OPPOSITE kind of what's in the cart:
  // wine-only cart → recommend merch; merch-only → recommend wine.
  // Mixed or empty → fall back to anything not already in the cart.
  const cartVariantIds = new Set(cartItems.map(i => i.variantId));
  const hasWine = cartItems.some(i => i.product.node.productKind === "wine");
  const hasMerch = cartItems.some(i => i.product.node.productKind !== "wine");

  // Compliance: never recommend wine to visitors who haven't confirmed 21+.
  const ageOk = isAgeVerified() || ageOverride;
  const available = allProducts.filter(p => {
    const firstVariant = p.node.variants.edges[0]?.node;
    if (!firstVariant?.availableForSale) return false;
    if (cartVariantIds.has(firstVariant.id)) return false;
    if (!ageOk && (p.node.productKind === "wine" || isWineProduct(p))) return false;
    return true;
  });
  if (available.length === 0) return null;

  let pool = available;
  let heading = "You might also like";
  let isPairItBundle = false;
  if (hasWine && !hasMerch) {
    const merchOnly = available.filter(p => p.node.productKind !== "wine");
    if (merchOnly.length > 0) {
      pool = merchOnly;
      heading = "Pair it with merch";
      isPairItBundle = true;
    }
  } else if (hasMerch && !hasWine && ageOk) {
    const wineOnly = available.filter(p => p.node.productKind === "wine");
    if (wineOnly.length > 0) {
      pool = wineOnly;
      heading = "Add a bottle to go with it";
    }
  }
  const recommendations = pool.slice(0, 2);

  const handleAdd = async (
    product: typeof recommendations[0],
    variantOverride?: typeof recommendations[0]["node"]["variants"]["edges"][number]["node"],
  ) => {
    const variant = variantOverride ?? product.node.variants.edges[0]?.node;
    if (!variant) return;
    await addItem({
      product,
      variantId: variant.id,
      variantTitle: variant.title,
      price: variant.price,
      quantity: 1,
      selectedOptions: variant.selectedOptions || [],
    });
    const isWineRec = product.node.productKind === "wine";
    // Pair-It bundle: wine-only cart + adding a merch suggestion → 10% off merch.
    if (isPairItBundle && !isWineRec && !discountCodes.includes("PAIRIT10")) {
      const applied = await applyDiscountCode("PAIRIT10");
      if (applied) {
        toast.success("Pair-It bundle: 10% off merch applied", { position: "top-center" });
      }
    }
    if (!isWineRec) {
      toast.success(`${product.node.title} added to cart`, { position: "top-center" });
    } else {
      const currentBottles = useCartStore.getState().items
        .filter(i => i.product.node.productKind === "wine")
        .reduce((sum, i) => sum + i.quantity, 0);
      const remaining = freeShippingBottleCount - currentBottles;
      if (remaining > 0) {
        toast.success(`${product.node.title} added! ${remaining} more bottle${remaining !== 1 ? 's' : ''} for shipping included`, { position: "top-center" });
      } else {
        toast.success(`${product.node.title} added! Shipping included! 🎉`, { position: "top-center" });
      }
    }
  };

  // Merch-only cart, visitor not yet 21+ confirmed → show an inline opt-in
  // so they can unlock wine pairings without leaving the drawer.
  const showAgeUnlock = hasMerch && !hasWine && !ageOk;

  const confirmAge = () => {
    try {
      localStorage.setItem("rdw-age-verified", "true");
      localStorage.setItem("rdw_age_verified", "true");
    } catch {}
    setAgeOverride(true);
  };

  if (showAgeUnlock) {
    return (
      <div className="border border-primary/30 bg-primary/5 p-3 space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Wine className="w-3.5 h-3.5" /> Add a bottle?
        </p>
        <p className="text-xs text-muted-foreground">
          We pair our merch with award-winning wines from Lodi. Confirm you're 21+ to see pairings.
        </p>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={confirmAge}>
          I'm 21+ — show wine pairings
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{heading}</p>
        {isPairItBundle && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
            <BadgePercent className="w-3 h-3" /> 10% off
          </span>
        )}
      </div>
      {isPairItBundle && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          Add any merch to your wine order and we'll take 10% off the merch at checkout.
        </p>
      )}
      <div className="space-y-2">
        {recommendations.map(product => {
          const image = product.node.images.edges[0]?.node;
          const price = parseFloat(product.node.priceRange.minVariantPrice.amount);
          const discounted = isPairItBundle ? price * 0.9 : null;
          // A variant is "selectable" if there's more than one in-stock variant
          // OR the product exposes a Size option with more than one value. Wine
          // is single-variant by convention, so this only ever fires for merch.
          const variants = product.node.variants.edges.map(e => e.node).filter(v => v.availableForSale);
          const sizeOption = product.node.options?.find(o => /size/i.test(o.name));
          const needsSizeChoice = variants.length > 1 || (sizeOption && sizeOption.values.length > 1);
          return (
            <div key={product.node.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/50 border border-border">
              <div className="w-10 h-10 rounded overflow-hidden bg-secondary flex-shrink-0">
                {image && <img src={image.url} alt={image.altText || product.node.title} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{product.node.title}</p>
                {discounted !== null ? (
                  <p className="text-xs text-muted-foreground">
                    Add for <span className="line-through opacity-60">+${price.toFixed(2)}</span>{" "}
                    <span className="text-primary font-semibold">+${discounted.toFixed(2)}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Add for +${price.toFixed(2)}</p>
                )}
              </div>
              {needsSizeChoice ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs flex-shrink-0"
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Plus className="w-3 h-3 mr-1" />Pick size</>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-3 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Choose a size
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {variants.map(v => {
                        const sizeVal =
                          v.selectedOptions?.find(o => /size/i.test(o.name))?.value ?? v.title;
                        return (
                          <Button
                            key={v.id}
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={isLoading}
                            onClick={(e) => {
                              // Close popover by removing focus; Radix closes on outside click.
                              (e.currentTarget.closest("[data-radix-popper-content-wrapper]") as HTMLElement | null)
                                ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
                              void handleAdd(product, v);
                            }}
                          >
                            {sizeVal}
                          </Button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Size adjusts only this item — your other cart lines stay as-is.
                    </p>
                  </PopoverContent>
                </Popover>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs flex-shrink-0"
                  disabled={isLoading}
                  onClick={() => handleAdd(product)}
                >
                  {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Plus className="w-3 h-3 mr-1" />Add</>}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
