import { useMemo } from "react";
import { Shirt, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProducts } from "@/hooks/useProducts";
import { useCartStore } from "@/stores/cartStore";
import { isWineProduct } from "@/lib/productUtils";
import { ShopifyProduct } from "@/lib/shopify";
import { toast } from "sonner";
import { useBanditCandidate } from "@/hooks/useBanditCandidate";

interface Props {
  wineHandle: string;
  wineTitle: string;
}

/**
 * Reverse of PairItPicker — shown on a wine PDP, suggests a merch item
 * (glassware, tee, gift) to add alongside the bottle.
 */
export function PairWineWithMerch({ wineHandle, wineTitle }: Props) {
  const { data: products } = useProducts(200);
  const addItem = useCartStore((s) => s.addItem);
  const applyDiscountCode = useCartStore((s) => s.applyDiscountCode);
  const discountCodes = useCartStore((s) => s.discountCodes);

  // Stable candidate pool: all merch SKUs, alphabetized for deterministic
  // signature so the bandit doesn't re-ensure on every render.
  const merchPool = useMemo(() => {
    if (!products) return [];
    return products
      .filter((p) => !isWineProduct(p))
      .sort((a, b) => a.node.handle.localeCompare(b.node.handle))
      .slice(0, 12);
  }, [products]);

  const candidates = useMemo(
    () => merchPool.map((p) => ({ ref: p.node.handle, type: "merch" })),
    [merchPool],
  );

  // Static heuristic stays as the fallback while bandit warms up.
  const heuristicPick = useMemo(() => {
    if (!merchPool.length) return null;
    const preferred = merchPool.find((p) => {
      const tags = (p.node.tags || []).map((t) => t.toLowerCase());
      return tags.includes("wine-bar") || tags.includes("drinkware");
    });
    return preferred ?? merchPool[0];
  }, [merchPool]);

  const pick = useBanditCandidate(
    "pdp_pairing_merch_pick",
    candidates,
    heuristicPick?.node.handle ?? null,
    { name: "PDP wine→merch pairing", primaryMetric: "revenue_per_visitor", explorationFloor: 100 },
  );

  const merchPick: ShopifyProduct | null = useMemo(() => {
    if (!merchPool.length) return null;
    if (pick.candidateRef) {
      const match = merchPool.find((p) => p.node.handle === pick.candidateRef);
      if (match) return match;
    }
    return heuristicPick;
  }, [merchPool, pick.candidateRef, heuristicPick]);

  if (!merchPick || !products) return null;
  const wine = products.find((p) => p.node.handle === wineHandle);
  if (!wine) return null;

  const merchNode = merchPick.node;
  const winePrice = parseFloat(wine.node.priceRange.minVariantPrice.amount);
  const merchPrice = parseFloat(merchNode.priceRange.minVariantPrice.amount);
  const pairTotal = winePrice + merchPrice;
  const savings = merchPrice * 0.1;

  const addPair = async () => {
    const wineVariant = wine.node.variants.edges[0]?.node;
    const merchVariant = merchNode.variants.edges[0]?.node;
    if (!wineVariant || !merchVariant) return;
    // Attribute add + expected revenue to the bandit pick
    const priceStr = typeof merchVariant.price === "string"
      ? merchVariant.price
      : (merchVariant.price as { amount: string })?.amount ?? "0";
    const merchCents = Math.round(parseFloat(priceStr) * 100);
    pick.recordAdd({ handle: merchNode.handle, wine_handle: wineHandle });
    pick.recordRevenue(merchCents, { handle: merchNode.handle, stage: "added", wine_handle: wineHandle });
    await addItem({
      product: wine,
      variantId: wineVariant.id,
      variantTitle: wineVariant.title,
      price: wineVariant.price,
      quantity: 1,
      selectedOptions: wineVariant.selectedOptions ?? [],
    });
    await addItem({
      product: merchPick,
      variantId: merchVariant.id,
      variantTitle: merchVariant.title,
      price: merchVariant.price,
      quantity: 1,
      selectedOptions: merchVariant.selectedOptions ?? [],
    });
    if (!discountCodes.includes("PAIRIT10")) {
      await applyDiscountCode("PAIRIT10");
    }
    toast.success(`Pair added — saved $${savings.toFixed(2)} on the merch`, {
      position: "top-center",
    });
  };

  return (
    <aside className="border border-border bg-secondary/40 p-4 mt-4">
      <p className="text-[10px] uppercase tracking-brand text-primary font-bold mb-3 flex items-center gap-1.5">
        <Shirt className="w-3 h-3" /> Pair It
      </p>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 bg-background flex items-center justify-center flex-shrink-0">
          {merchNode.images.edges[0]?.node ? (
            <img
              src={merchNode.images.edges[0].node.url}
              alt={merchNode.title}
              className="max-h-full object-contain"
              loading="lazy"
            />
          ) : (
            <Shirt className="w-6 h-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{merchNode.title}</p>
          <p className="text-xs text-muted-foreground">
            Goes great with {wineTitle.split("—")[0].trim()}
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