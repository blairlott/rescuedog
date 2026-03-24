import { Link } from "react-router-dom";
import { ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ProductCardProps {
  product: ShopifyProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore(state => state.addItem);
  const isLoading = useCartStore(state => state.isLoading);
  const { node } = product;
  const image = node.images.edges[0]?.node;
  const price = node.priceRange.minVariantPrice;
  const firstVariant = node.variants.edges[0]?.node;

  const priceNum = parseFloat(price.amount);
  const dollars = Math.floor(priceNum);
  const cents = Math.round((priceNum - dollars) * 100).toString().padStart(2, '0');

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!firstVariant) return;
    await addItem({
      product,
      variantId: firstVariant.id,
      variantTitle: firstVariant.title,
      price: firstVariant.price,
      quantity: 1,
      selectedOptions: firstVariant.selectedOptions || [],
    });
    toast.success(`${node.title} added to cart`, { position: "top-center" });
  };

  return (
    <Link to={`/product/${node.handle}`} className="group block text-center">
      <div className="overflow-hidden mb-4">
        <div className="aspect-square overflow-hidden bg-secondary">
          {image ? (
            <img
              src={image.url}
              alt={image.altText || node.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              No image
            </div>
          )}
        </div>
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">
        {node.title}
      </h3>
      <p className="text-foreground mb-3">
        <span className="text-xs align-top">$</span>
        <span className="text-lg font-medium">{dollars}</span>
        <span className="text-xs align-top">.{cents}</span>
      </p>
      <Button
        onClick={handleAddToCart}
        disabled={isLoading || !firstVariant?.availableForSale}
        size="sm"
        className="uppercase tracking-brand text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 px-6"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : !firstVariant?.availableForSale ? (
          "Sold Out"
        ) : (
          "Add to Cart"
        )}
      </Button>
    </Link>
  );
}
