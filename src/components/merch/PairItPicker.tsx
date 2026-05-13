import { useMemo } from "react";
import { Wine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProducts } from "@/hooks/useProducts";
import { useCartStore } from "@/stores/cartStore";
import { isWineProduct } from "@/lib/productUtils";
import { ShopifyProduct } from "@/lib/shopify";
import { toast } from "sonner";
import { isAgeVerified } from "@/lib/ageVerification";

interface Props {
  productHandle: string;
  productTitle: string;
  productCategory?: string;
}

const PAIRINGS: Record<string, string[]> = {
  // soft category → preferred wine handle order
  apparel: ["red-wine-blend", "cabernet-sauvignon", "chardonnay"],
  drinkware: ["chardonnay", "rescue-dog-wines-sauvignon-blanc", "rescue-dog-wines-ros-of-pinot-noir"],
  pet: ["red-wine-blend", "cabernet-sauvignon"],
  home: ["mthode-champenoise-sparkling-ros", "demisec-mthode-champenoise-sparkling-wine"],
  gift: ["mothers-day-6-pack", "rescue-dog-wines-ros-of-pinot-noir"],
};

export function PairItPicker({ productHandle, productTitle, productCategory }: Props) {
  const { data: products } = useProducts(200);
  const addItem = useCartStore((s) => s.addItem);

  // Compliance: never suggest wine on the merch site to a visitor who
  // hasn't confirmed they're 21+.
  if (!isAgeVerified()) return null;

  const recommended: ShopifyProduct | null = useMemo(() => {
    if (!products) return null;
    const wines = products.filter(isWineProduct);
    const rules = PAIRINGS[productCategory ?? "apparel"] ?? PAIRINGS.apparel;
    for (const handle of rules) {
      const w = wines.find((p) => p.node.handle === handle);
      if (w) return w;
    }
    return wines[0] ?? null;
  }, [products, productCategory]);

  if (!recommended || !products) return null;
  const merch = products.find((p) => p.node.handle === productHandle);
  if (!merch) return null;

  const wineNode = recommended.node;
  const merchPrice = parseFloat(merch.node.priceRange.minVariantPrice.amount);
  const winePrice = parseFloat(wineNode.priceRange.minVariantPrice.amount);
  const pairTotal = merchPrice + winePrice;
  // 10% off the wine when bought as part of a pair (capped at $5 to stay
  // simple). Real promo rules can be wired in later.
  const savings = Math.min(5, winePrice * 0.1);

  const addPair = async () => {
    const merchVariant = merch.node.variants.edges[0]?.node;
    const wineVariant = wineNode.variants.edges[0]?.node;
    if (!merchVariant || !wineVariant) return;
    await addItem({
      product: merch,
      variantId: merchVariant.id,
      variantTitle: merchVariant.title,
      price: merchVariant.price,
      quantity: 1,
      selectedOptions: merchVariant.selectedOptions ?? [],
    });
    await addItem({
      product: recommended,
      variantId: wineVariant.id,
      variantTitle: wineVariant.title,
      price: {
        amount: (winePrice - savings).toFixed(2),
        currencyCode: wineVariant.price.currencyCode,
      },
      quantity: 1,
      selectedOptions: wineVariant.selectedOptions ?? [],
    });
    toast.success(`Pair added — saved $${savings.toFixed(2)} on the wine`, {
      position: "top-center",
    });
  };

  return (
    <aside className="border border-border bg-secondary/40 p-4 mt-4">
      <p className="text-[10px] uppercase tracking-brand text-primary font-bold mb-3 flex items-center gap-1.5">
        <Wine className="w-3 h-3" /> Pair It
      </p>
      <div className="flex items-center gap-3">
        <div className="w-14 h-20 bg-background flex items-center justify-center flex-shrink-0">
          {wineNode.images.edges[0]?.node ? (
            <img
              src={wineNode.images.edges[0].node.url}
              alt={wineNode.title}
              className="max-h-full object-contain"
              loading="lazy"
            />
          ) : (
            <Wine className="w-6 h-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{wineNode.title}</p>
          <p className="text-xs text-muted-foreground">
            Pairs beautifully with {productTitle.split("—")[0].trim()}
          </p>
          <p className="text-xs mt-1">
            <span className="text-foreground font-bold">
              ${(pairTotal - savings).toFixed(2)}
            </span>
            <span className="text-muted-foreground line-through ml-2">
              ${pairTotal.toFixed(2)}
            </span>
          </p>
        </div>
        <Button
          onClick={addPair}
          size="sm"
          className="flex-shrink-0 bg-primary hover:bg-primary/90 uppercase tracking-brand text-[10px] font-bold h-9"
        >
          <Plus className="w-3 h-3 mr-1" /> Add Pair
        </Button>
      </div>
    </aside>
  );
}
