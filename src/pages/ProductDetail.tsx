import { useParams, Link } from "react-router-dom";
import { useProductByHandle } from "@/hooks/useProducts";
import { useCartStore } from "@/stores/cartStore";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Loader2, ArrowLeft, Heart, Lock, Zap, Truck, Star, ShieldCheck, PawPrint } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { SubscribeAndSave, DISCOUNT_PERCENT } from "@/components/SubscribeAndSave";
import { supabase } from "@/integrations/supabase/client";
import { useCartSettings } from "@/hooks/useCartSettings";
import { useFavorites } from "@/hooks/useFavorites";
import { useIsMember } from "@/hooks/useIsMember";
import { Link as RouterLink } from "react-router-dom";
import { ShipsToStateCheck, useShipState } from "@/components/ShipsToStateCheck";
import { PairingChips } from "@/components/PairingChips";
import { PairItPicker } from "@/components/merch/PairItPicker";
import { PairWineWithMerch } from "@/components/cross-sell/PairWineWithMerch";
import { ProductReviews, useProductRating } from "@/components/reviews/ProductReviews";
import { LocalRescueLine } from "@/components/rescue/LocalRescueLine";
import { isBundleHandle } from "@/lib/wineBundles";
import { WineShippingPolicy } from "@/components/cart/WineShippingPolicy";
import { Seo } from "@/components/Seo";

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

  // Fire mid-funnel ViewContent to Meta CAPI once per product mount
  const viewContentSent = useRef(false);
  useEffect(() => {
    if (viewContentSent.current) return;
    if (!product?.handle) return;
    viewContentSent.current = true;
    const price = parseFloat(product.priceRange?.minVariantPrice?.amount || "0");
    import("@/lib/metaPixel").then(({ trackMidfunnelCapi }) => {
      trackMidfunnelCapi({
        eventName: "ViewContent",
        valueCents: Math.round(price * 100),
        productId: product.handle,
        state: shipState ?? null,
      });
    }).catch(() => {});
  }, [product?.handle, shipState]);

  // Subtle parallax for the sculptural bottle image on hero scroll
  const heroImgRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = heroImgRef.current;
        if (!el) return;
        const y = Math.max(-40, Math.min(40, window.scrollY * -0.08));
        el.style.transform = `translate3d(0, ${y}px, 0)`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-dvh flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-dvh flex flex-col">
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
  const vintage =
    tags.find((t) => /^(19|20)\d{2}$/.test(t.trim())) ||
    (product.title.match(/(19|20)\d{2}/)?.[0] ?? null);
  const merchCategory = tags
    .map((t) => t.toLowerCase())
    .find((t) => ["apparel", "drinkware", "pet", "home", "gift"].includes(t));
  const isClubExclusive = tags.map(t => t.toLowerCase()).some(t => t === 'club-exclusive' || t === 'club exclusive');
  const locked = isClubExclusive && !isMember;
  // Bundles like the 6-Bottle Sampler are excluded from the member discount
  // (mirrors Vinoshipper's "Excluded from Discounts" rule).
  const titleLower = product.title.toLowerCase();
  const isSamplerBundle =
    isBundleHandle((product as any).handle) ||
    titleLower.includes("sampler") ||
    titleLower.includes("6 bottle") ||
    titleLower.includes("6-bottle");
  const memberDiscountApplies = isMember && !isSamplerBundle;
  const variantPrice = parseFloat(selectedVariant?.price.amount || product.priceRange.minVariantPrice.amount);
  const memberUnitPrice = variantPrice * (1 - (discountPercent || 20) / 100);
  const lineTotal = variantPrice * quantity;
  const memberLineTotal = memberUnitPrice * quantity;
  // Passive teaser: show member pricing to ALL wine viewers since the real
  // discount is applied at Vinoshipper checkout (members log in on VS, not
  // on our site). Sampler bundles are excluded from member pricing.
  const showMemberTeaser = !isMerch && !isSamplerBundle;
  const teaserDiscountPct = isMember ? (discountPercent || 20) : 20;
  const teaserUnitPrice = variantPrice * (1 - teaserDiscountPct / 100);

  const handleAddToCart = async (opts?: { buyNow?: boolean }) => {
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
    if (opts?.buyNow) {
      window.dispatchEvent(new CustomEvent("rdw:open-cart"));
      return;
    }
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
    <div className="min-h-dvh flex flex-col">
      <Seo
        title={product.title}
        description={product.description?.slice(0, 155) || `${product.title} — sustainable wine from Rescue Dog Wines. 50% of profits support animal rescue.`}
        image={product.images.edges[0]?.node?.url}
        path={`/product/${product.handle}`}
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: isMerch ? "Merch" : "Wines", path: isMerch ? "/merch" : "/wines" },
          { name: product.title, path: `/product/${product.handle}` },
        ]}
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
      <main className="flex-1">
        {/* Editorial hero — story-led, sculptural product staging */}
        <section className="relative bg-[#fcfcfc] overflow-hidden">
          {/* Elegant impact line (wine only) */}
          {!isMerch && (
            <div className="w-full text-center py-4 text-[10px] tracking-[0.3em] uppercase text-muted-foreground bg-white/80 backdrop-blur-md border-b border-border">
              Every bottle helps a dog find their forever home
            </div>
          )}

          <div className="container mx-auto px-4 md:px-12 pt-6">
            <Link
              to={(typeof window !== "undefined" && sessionStorage.getItem("lastStorePath")) || "/wines"}
              className="inline-flex items-center text-xs uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-2 h-3.5 w-3.5" />Back to store
            </Link>
          </div>

          <div className="container mx-auto px-4 md:px-12 flex flex-col lg:flex-row items-center gap-12 lg:gap-24 py-12 lg:py-20">
            {/* Sculptural product imagery */}
            <div className="relative w-full lg:w-1/2 flex justify-center">
              {/* Soft radial glow */}
              <div
                aria-hidden
                className="absolute inset-0 -z-10 blur-3xl opacity-60 scale-150"
                style={{
                  background:
                    "radial-gradient(circle at center, rgba(195,0,23,0.06), transparent 60%)",
                }}
              />
              <div className="relative flex items-end justify-center group w-full max-w-md">
                <div
                  ref={heroImgRef}
                  className="aspect-square w-full overflow-hidden bg-transparent transition-transform duration-1000 will-change-transform group-hover:scale-[1.03] drop-shadow-2xl"
                >
                  {images[selectedImage]?.node?.url ? (
                    <img
                      src={images[selectedImage].node.url}
                      alt={images[selectedImage].node.altText || product.title}
                      className="w-full h-full object-contain"
                      loading="eager"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">No image</div>
                  )}
                </div>
                {/* Subtle floor shadow */}
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-black/10 blur-2xl rounded-[100%] -z-10" />
              </div>

              {images.length > 1 && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-12 flex gap-2 overflow-x-auto px-2">
                  {images.map((img: { node: { url: string; altText: string | null } }, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImage(idx)}
                      className={`w-12 h-12 overflow-hidden border flex-shrink-0 transition-opacity ${
                        idx === selectedImage ? 'border-primary opacity-100' : 'border-border opacity-60 hover:opacity-100'
                      }`}
                      aria-label={`View image ${idx + 1}`}
                    >
                      <img src={img.node.url} alt={img.node.altText || ''} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product details — editorial */}
            <div className="w-full lg:w-1/2 space-y-8 flex flex-col items-start text-left">
              <div className="space-y-4 w-full">
                <div className="flex items-center justify-between gap-4">
                  {vintage ? (
                    <span className="px-3 py-1 bg-zinc-100 text-[10px] tracking-[0.25em] uppercase font-extrabold text-foreground border border-border">
                      {vintage} Vintage
                    </span>
                  ) : <span />}
                  <button
                    onClick={() =>
                      toggleFavorite.mutate({
                        handle: product.handle,
                        title: product.title,
                        imageUrl: product.images.edges[0]?.node?.url,
                        price: parseFloat(product.priceRange.minVariantPrice.amount).toFixed(2),
                      })
                    }
                    className="w-10 h-10 flex items-center justify-center border border-border hover:bg-muted transition-colors"
                    aria-label={isFavorite(product.handle) ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Heart className={`w-4 h-4 transition-colors ${isFavorite(product.handle) ? 'fill-destructive text-destructive' : 'text-muted-foreground hover:text-destructive'}`} />
                  </button>
                </div>

                <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-light tracking-tight leading-[1.05] uppercase text-foreground">
                  {product.title}
                </h1>

                  {showMemberTeaser ? (
                    <div>
                      <p className="text-2xl font-semibold tracking-tight text-primary">
                        ${variantPrice.toFixed(2)}
                      </p>
                      <p className="text-[11px] uppercase tracking-brand text-primary font-bold mt-1">
                        Club: ${teaserUnitPrice.toFixed(2)} ({teaserDiscountPct}% off)
                      </p>
                    </div>
                  ) : (
                    <p className="text-2xl font-semibold tracking-tight text-primary">${variantPrice.toFixed(2)}</p>
                  )}
                </div>

              {/* Trust stack — quick-scan reassurance directly under price */}
              <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] uppercase tracking-[0.18em] font-bold text-foreground -mt-2">
                {productRating && productRating.count > 0 && (
                  <li className="flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 fill-brand-gold text-brand-gold" />
                    {productRating.value.toFixed(1)} · {productRating.count} {productRating.count === 1 ? "review" : "reviews"}
                  </li>
                )}
                {!isMerch && shipState && (
                  <li className={`flex items-center gap-1.5 ${canShip ? "text-foreground" : "text-destructive"}`}>
                    <Truck className="w-3.5 h-3.5" />
                    {canShip ? `Ships to ${shipState}` : `Not shipped to ${shipState}`}
                  </li>
                )}
                {!isMerch && (
                  <li className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Flat $9.99 ship on 6+ · included on 12+
                  </li>
                )}
                {isMerch && (
                  <li className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" />
                    Ships in 3–7 days
                  </li>
                )}
                <li className="flex items-center gap-1.5 text-primary">
                  <PawPrint className="w-3.5 h-3.5" />
                  Helps dogs find homes
                </li>
              </ul>

              {!isMerch && (
                <p className="text-xs tracking-[0.18em] uppercase font-bold text-muted-foreground -mt-4">
                  Winemaker-driven by Susana Vasquez · Varietally correct · Vine to glass
                </p>
              )}

              {product.description && (
                <p className="text-muted-foreground leading-relaxed text-base lg:text-lg font-light max-w-md">
                  {product.description}
                </p>
              )}

              {/* Mission micro-line — qualitative, story-led */}
              {!isMerch && (
                <div className="flex items-center gap-4">
                  <div className="w-12 h-[1px] bg-primary" />
                  <p className="text-xs tracking-[0.2em] uppercase font-extrabold text-foreground">
                    Poured for the dogs still waiting
                  </p>
                </div>
              )}

              {/* Ships-to-your-state compliance check (wine only) */}
              {!isMerch && <ShipsToStateCheck />}

              {/* Geo-personalized rescue line — only after a ship-to state is selected */}
              {!isMerch && <LocalRescueLine />}

              {/* Out-of-stock banner */}
              {!selectedVariant?.availableForSale && (
                <div role="status" aria-live="polite" className="border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm font-bold uppercase tracking-brand flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Sold Out — currently unavailable
                </div>
              )}

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
                  <label className="text-[10px] uppercase tracking-[0.25em] font-bold text-muted-foreground">Options</label>
                  <div className="flex flex-wrap gap-2">
                    {variants.map((v: { node: { id: string; title: string; availableForSale: boolean } }, idx: number) => (
                      <button
                        key={v.node.id}
                        onClick={() => setSelectedVariantIdx(idx)}
                        disabled={!v.node.availableForSale}
                        className={`px-3 py-1.5 text-sm border transition-colors ${
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
                <label className="text-[10px] uppercase tracking-[0.25em] font-bold text-muted-foreground">Quantity</label>
                <Select value={String(quantity)} onValueChange={(v) => setQuantity(Number(v))} disabled={!selectedVariant?.availableForSale}>
                  <SelectTrigger className="w-32 rounded-none border-foreground font-bold uppercase tracking-brand text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                    <SelectValue>Qty: {quantity}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                    <SelectItem value="12">12 (case)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Subscribe & Save — temporarily disabled, will rewire after next publish */}
              {false && !isSamplerBundle && !isMerch && (
                <SubscribeAndSave
                  price={parseFloat(selectedVariant?.price.amount || product.priceRange.minVariantPrice.amount) * quantity}
                  onSubscriptionChange={(isSub, freq) => {
                    setSubscribeMode(isSub);
                    setSubFrequency(freq);
                  }}
                />
              )}

              {/* Bulk pricing note */}
              {quantity >= 6 && (
                <div className="bg-brand-gold/10 border border-brand-gold/30 p-3 text-sm">
                  <strong className="text-brand-gold">Bulk order!</strong> Contact us at <Link to="/wholesale" className="text-primary underline">wholesale</Link> for volume pricing on orders of 6+ bottles.
                </div>
              )}

              {isSamplerBundle && !isMerch && (
                <div className="border border-primary bg-primary/5 p-3 text-sm flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary flex-shrink-0" />
                  <span><strong className="text-foreground uppercase tracking-brand text-xs">Shipping Included</strong> — this 6-bottle sampler ships free to your door.</span>
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

              <div className="hidden md:flex flex-col gap-2 md:min-w-[320px]">
                <Button
                  onClick={() => handleAddToCart()}
                  disabled={cartLoading || !selectedVariant?.availableForSale || locked || (blockedByState && !isMerch)}
                  size="lg"
                  className="w-full bg-foreground text-background hover:bg-primary hover:text-primary-foreground px-12 py-6 text-[11px] tracking-[0.4em] uppercase font-bold border-0 transition-all duration-500"
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
                      Add to Cart — ${(memberDiscountApplies ? memberLineTotal : lineTotal).toFixed(2)}
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => handleAddToCart({ buyNow: true })}
                  disabled={cartLoading || !selectedVariant?.availableForSale || locked || (blockedByState && !isMerch) || subscribeMode}
                  size="lg"
                  variant="outline"
                  className="w-full border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground px-12 py-6 text-[11px] tracking-[0.4em] uppercase font-bold transition-all duration-300"
                >
                  <Zap className="w-4 h-4 mr-2" /> Buy Now
                </Button>
              </div>
            </div>
          </div>

          {/* Scroll cue — hidden on small */}
          <div className="hidden lg:flex absolute bottom-6 left-1/2 -translate-x-1/2 flex-col items-center gap-3 opacity-30 hover:opacity-100 transition-opacity duration-500 pointer-events-none">
            <span className="text-[9px] uppercase tracking-[0.5em] font-bold text-foreground">Our Mission</span>
            <div className="w-[1px] h-12 bg-gradient-to-b from-foreground to-transparent" />
          </div>
        </section>
      </main>
      <div className="container mx-auto px-4 pb-12">
        <ProductReviews productHandle={product.handle} />
      </div>
      {!isMerch && (
        <div className="container mx-auto px-4 pb-12 max-w-3xl">
          <WineShippingPolicy variant="full" />
        </div>
      )}
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
          {memberDiscountApplies && !locked && selectedVariant?.availableForSale && (
            <span className="text-primary font-bold uppercase tracking-brand text-[10px]">
              Save ${(lineTotal - memberLineTotal).toFixed(2)} ({discountPercent}% off)
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => handleAddToCart()}
            disabled={cartLoading || !selectedVariant?.availableForSale || locked || (blockedByState && !isMerch)}
            size="lg"
            className="flex-1 bg-foreground text-background hover:bg-foreground/90"
          >
            {cartLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : !selectedVariant?.availableForSale ? "Sold Out"
            : locked ? <><Lock className="w-4 h-4 mr-2" /> Members only</>
            : blockedByState && !isMerch ? "Not available in your state"
            : subscribeMode ? `Subscribe — $${(variantPrice * quantity * (1 - DISCOUNT_PERCENT / 100)).toFixed(2)}`
            : <><ShoppingCart className="w-4 h-4 mr-2" /> Add to Cart</>}
          </Button>
          <Button
            onClick={() => handleAddToCart({ buyNow: true })}
            disabled={cartLoading || !selectedVariant?.availableForSale || locked || (blockedByState && !isMerch) || subscribeMode}
            size="lg"
            className="flex-1 bg-primary hover:bg-primary/90"
          >
            <Zap className="w-4 h-4 mr-2" /> Buy Now
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ProductDetail;
