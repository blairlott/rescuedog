import { useProducts } from "@/hooks/useProducts";
import { useCartStore } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Sparkles, Wine } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import type { ShopifyProduct } from "@/lib/shopify";
import { useMemo } from "react";
import { useBanditCandidate } from "@/hooks/useBanditCandidate";

interface PersonalizedRecommendationsProps {
  favoriteHandles: string[];
  winePreferences: string[];
}

/**
 * Scores products based on how well they match a user's favorites and preferences.
 * Strategy:
 *  - Products the user already favorited are excluded
 *  - Titles / tags that overlap with favorite keywords get boosted
 *  - Wine preference keywords (e.g. "red", "white", "rosé") boost matching products
 */
function scoreProduct(
  product: ShopifyProduct,
  favKeywords: Set<string>,
  prefKeywords: Set<string>,
  favoriteHandleSet: Set<string>
): number {
  if (favoriteHandleSet.has(product.node.handle)) return -1; // exclude already-faved

  let score = 0;
  const titleWords = product.node.title.toLowerCase().split(/\s+/);
  const tags = (product.node.tags || []).map((t) => t.toLowerCase());
  const allWords = [...titleWords, ...tags];

  for (const word of allWords) {
    if (favKeywords.has(word)) score += 3;
    if (prefKeywords.has(word)) score += 5;
  }

  // Small boost for available products
  const firstVariant = product.node.variants.edges[0]?.node;
  if (firstVariant?.availableForSale) score += 1;

  return score;
}

/** Extract meaningful keywords from a list of product titles */
function extractKeywords(titles: string[]): Set<string> {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "for", "is", "on",
    "with", "by", "at", "from", "as", "it", "be", "this", "that", "was",
    "are", "not", "but", "have", "has", "had", "do", "does", "did", "will",
    "bottle", "bottles", "wine", "wines", "pack", "-", "–", "&", "|",
  ]);
  const keywords = new Set<string>();
  for (const title of titles) {
    for (const word of title.toLowerCase().split(/\s+/)) {
      const clean = word.replace(/[^a-z0-9]/g, "");
      if (clean.length > 2 && !stopWords.has(clean)) {
        keywords.add(clean);
      }
    }
  }
  return keywords;
}

export function PersonalizedRecommendations({
  favoriteHandles,
  winePreferences,
}: PersonalizedRecommendationsProps) {
  const { data: allProducts } = useProducts(50);
  const addItem = useCartStore((state) => state.addItem);
  const isLoading = useCartStore((state) => state.isLoading);

  // Bandit picks between recommendation STRATEGIES (not individual SKUs).
  // The static keyword-matcher becomes one arm of many.
  const strategyCandidates = useMemo(
    () => [
      { ref: "keyword_match", type: "strategy" as const },
      { ref: "popular_available", type: "strategy" as const },
      { ref: "favorite_first", type: "strategy" as const },
      { ref: "preference_first", type: "strategy" as const },
    ],
    [],
  );
  const strategy = useBanditCandidate(
    "personalized_rec_strategy",
    strategyCandidates,
    "keyword_match",
    { name: "Personalized rec strategy", primaryMetric: "conversion_rate", explorationFloor: 60 },
  );
  const strategyKey = strategy.candidateRef ?? "keyword_match";

  if (!allProducts || allProducts.length === 0) return null;

  const favoriteHandleSet = new Set(favoriteHandles);
  const favKeywords = extractKeywords(
    allProducts
      .filter((p) => favoriteHandleSet.has(p.node.handle))
      .map((p) => p.node.title)
  );
  const prefKeywords = new Set(
    winePreferences.map((p) => p.toLowerCase().trim())
  );

  // ----- Strategy execution -----
  const notFav = allProducts.filter((p) => !favoriteHandleSet.has(p.node.handle));
  let scored: ShopifyProduct[] = [];

  if (strategyKey === "popular_available") {
    // Available-first, deterministic by handle (proxy for "popular" until orders feed in)
    scored = notFav
      .filter((p) => p.node.variants.edges[0]?.node?.availableForSale)
      .slice(0, 4);
  } else if (strategyKey === "favorite_first") {
    // Heavy weight on favorite keyword overlap; ignore preferences.
    scored = notFav
      .map((p) => ({ p, s: scoreProduct(p, favKeywords, new Set(), favoriteHandleSet) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((x) => x.p);
  } else if (strategyKey === "preference_first") {
    // Heavy weight on preference keywords; ignore favorites.
    scored = notFav
      .map((p) => ({ p, s: scoreProduct(p, new Set(), prefKeywords, favoriteHandleSet) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((x) => x.p);
  } else {
    // keyword_match — original blended scorer
    scored = notFav
      .map((p) => ({ p, s: scoreProduct(p, favKeywords, prefKeywords, favoriteHandleSet) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((x) => x.p);
  }

  // If we can't generate personalized recs, show nothing
  if (scored.length === 0) {
    // Fall back: show top available products user hasn't favorited
    const fallback = allProducts
      .filter(
        (p) =>
          !favoriteHandleSet.has(p.node.handle) &&
          p.node.variants.edges[0]?.node?.availableForSale
      )
      .slice(0, 4);

    if (fallback.length === 0) return null;

    return (
      <RecommendationGrid
        title="Popular Wines You Might Like"
        subtitle="Based on what's trending"
        products={fallback}
        addItem={addItem}
        isLoading={isLoading}
        onAdd={(p) => strategy.recordAdd({ strategy: strategyKey, handle: p.node.handle })}
      />
    );
  }

  return (
    <RecommendationGrid
      title="Picked for You"
      subtitle="Based on your favorites and preferences"
      products={scored}
      addItem={addItem}
      isLoading={isLoading}
      onAdd={(p) => strategy.recordAdd({ strategy: strategyKey, handle: p.node.handle })}
    />
  );
}

function RecommendationGrid({
  title,
  subtitle,
  products,
  addItem,
  isLoading,
  onAdd,
}: {
  title: string;
  subtitle: string;
  products: ShopifyProduct[];
  addItem: any;
  isLoading: boolean;
  onAdd?: (p: ShopifyProduct) => void;
}) {
  const handleAdd = async (product: ShopifyProduct) => {
    const variant = product.node.variants.edges[0]?.node;
    if (!variant) return;
    onAdd?.(product);
    await addItem({
      product,
      variantId: variant.id,
      variantTitle: variant.title,
      price: variant.price,
      quantity: 1,
      selectedOptions: variant.selectedOptions || [],
    });
    toast.success(`${product.node.title} added to cart!`, {
      position: "top-center",
    });
  };

  return (
    <div className="border border-border">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <div>
          <h3 className="font-bold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {products.map((product) => {
          const image = product.node.images.edges[0]?.node;
          const price = parseFloat(
            product.node.priceRange.minVariantPrice.amount
          );
          const variant = product.node.variants.edges[0]?.node;

          return (
            <div key={product.node.id} className="group">
              <Link to={`/product/${product.node.handle}`}>
                <div className="aspect-[3/4] bg-secondary rounded-md overflow-hidden mb-2">
                  {image ? (
                    <img
                      src={image.url}
                      alt={image.altText || product.node.title}
                      className="w-full h-full object-contain group-hover:scale-[1.03] transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Wine className="w-8 h-8" />
                    </div>
                  )}
                </div>
                <p className="text-xs font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                  {product.node.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ${price.toFixed(2)}
                </p>
              </Link>
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-2 h-7 text-xs"
                disabled={isLoading || !variant?.availableForSale}
                onClick={() => handleAdd(product)}
              >
                {isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : !variant?.availableForSale ? (
                  "Sold Out"
                ) : (
                  <>
                    <Plus className="w-3 h-3 mr-1" />
                    Add to Cart
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
