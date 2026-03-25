import { Link } from "react-router-dom";
import { ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { Loader2, Award } from "lucide-react";
import { toast } from "sonner";

interface ProductCardProps {
  product: ShopifyProduct;
}

function getAwardBadge(tags: string[]): { label: string; className: string } | null {
  const tagSet = new Set(tags.map(t => t.toLowerCase()));
  if (tagSet.has("double gold")) {
    return { label: "Double Gold", className: "bg-amber-500 text-white" };
  }
  if (tagSet.has("gold")) {
    return { label: "Gold", className: "bg-yellow-500 text-white" };
  }
  if (tagSet.has("silver")) {
    return { label: "Silver", className: "bg-gray-400 text-white" };
  }
  return null;
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore(state => state.addItem);
  const isLoading = useCartStore(state => state.isLoading);
  const { node } = product;
  const image = node.images.edges[0]?.node;
  const price = node.priceRange.minVariantPrice;
  const firstVariant = node.variants.edges[0]?.node;
  const award = getAwardBadge(node.tags || []);

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
      <div className="overflow-hidden mb-4 relative">
        <div className="aspect-[3/4] overflow-hidden bg-secondary">
          {image ? (
            <img
              src={image.url}
              alt={image.altText || node.title}
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              No image
            </div>
          )}
        </div>
        {award && (
          <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow ${award.className}`}>
            <Award className="w-3 h-3" />
            {award.label}
          </span>
        )}
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">
        {node.title}
      </h3>
      <p className="text-foreground mb-1">
        <span className="text-xs align-top">$</span>
        <span className="text-lg font-medium">{dollars}</span>
        <span className="text-xs align-top">.{cents}</span>
      </p>
      <p className="text-xs text-primary mb-3">
        <Link to="/club" onClick={(e) => e.stopPropagation()} className="hover:underline">
          ${(priceNum * 0.8).toFixed(2)} Wine Club Price
        </Link>
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
