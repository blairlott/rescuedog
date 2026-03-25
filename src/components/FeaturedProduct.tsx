import { Link } from "react-router-dom";
import { ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { Award, ShoppingBag, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FeaturedProductProps {
  product: ShopifyProduct;
  label?: string;
}

export function FeaturedProduct({ product, label = "Featured" }: FeaturedProductProps) {
  const addItem = useCartStore((s) => s.addItem);
  const isLoading = useCartStore((s) => s.isLoading);
  const { node } = product;
  const image = node.images.edges[0]?.node;
  const price = node.priceRange.minVariantPrice;
  const firstVariant = node.variants.edges[0]?.node;
  const priceNum = parseFloat(price.amount);

  const handleAddToCart = async () => {
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
    <section className="border-b border-border">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-center">
          {/* Image */}
          <Link to={`/product/${node.handle}`} className="group block">
            <div className="aspect-square bg-secondary overflow-hidden flex items-center justify-center">
              {image ? (
                <img
                  src={image.url}
                  alt={image.altText || node.title}
                  className="w-full h-full object-contain p-8 group-hover:scale-[1.03] transition-transform duration-700"
                />
              ) : (
                <span className="text-muted-foreground text-sm">No image</span>
              )}
            </div>
          </Link>

          {/* Details */}
          <div className="space-y-5">
            <span className="text-[11px] font-bold uppercase tracking-brand text-primary">
              {label}
            </span>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-brand uppercase">
              {node.title}
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed line-clamp-4">
              {node.description}
            </p>
            <p className="text-xl font-semibold text-foreground">
              ${priceNum.toFixed(2)}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                onClick={handleAddToCart}
                disabled={isLoading || !firstVariant?.availableForSale}
                className="uppercase tracking-brand text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 px-8 h-11"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : !firstVariant?.availableForSale ? (
                  "Sold Out"
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4 mr-2" />
                    Add to Cart
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                asChild
                className="uppercase tracking-brand text-xs font-bold border-foreground text-foreground hover:bg-foreground hover:text-background px-8 h-11"
              >
                <Link to={`/product/${node.handle}`}>View Details</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
