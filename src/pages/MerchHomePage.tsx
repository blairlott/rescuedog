import { useState, useMemo } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { ShippingIncludedBanner } from "@/components/ShippingIncludedBanner";
import { useProducts } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, Loader2, Wine, Truck, HeartHandshake } from "lucide-react";
import { ShopifyProduct } from "@/lib/shopify";
import { isWineProduct } from "@/lib/productUtils";
import { cn } from "@/lib/utils";
import heroImg from "@/assets/merch-hero.jpg";
import heroImgWebp from "@/assets/merch-hero.webp";
import missionImg from "@/assets/merch-mission.jpg";
import { BundleStrip } from "@/components/merch/BundleStrip";
import { WineBarStrip } from "@/components/merch/WineBarStrip";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "apparel", label: "Apparel" },
  { id: "drinkware", label: "Drinkware" },
  { id: "pet", label: "For Your Pup" },
  { id: "home", label: "Home" },
  { id: "gift", label: "Gifts" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

function categoryOf(p: ShopifyProduct): string {
  // tags array carries category in our merch adapter (e.g. ["curated","dropship","apparel"])
  const tags = (p.node.tags || []).map((t) => t.toLowerCase());
  for (const c of CATEGORIES) {
    if (c.id !== "all" && tags.includes(c.id)) return c.id;
  }
  return "apparel";
}

const MerchHomePage = () => {
  const { data: products, isLoading } = useProducts(200);
  const [selected, setSelected] = useState<CategoryId>("all");

  const merch = useMemo(
    () => (products || []).filter((p: ShopifyProduct) => !isWineProduct(p)),
    [products],
  );

  const filtered = useMemo(
    () => (selected === "all" ? merch : merch.filter((p) => categoryOf(p) === selected)),
    [merch, selected],
  );

  return (
    <div className="min-h-dvh flex flex-col">
      <Header />

      {/* Hero */}
      <section className="relative h-[70vh] min-h-[520px] flex items-center bg-foreground">
        <picture>
          <source srcSet={heroImgWebp} type="image/webp" />
          <img
            src={heroImg}
            alt="Rescue dog with branded gear"
            className="absolute inset-0 w-full h-full object-cover opacity-70"
            width={1920}
            height={1088}
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/40 to-transparent" />
        <div className="relative container mx-auto px-4">
          <p className="text-primary-foreground/90 text-xs md:text-sm tracking-brand uppercase mb-4 font-bold">
            Gear that gives back · 50% of profits to rescue
          </p>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-primary-foreground mb-6 max-w-3xl leading-tight">
            Wear the cause.<br />Spoil the pup.
          </h1>
          <p className="text-primary-foreground/85 max-w-xl mb-8 text-base md:text-lg">
            Apparel, drinkware and pet gear designed in California, fulfilled
            from US partners, and built to support animal rescue every day.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6"
            >
              <a href="#products">Shop Merch</a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="bg-transparent text-primary-foreground border-primary-foreground/60 hover:bg-primary-foreground hover:text-foreground uppercase tracking-brand text-sm font-bold px-10 py-6"
            >
              <Link to="/wines">
                <Wine className="mr-2 h-4 w-4" /> Shop Wines
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-border bg-background">
        <div className="container mx-auto px-4 py-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-center md:text-left">
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <Truck className="h-5 w-5 text-primary" />
            <span className="text-xs uppercase tracking-brand font-bold">Shipped from US partners</span>
          </div>
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <HeartHandshake className="h-5 w-5 text-primary" />
            <span className="text-xs uppercase tracking-brand font-bold">50% of profits to rescue</span>
          </div>
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <Wine className="h-5 w-5 text-primary" />
            <span className="text-xs uppercase tracking-brand font-bold">Pairs perfectly with our wines</span>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-sm font-bold tracking-brand uppercase text-primary mb-4">
                50% of profits support rescue organizations
              </h2>
              <h3 className="text-3xl md:text-4xl font-bold text-foreground leading-tight mb-4">
                Every collar, mug, and tee helps a dog find home.
              </h3>
              <p className="text-foreground leading-relaxed mb-4">
                At Rescue Dog, we curate products you'll love — knowing half
                our profits support animal rescue partners across the country.
              </p>
              <p className="text-muted-foreground mb-6 text-sm">
                Fulfilled by US-based dropship partners. Most orders ship in 3–7 days.
              </p>
              <Button
                asChild
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6"
              >
                <a href="#products">Shop the Collection</a>
              </Button>
            </div>
            <div className="aspect-[4/3] bg-secondary overflow-hidden">
              <img
                src={missionImg}
                alt="Curated rescue dog merchandise flat-lay"
                className="w-full h-full object-cover"
                width={1280}
                height={960}
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Merch Grid with category filter */}
      <section id="products" className="py-16 bg-secondary scroll-mt-24">
        <div className="container mx-auto px-4">
          <div className="mb-8 text-center">
            <p className="text-xs uppercase tracking-brand text-muted-foreground mb-2">Shop the collection</p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              {selected === "all" ? "All Products" : CATEGORIES.find((c) => c.id === selected)?.label}
            </h2>
          </div>
          <BundleStrip />
          <WineBarStrip />

          {/* Category chips */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={cn(
                  "px-4 py-2 text-xs uppercase tracking-brand font-bold border transition-colors",
                  selected === c.id
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-foreground border-border hover:border-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No products in this category yet — check back soon.
            </p>
          ) : (
            <>
              <ShippingIncludedBanner mode="merch" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {filtered.map((product: ShopifyProduct) => (
                  <ProductCard key={product.node.id} product={product} />
                ))}
              </div>
              <p className="text-center text-xs text-muted-foreground mt-8">
                Showing {filtered.length} of {merch.length} products
              </p>
            </>
          )}
        </div>
      </section>

      {/* Wine cross-sell */}
      <section className="py-16 bg-foreground text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-xs uppercase tracking-brand text-primary-foreground/70 mb-2">Pair it up</p>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Add a bottle. Make it a gift.
              </h2>
              <p className="text-primary-foreground/85 mb-6 leading-relaxed">
                Our award-winning wines from California's Lodi AVA pair beautifully
                with any merch order. Wines ship via our compliance partner
                Vinoshipper and check out separately at a single combined cart.
              </p>
              <Button
                asChild
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6"
              >
                <Link to="/wines">
                  Shop the Wines <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                "https://cdn.shopify.com/s/files/1/0599/6580/0542/files/cab2023.png?v=1774391435",
                "https://cdn.shopify.com/s/files/1/0599/6580/0542/files/redblend2023.png?v=1774391461",
                "https://cdn.shopify.com/s/files/1/0599/6580/0542/files/chardonnay-2024.png?v=1774446984",
              ].map((src) => (
                <div key={src} className="aspect-[3/4] bg-background/10 p-4 flex items-center justify-center">
                  <img src={src} alt="Rescue Dog wine bottle" className="max-h-full object-contain" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* B2B CTA */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="bg-primary p-8 md:p-12 text-center">
            <Building2 className="h-10 w-10 text-primary-foreground mx-auto mb-4" />
            <h2 className="text-2xl md:text-3xl font-bold text-primary-foreground mb-3">
              Wholesale &amp; B2B Partners
            </h2>
            <p className="text-primary-foreground/80 max-w-xl mx-auto mb-6">
              Retailers and distributors — get volume pricing and dedicated
              support for your business.
            </p>
            <Button
              asChild
              size="lg"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 uppercase tracking-brand text-sm font-bold px-10"
            >
              <Link to="/wholesale">
                Learn About Wholesale <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default MerchHomePage;
