import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { useCartSettings } from "@/hooks/useCartSettings";
import { useFavorites } from "@/hooks/useFavorites";
import { useIsMember } from "@/hooks/useIsMember";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Award, ShoppingBag, Heart, Lock, Zap, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { isWineProduct } from "@/lib/productUtils";
import { useGeo } from "@/hooks/useGeo";
import { useTranslation } from "react-i18next";
import { T } from "@/components/T";

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
  const { purchaseAllowed } = useGeo();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const { node } = product;
  const image = node.images.edges[0]?.node;
  const price = node.priceRange.minVariantPrice;
  const firstVariant = node.variants.edges[0]?.node;
  const award = getAwardBadge(node.tags || []);
  const titleLower = node.title.toLowerCase();
  const isSampler = titleLower.includes('sampler') || titleLower.includes('sample') || titleLower.includes('6 bottle') || titleLower.includes('6-bottle');
  const tagSet = new Set((node.tags || []).map(t => t.toLowerCase()));
  const isClubExclusive = tagSet.has('club-exclusive') || tagSet.has('club exclusive');
  const isLowStock = ['low-stock', 'low stock', 'limited', 'last-call', 'last call', 'nearly-out'].some(t => tagSet.has(t));
  const locked = isClubExclusive && !isMember;
  const isWine = isWineProduct(product);
  const soldOut = !firstVariant?.availableForSale;

  const priceNum = parseFloat(price.amount);
  const dollars = Math.floor(priceNum);
  const cents = Math.round((priceNum - dollars) * 100).toString().padStart(2, '0');
  // Always tease at 20% — the universal à la carte member rate. Avoids confusion
  // with per-tier shipment discounts and keeps the displayed savings consistent.
  const memberPrice = priceNum * 0.8;

  const handleAddToCart = async (e: React.MouseEvent, opts: { buyNow?: boolean } = {}) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked) return;
    if (!purchaseAllowed) {
      toast.error(t("geo.purchase_disabled_tooltip"));
      return;
    }
    if (!firstVariant) return;
    await addItem({
      product,
      variantId: firstVariant.id,
      variantTitle: firstVariant.title,
      price: firstVariant.price,
      quantity,
      selectedOptions: firstVariant.selectedOptions || [],
    });
    if (opts.buyNow) {
      window.dispatchEvent(new CustomEvent("rdw:open-cart"));
      return;
    }
    if (isWine) {
      const currentBottles = useCartStore.getState().items
        .filter(i => i.product.node.productKind === "wine")
        .reduce((sum, i) => sum + i.quantity, 0);
      const remaining = freeShippingBottleCount - currentBottles;
      if (remaining > 0) {
        toast.success(`${node.title} added! ${remaining} more bottle${remaining !== 1 ? 's' : ''} for shipping included`, { position: "top-center" });
      } else {
        toast.success(`${node.title} added! Shipping included! 🎉`, { position: "top-center" });
      }
    } else {
      toast.success(`${node.title} added to cart`, { position: "top-center" });
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
    <Link to={`/product/${node.handle}`} className="group flex flex-col h-full">
      {/* Image container with overlay add-to-cart */}
      <div className="relative overflow-hidden mb-3">
        <div className={`aspect-[3/4] overflow-hidden ${isWine ? 'bg-secondary' : 'bg-background'}`}>
          {image ? (
            <img
              src={image.url}
              alt={image.altText || node.title}
              className={`w-full h-full ${isWine ? 'object-contain p-2' : 'object-cover'} transition-transform duration-700 ease-out group-hover:scale-[1.04]`}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs uppercase tracking-brand bg-secondary">
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
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("/club"); }}
            className="absolute inset-0 bg-background/70 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-4 z-20"
            aria-label="Join the wine club to unlock"
          >
            <Lock className="w-6 h-6 text-primary mb-2" />
            <p className="text-xs font-bold uppercase tracking-brand text-foreground mb-1">Members only</p>
            <p className="text-[11px] text-muted-foreground mb-3">Join the wine club to unlock</p>
            <span className="inline-block bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-brand px-3 py-1.5">Join the club →</span>
          </button>
        )}

        {/* Favorite heart button */}
        <button
          onClick={handleToggleFavorite}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-background/80 backdrop-blur-sm border border-border hover:bg-background transition-colors z-10"
          aria-label={faved ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart className={`w-4 h-4 transition-colors ${faved ? 'fill-destructive text-destructive' : 'text-muted-foreground hover:text-destructive'}`} />
        </button>

        {/* Sold out ribbon */}
        {soldOut && !locked && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-foreground/85 text-background text-center py-2 text-[11px] font-bold uppercase tracking-brand z-10">
            {t("common.sold_out")}
          </div>
        )}

        {/* Low-stock urgency badge */}
        {isLowStock && !soldOut && !locked && (
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-brand shadow-sm bg-orange-500 text-white">
            <AlertCircle className="w-3 h-3" /> Only a few left
          </span>
        )}

      </div>

      {/* Product info */}
      <div className="flex flex-col flex-1 space-y-1 text-center">
        <h3 className="text-sm font-medium text-foreground tracking-brand leading-snug line-clamp-2 min-h-[2.5rem] group-hover:text-primary transition-colors duration-200">
          <T>{node.title}</T>
        </h3>
        {!isSampler && isWine ? (
          <div className="min-h-[2.75rem]">
            <p className="text-foreground">
              <span className="text-[10px] align-top leading-none">$</span>
              <span className="text-base font-semibold">{Math.floor(memberPrice)}</span>
              <span className="text-[10px] align-top leading-none">.{Math.round((memberPrice - Math.floor(memberPrice)) * 100).toString().padStart(2, '0')}</span>
              <span className="text-[10px] text-muted-foreground line-through ml-2">${priceNum.toFixed(2)}</span>
            </p>
            <p className="text-[10px] uppercase tracking-brand text-primary font-bold">
              {isMember ? "Your Member Price" : "Wine Club Member Price (20% off)"}
            </p>
          </div>
        ) : (
          <p className="text-foreground min-h-[1.5rem]">
            <span className="text-[10px] align-top leading-none">$</span>
            <span className="text-base font-semibold">{dollars}</span>
            <span className="text-[10px] align-top leading-none">.{cents}</span>
          </p>
        )}
        <div className="min-h-[1.25rem]">
          {isSampler ? (
            <p className="text-[10px] text-muted-foreground italic">Not valid with any other offer</p>
          ) : null}
        </div>

        {/* Always-visible quantity + add-to-cart + buy-now */}
        <div className="mt-auto pt-2 space-y-1.5" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <Select value={String(quantity)} onValueChange={(v) => setQuantity(Number(v))} disabled={soldOut}>
            <SelectTrigger className="h-8 text-xs uppercase tracking-brand disabled:opacity-40">
              <SelectValue>Qty: {quantity}{quantity === 12 ? ' (case)' : ''}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
              <SelectItem value="12">12 (case)</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={(e) => handleAddToCart(e)}
            disabled={soldOut || !purchaseAllowed}
            title={!purchaseAllowed ? t("geo.purchase_disabled_tooltip") : undefined}
            className="w-full uppercase tracking-brand text-[11px] font-bold bg-foreground text-background hover:bg-foreground/90 h-9 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {soldOut ? (
              t("common.sold_out")
            ) : !purchaseAllowed ? (
              t("geo.checkout_disabled_label")
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5 mr-1.5" />
                {t("common.add_to_cart")}
              </>
            )}
          </Button>
          <Button
            onClick={(e) => handleAddToCart(e, { buyNow: true })}
            disabled={soldOut || !purchaseAllowed}
            className="w-full uppercase tracking-brand text-[11px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 h-9 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            {soldOut ? t("common.sold_out") : "Buy Now"}
          </Button>
        </div>
      </div>
    </Link>
  );
}
