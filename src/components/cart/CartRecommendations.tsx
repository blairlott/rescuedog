import { useState } from "react";
import { Wine } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { useCartStore, CartItem } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCartSettings } from "@/hooks/useCartSettings";
import { isAgeVerified } from "@/lib/ageVerification";
import { isWineProduct } from "@/lib/productUtils";

interface CartRecommendationsProps {
  cartItems: CartItem[];
  cartTotal: number;
}

export function CartRecommendations({ cartItems, cartTotal }: CartRecommendationsProps) {
  const { data: allProducts } = useProducts(50);
  const addItem = useCartStore(state => state.addItem);
  const isLoading = useCartStore(state => state.isLoading);
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
  if (hasWine && !hasMerch) {
    const merchOnly = available.filter(p => p.node.productKind !== "wine");
    if (merchOnly.length > 0) {
      pool = merchOnly;
      heading = "Pair it with merch";
    }
  } else if (hasMerch && !hasWine && ageOk) {
    const wineOnly = available.filter(p => p.node.productKind === "wine");
    if (wineOnly.length > 0) {
      pool = wineOnly;
      heading = "Add a bottle to go with it";
    }
  }
  const recommendations = pool.slice(0, 2);

  const handleAdd = async (product: typeof recommendations[0]) => {
    const variant = product.node.variants.edges[0]?.node;
    if (!variant) return;
    await addItem({
      product,
      variantId: variant.id,
      variantTitle: variant.title,
      price: variant.price,
      quantity: 1,
      selectedOptions: variant.selectedOptions || [],
    });
    const currentBottles = useCartStore.getState().items.reduce((sum, i) => sum + i.quantity, 0);
    const remaining = freeShippingBottleCount - currentBottles;
    if (remaining > 0) {
      toast.success(`${product.node.title} added! ${remaining} more bottle${remaining !== 1 ? 's' : ''} for shipping included`, { position: "top-center" });
    } else {
      toast.success(`${product.node.title} added! Shipping included! 🎉`, { position: "top-center" });
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
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{heading}</p>
      <div className="space-y-2">
        {recommendations.map(product => {
          const image = product.node.images.edges[0]?.node;
          const price = parseFloat(product.node.priceRange.minVariantPrice.amount);
          return (
            <div key={product.node.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/50 border border-border">
              <div className="w-10 h-10 rounded overflow-hidden bg-secondary flex-shrink-0">
                {image && <img src={image.url} alt={image.altText || product.node.title} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{product.node.title}</p>
                <p className="text-xs text-muted-foreground">${price.toFixed(2)}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs flex-shrink-0"
                disabled={isLoading}
                onClick={() => handleAdd(product)}
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Plus className="w-3 h-3 mr-1" />Add</>}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
