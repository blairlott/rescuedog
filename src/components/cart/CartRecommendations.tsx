import { useProducts } from "@/hooks/useProducts";
import { useCartStore, CartItem } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCartSettings } from "@/hooks/useCartSettings";

interface CartRecommendationsProps {
  cartItems: CartItem[];
  cartTotal: number;
}

export function CartRecommendations({ cartItems, cartTotal }: CartRecommendationsProps) {
  const { data: allProducts } = useProducts(50);
  const addItem = useCartStore(state => state.addItem);
  const isLoading = useCartStore(state => state.isLoading);
  const { freeShippingBottleCount } = useCartSettings();

  if (!allProducts || allProducts.length === 0) return null;

  // Filter out products already in cart
  const cartVariantIds = new Set(cartItems.map(i => i.variantId));
  const available = allProducts.filter(p => {
    const firstVariant = p.node.variants.edges[0]?.node;
    return firstVariant?.availableForSale && !cartVariantIds.has(firstVariant.id);
  });

  if (available.length === 0) return null;

  // Pick up to 2 recommendations
  const recommendations = available.slice(0, 2);

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
    const newTotal = cartTotal + parseFloat(variant.price.amount);
    const remaining = freeShippingThreshold - newTotal;
    if (remaining > 0) {
      toast.success(`${product.node.title} added! $${remaining.toFixed(2)} to free shipping`, { position: "top-center" });
    } else {
      toast.success(`${product.node.title} added! You qualify for free shipping! 🎉`, { position: "top-center" });
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">You might also like</p>
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
