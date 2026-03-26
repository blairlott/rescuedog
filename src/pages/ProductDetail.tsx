import { useParams, Link } from "react-router-dom";
import { useProductByHandle } from "@/hooks/useProducts";
import { useCartStore } from "@/stores/cartStore";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Loader2, ArrowLeft, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { SubscribeAndSave, DISCOUNT_PERCENT } from "@/components/SubscribeAndSave";
import { supabase } from "@/integrations/supabase/client";
import { useCartSettings } from "@/hooks/useCartSettings";

const ProductDetail = () => {
  const { handle } = useParams<{ handle: string }>();
  const { data: product, isLoading } = useProductByHandle(handle || "");
  const addItem = useCartStore(state => state.addItem);
  const cartLoading = useCartStore(state => state.isLoading);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [subscribeMode, setSubscribeMode] = useState(false);
  const [subFrequency, setSubFrequency] = useState("monthly");

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

  const handleAddToCart = async () => {
    if (!selectedVariant) return;
    const wrappedProduct = { node: product };
    await addItem({
      product: wrappedProduct,
      variantId: selectedVariant.id,
      variantTitle: selectedVariant.title,
      price: selectedVariant.price,
      quantity,
      selectedOptions: selectedVariant.selectedOptions || [],
    });
    const currentTotal = useCartStore.getState().items.reduce((sum, i) => sum + (parseFloat(i.price.amount) * i.quantity), 0);
    const remaining = 150 - currentTotal;
    if (remaining > 0) {
      toast.success(`${product.title} added! $${remaining.toFixed(2)} more for free shipping`, { position: "top-center" });
    } else {
      toast.success(`${product.title} added! You qualify for free shipping! 🎉`, { position: "top-center" });
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
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
              <div>
                <h1 className="font-display text-3xl font-bold text-foreground mb-2">{product.title}</h1>
                <p className="text-2xl font-bold text-primary">
                  ${parseFloat(selectedVariant?.price.amount || product.priceRange.minVariantPrice.amount).toFixed(2)}
                </p>
              </div>

              {product.description && (
                <p className="text-muted-foreground leading-relaxed">{product.description}</p>
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

              <Button
                onClick={handleAddToCart}
                disabled={cartLoading || !selectedVariant?.availableForSale}
                size="lg"
                className="w-full bg-primary hover:bg-primary/90"
              >
                {cartLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : !selectedVariant?.availableForSale ? (
                  "Sold Out"
                ) : subscribeMode ? (
                  <>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Subscribe — ${(parseFloat(selectedVariant.price.amount) * quantity * (1 - DISCOUNT_PERCENT / 100)).toFixed(2)}/shipment
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Add to Cart — ${(parseFloat(selectedVariant.price.amount) * quantity).toFixed(2)}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ProductDetail;
