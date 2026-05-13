import { useParams, Link } from "react-router-dom";
import { useProductByHandle } from "@/hooks/useProducts";
import { useCartStore } from "@/stores/cartStore";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Loader2, ArrowLeft, Minus, Plus, Heart, Lock } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { SubscribeAndSave, DISCOUNT_PERCENT } from "@/components/SubscribeAndSave";
import { supabase } from "@/integrations/supabase/client";
import { useCartSettings } from "@/hooks/useCartSettings";
import { useFavorites } from "@/hooks/useFavorites";
import { useIsMember } from "@/hooks/useIsMember";
import { Link as RouterLink } from "react-router-dom";
import { ShipsToStateCheck, useShipState } from "@/components/ShipsToStateCheck";
import { PairingChips } from "@/components/PairingChips";
import { Seo } from "@/components/Seo";
import { PairItPicker } from "@/components/merch/PairItPicker";
import { PairWineWithMerch } from "@/components/cross-sell/PairWineWithMerch";
import { ProductReviews, useProductRating } from "@/components/reviews/ProductReviews";

const ProductDetail = () => {
  const { handle } = useParams<{ handle: string }>();
  const { data: product, isLoading } = useProductByHandle(handle || "");
  const productRating = useProductRating(handle || "");
  const addItem = useCartStore(state => state.addItem);
  const cartLoading = useCartStore(state => state.isLoading);
  const { freeShippingBottleCount } = useCartSettings();
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [subscribeMode, setSubscribeMode] = useState(false);
  const [subFrequency, setSubFrequency] = useState("monthly");
  const { isFavorite, toggleFavorite } = useFavorites();
  const { isMember, discountPercent } = useIsMember();
  const { canShip, state: shipState } = useShipState();
  const blockedByState = !!shipState && !canShip;

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold mb-4">Product not found</h1>
            <Button asChild variant="outline"><Link to="/"><ArrowLeft className="mr-2 h-4 w-4" />Back to Home</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  const images = product.images.edges;
  const variants = product.variants.edges;
  const selectedVariant = variants[selectedVariantIdx]?.node;
  const tags = ((product as any).tags || []) as string[];
  const productKind = (product as any).productKind as "wine" | "merch" | undefined;
  const isMerch = productKind === "merch";
  const merchCategory = tags
    .map((t) => t.toLowerCase())
    .find((t) => ["apparel", "drinkware", "pet", "home", "gift"].includes(t));
  const isClubExclusive = tags.map(t => t.toLowerCase()).some(t => t === 'club-exclusive' || t === 'club exclusive');
  const locked = isClubExclusive && !isMember;
  const variantPrice = parseFloat(selectedVariant?.price.amount || product.priceRange.minVariantPrice.amount);
  const memberUnitPrice = variantPrice * (1 - (discountPercent || 20) / 100);
  const lineTotal = variantPrice * quantity;
  const memberLineTotal = memberUnitPrice * quantity;

  const handleAddToCart = async () => {
    if (!selectedVariant) return;
    if (blockedByState && !isMerch) {
      toast.error("We can't ship wine to your state yet. Use the store locator to find us nearby.", { position: "top-center" });
      return;
    }
    const wrappedProduct = { node: product };
    await addItem({
      product: wrappedProduct,
      variantId: selectedVariant.id,
      variantTitle: selectedVariant.title,
      price: selectedVariant.price,
      quantity,
      selectedOptions: selectedVariant.selectedOptions || [],
    });
    if (isMerch) {
      toast.success(`${product.title} added to cart`, { position: "top-center" });
    } else {
      const currentBottles = useCartStore.getState().items
        .filter(i => i.product.node.productKind === "wine")
        .reduce((sum, i) => sum + i.quantity, 0);
      const remaining = freeShippingBottleCount - currentBottles;
      if (remaining > 0) {
        toast.success(`${product.title} added! ${remaining} more bottle${remaining !== 1 ? 's' : ''} for shipping included`, { position: "top-center" });
      } else {
        toast.success(`${product.title} added! Shipping included! 🎉`, { position: "top-center" });
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Seo
        title={product.title}
        description={product.description?.slice(0, 155) || `${product.title} — sustainable wine from Rescue Dog Wines. 50% of profits support animal rescue.`}
        image={product.images.edges[0]?.node?.url}
        path={`/product/${product.handle}`}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.title,
          image: product.images.edges.map(e => e.node.url),
          description: product.description,
          brand: { "@type": "Brand", name: "Rescue Dog Wines" },
          offers: {
            "@type": "Offer",
            price: variantPrice.toFixed(2),
            priceCurrency: "USD",
            availability: selectedVariant?.availableForSale
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          },
          ...(productRating && productRating.count > 0
            ? {
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: productRating.value.toFixed(1),
                  reviewCount: productRating.count,
                },
              }
            : {}),
        }}
      />
      <Header />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <Link
            to={(typeof window !== "undefined" && sessionStorage.getItem("lastStorePath")) || "/wines"}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />Back to store
          </Link>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            {/* Images */}
            <div className="space-y-4">
              <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                {images[selectedImage]?.node ? (
                  <img src={images[selectedImage].node.url} alt={images[selectedImage].node.altText || product.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">No image</div>
                )}
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {images.map((img: { node: { url: string; altText: string | null } }, idx: number) => (
                    <button key={idx} onClick={() => setSelectedImage(idx)} className={`w-16 h-16 rounded-md overflow-hidden border-2 flex-shrink-0 ${idx === selectedImage ? 'border-primary' : 'border-border'}`}>
                      <img src={img.node.url} alt={img.node.altText || ''} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="font-display text-3xl font-bold text-foreground mb-2">{product.title}</h1>
                  {isMember ? (
                    <div>
                      <p className="text-2xl font-bold text-primary">
                        ${memberUnitPrice.toFixed(2)}
                        <span className="text-sm text-muted-foreground line-through ml-2 font-normal">
                          ${variantPrice.toFixed(2)}
                        </span>
                      </p>
                      <p className="text-[11px] uppercase tracking-brand text-primary font-bold mt-1">
                        Your Member Price ({discountPercent}% off)
                      </p>
                    </div>
                  ) : (
                    <p className="text-2xl font-bold text-primary">${variantPrice.toFixed(2)}</p>
                  )}
                </div>
                <button
                  onClick={() =>
                    toggleFavorite.mutate({
                      handle: product.handle,
                      title: product.title,
                      imageUrl: product.images.edges[0]?.node?.url,
                      price: parseFloat(product.priceRange.minVariantPrice.amount).toFixed(2),
                    })
                  }
                  className="mt-1 w-10 h-10 flex items-center justify-center rounded-full border border-border hover:bg-muted transition-colors flex-shrink-0"
                  aria-label={isFavorite(product.handle) ? "Remove from favorites" : "Add to favorites"}
                >
                  <Heart className={`w-5 h-5 transition-colors ${isFavorite(product.handle) ? 'fill-destructive text-destructive' : 'text-muted-foreground hover:text-destructive'}`} />
                </button>
              </div>

              {product.description && (
                <p className="text-muted-foreground leading-relaxed">{product.description}</p>
              )}

              {/* Ships-to-your-state compliance check (wine only) */}
              {!isMerch && <ShipsToStateCheck />}

              {/* Food pairing chips for wine; Pair-It cross-sell for merch */}
              {isMerch ? (
                <PairItPicker
                  productHandle={product.handle}
                  productTitle={product.title}
                  productCategory={merchCategory}
                />
              ) : (
                <>
                  <PairingChips tags={tags} productTitle={product.title} />
                  <PairWineWithMerch wineHandle={product.handle} wineTitle={product.title} />
                </>
              )}

              {/* Variant Selection */}
              {variants.length > 1 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Options</label>
                  <div className="flex flex-wrap gap-2">
                    {variants.map((v: { node: { id: string; title: string; availableForSale: boolean } }, idx: number) => (
                      <button
                        key={v.node.id}
                        onClick={() => setSelectedVariantIdx(idx)}
                        disabled={!v.node.availableForSale}
                        className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                          idx === selectedVariantIdx
                            ? 'border-primary bg-primary text-primary-foreground'
                            : v.node.availableForSale
                            ? 'border-border hover:border-primary/50'
                            : 'border-border opacity-40 cursor-not-allowed line-through'
                        }`}
                      >
                        {v.node.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Quantity</label>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="icon" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus className="h-4 w-4" /></Button>
                  <span className="w-12 text-center font-medium text-lg">{quantity}</span>
                  <Button variant="outline" size="icon" onClick={() => setQuantity(quantity + 1)}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Subscribe & Save */}
              <SubscribeAndSave
                price={parseFloat(selectedVariant?.price.amount || product.priceRange.minVariantPrice.amount) * quantity}
                onSubscriptionChange={(isSub, freq) => {
                  setSubscribeMode(isSub);
                  setSubFrequency(freq);
                }}
              />

              {/* Bulk pricing note */}
              {quantity >= 6 && (
                <div className="bg-brand-gold/10 border border-brand-gold/30 rounded-md p-3 text-sm">
                  <strong className="text-brand-gold">Bulk order!</strong> Contact us at <Link to="/wholesale" className="text-primary underline">wholesale</Link> for volume pricing on orders of 6+ bottles.
                </div>
              )}

              {isClubExclusive && (
                <div className={`border p-3 text-sm flex items-center gap-2 ${locked ? 'border-primary bg-primary/5' : 'border-brand-gold/40 bg-brand-gold/5'}`}>
                  <Lock className="h-4 w-4 text-primary flex-shrink-0" />
                  {locked ? (
                    <span>
                      <strong className="text-foreground">Club Exclusive.</strong> <RouterLink to="/club" className="text-primary underline">Join the wine club</RouterLink> to purchase this bottle.
                    </span>
                  ) : (
                    <span><strong className="text-foreground">Club Exclusive</strong> — thanks for being a member.</span>
                  )}
                </div>
              )}

              <Button
                onClick={handleAddToCart}
                disabled={cartLoading || !selectedVariant?.availableForSale || locked || (blockedByState && !isMerch)}
                size="lg"
                className="w-full bg-primary hover:bg-primary/90 hidden md:flex"
              >
                {cartLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : !selectedVariant?.availableForSale ? (
                  "Sold Out"
                ) : locked ? (
                  <><Lock className="w-4 h-4 mr-2" /> Members only</>
                ) : blockedByState ? (
                  "Not available in your state"
                ) : subscribeMode ? (
                  <>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Subscribe — ${(parseFloat(selectedVariant.price.amount) * quantity * (1 - DISCOUNT_PERCENT / 100)).toFixed(2)}/shipment
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Add to Cart — ${(isMember ? memberLineTotal : lineTotal).toFixed(2)}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>
      <div className="container mx-auto px-4 pb-12">
        <ProductReviews productHandle={product.handle} />
      </div>
      {/* Mobile sticky add-to-cart bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-border p-3 pb-[env(safe-area-inset-bottom)] space-y-1.5">
        {/* Status line: ship-to-state + member savings */}
        <div className="flex items-center justify-between text-[11px] leading-tight">
          {!isMerch && shipState ? (
            <span className={canShip ? "text-foreground" : "text-destructive font-semibold"}>
              {canShip ? `✓ Ships to ${shipState}` : `✕ Not shipped to ${shipState}`}
            </span>
          ) : !isMerch ? (
            <span className="text-muted-foreground">Check your state for shipping</span>
          ) : (
            <span className="text-muted-foreground">Ships from US partners · 3–7 days</span>
          )}
          {isMember && !locked && selectedVariant?.availableForSale && (
            <span className="text-primary font-bold uppercase tracking-brand text-[10px]">
              Save ${(lineTotal - memberLineTotal).toFixed(2)} ({discountPercent}% off)
            </span>
          )}
        </div>
        <Button
          onClick={handleAddToCart}
          disabled={cartLoading || !selectedVariant?.availableForSale || locked || (blockedByState && !isMerch)}
          size="lg"
          className="w-full bg-primary hover:bg-primary/90"
        >
          {cartLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : !selectedVariant?.availableForSale ? "Sold Out"
          : locked ? <><Lock className="w-4 h-4 mr-2" /> Members only</>
          : blockedByState && !isMerch ? "Not available in your state"
          : subscribeMode ? `Subscribe ${quantity} ${isMerch ? 'unit' : 'btl'} — $${(variantPrice * quantity * (1 - DISCOUNT_PERCENT / 100)).toFixed(2)}`
          : <><ShoppingCart className="w-4 h-4 mr-2" /> Add {quantity} {isMerch ? 'unit' : 'btl'} — ${(isMember ? memberLineTotal : lineTotal).toFixed(2)}</>}
        </Button>
      </div>
      <Footer />
    </div>
  );
};

export default ProductDetail;
