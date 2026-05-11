import { Link } from "react-router-dom";
import { ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { useCartSettings } from "@/hooks/useCartSettings";
import { useFavorites } from "@/hooks/useFavorites";
import { useIsMember } from "@/hooks/useIsMember";
import { Button } from "@/components/ui/button";
import { Loader2, Award, ShoppingBag, Heart, Lock } from "lucide-react";
import { toast } from "sonner";

interface ProductCardProps {
  product: ShopifyProduct;
}

function getAwardBadge(tags: string[]): { label: string; className: string } | null {
  const tagSet = new Set(tags.map(t => t.toLowerCase()));
  if (tagSet.has("double gold")) {
    return { label: "Double Gold", className: "bg-brand-gold text-foreground" };
  }
  if (tagSet.has("gold")) {
    return { label: "Gold", className: "bg-brand-gold/80 text-foreground" };
  }
  if (tagSet.has("silver")) {
    return { label: "Silver", className: "bg-muted-foreground text-primary-foreground" };
  }
  return null;
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore(state => state.addItem);
  const isLoading = useCartStore(state => state.isLoading);
  const { freeShippingBottleCount } = useCartSettings();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { isMember, discountPercent } = useIsMember();
  const { node } = product;
  const image = node.images.edges[0]?.node;
  const price = node.priceRange.minVariantPrice;
  const firstVariant = node.variants.edges[0]?.node;
  const award = getAwardBadge(node.tags || []);
  const titleLower = node.title.toLowerCase();
  const isSampler = titleLower.includes('sampler') || titleLower.includes('sample') || titleLower.includes('6 bottle') || titleLower.includes('6-bottle');
  const tagSet = new Set((node.tags || []).map(t => t.toLowerCase()));
  const isClubExclusive = tagSet.has('club-exclusive') || tagSet.has('club exclusive');
  const locked = isClubExclusive && !isMember;

  const priceNum = parseFloat(price.amount);
  const dollars = Math.floor(priceNum);
  const cents = Math.round((priceNum - dollars) * 100).toString().padStart(2, '0');
  const memberPrice = priceNum * (1 - (discountPercent || 20) / 100);

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked) return;
    if (!firstVariant) return;
    await addItem({
      product,
      variantId: firstVariant.id,
      variantTitle: firstVariant.title,
      price: firstVariant.price,
      quantity: 1,
      selectedOptions: firstVariant.selectedOptions || [],
    });
    const currentBottles = useCartStore.getState().items.reduce((sum, i) => sum + i.quantity, 0);
    const remaining = freeShippingBottleCount - currentBottles;
    if (remaining > 0) {
      toast.success(`${node.title} added! ${remaining} more bottle${remaining !== 1 ? 's' : ''} for shipping included`, { position: "top-center" });
    } else {
      toast.success(`${node.title} added! Shipping included! 🎉`, { position: "top-center" });
    }
  };

  const faved = isFavorite(node.handle);

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite.mutate({
      handle: node.handle,
      title: node.title,
      imageUrl: image?.url,
      price: priceNum.toFixed(2),
    });
  };

  return (
    <Link to={`/product/${node.handle}`} className="group block">
      {/* Image container with overlay add-to-cart */}
      <div className="relative overflow-hidden mb-3">
        <div className="aspect-[3/4] overflow-hidden bg-secondary">
          {image ? (
            <img
              src={image.url}
              alt={image.altText || node.title}
              className="w-full h-full object-contain transition-transform duration-700 ease-out group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs uppercase tracking-brand">
              No image
            </div>
          )}
        </div>

        {/* Award badge */}
        {award && (
          <span className={`absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-brand shadow-sm ${award.className}`}>
            <Award className="w-3 h-3" />
            {award.label}
          </span>
        )}

        {/* Club exclusive badge */}
        {isClubExclusive && (
          <span className="absolute top-3 left-3 mt-8 inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-brand shadow-sm bg-primary text-primary-foreground">
            <Lock className="w-3 h-3" /> Club Exclusive
          </span>
        )}

        {/* Lock overlay for non-members */}
        {locked && (
          <Link
            to="/club"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 bg-background/70 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-4 z-20"
          >
            <Lock className="w-6 h-6 text-primary mb-2" />
            <p className="text-xs font-bold uppercase tracking-brand text-foreground mb-1">Members only</p>
            <p className="text-[11px] text-muted-foreground mb-3">Join the wine club to unlock</p>
            <span className="inline-block bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-brand px-3 py-1.5">Join the club →</span>
          </Link>
        )}

        {/* Favorite heart button */}
        <button
          onClick={handleToggleFavorite}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-background/80 backdrop-blur-sm border border-border hover:bg-background transition-colors z-10"
          aria-label={faved ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart className={`w-4 h-4 transition-colors ${faved ? 'fill-destructive text-destructive' : 'text-muted-foreground hover:text-destructive'}`} />
        </button>

        {/* Hover overlay with add-to-cart button */}
        <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out p-3">
          <Button
            onClick={handleAddToCart}
            disabled={isLoading || !firstVariant?.availableForSale}
            className="w-full uppercase tracking-brand text-xs font-bold bg-foreground text-background hover:bg-foreground/90 h-10"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : !firstVariant?.availableForSale ? (
              "Sold Out"
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5 mr-1.5" />
                Add to Cart
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Product info */}
      <div className="space-y-1 text-center">
        <h3 className="text-sm font-medium text-foreground tracking-brand leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-200">
          {node.title}
        </h3>
        {isMember && !isSampler ? (
          <div>
            <p className="text-foreground">
              <span className="text-[10px] align-top leading-none">$</span>
              <span className="text-base font-semibold">{Math.floor(memberPrice)}</span>
              <span className="text-[10px] align-top leading-none">.{Math.round((memberPrice - Math.floor(memberPrice)) * 100).toString().padStart(2, '0')}</span>
              <span className="text-[10px] text-muted-foreground line-through ml-2">${priceNum.toFixed(2)}</span>
            </p>
            <p className="text-[10px] uppercase tracking-brand text-primary font-bold">Your Member Price</p>
          </div>
        ) : (
          <p className="text-foreground">
            <span className="text-[10px] align-top leading-none">$</span>
            <span className="text-base font-semibold">{dollars}</span>
            <span className="text-[10px] align-top leading-none">.{cents}</span>
          </p>
        )}
        {isSampler ? (
          <p className="text-[10px] text-muted-foreground italic">Not valid with any other offer</p>
        ) : !isMember ? (
          <p className="text-[11px] text-muted-foreground">
            <Link to="/club" onClick={(e) => e.stopPropagation()} className="hover:text-primary transition-colors">
              Club Price: ${(priceNum * 0.8).toFixed(2)}
            </Link>
          </p>
        ) : null}
      </div>
    </Link>
  );
}
