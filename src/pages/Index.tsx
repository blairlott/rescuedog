import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { useProducts } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Wine, ArrowRight, Building2, Loader2 } from "lucide-react";
import { ShopifyProduct } from "@/lib/shopify";

const Index = () => {
  const { data: products, isLoading } = useProducts(50);

  const wines = products?.filter((p: ShopifyProduct) => p.node.title.toLowerCase().includes('wine') || p.node.title.match(/cabernet|pinot|chardonnay|rosé|rose|sauvignon|sparkling|blend|méthode|demi/i)) || [];
  const merch = products?.filter((p: ShopifyProduct) => !wines.includes(p)) || [];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero */}
      <section className="relative bg-primary py-24 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <Wine className="h-14 w-14 text-gold mx-auto mb-6" />
          <h1 className="font-display text-4xl md:text-6xl font-bold text-primary-foreground mb-4 tracking-tight">
            Rescue Dog Wines
          </h1>
          <p className="text-primary-foreground/80 text-lg md:text-xl max-w-2xl mx-auto mb-8 font-body">
            Premium wines with purpose. Every bottle supports dog rescue organizations across the country.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="bg-gold text-accent-foreground hover:bg-gold-light font-semibold">
              <Link to="/wines">Shop Wines <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
              <Link to="/wholesale"><Building2 className="mr-2 h-4 w-4" />Wholesale Inquiries</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Featured Wines */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-display text-3xl font-bold text-foreground">Our Wines</h2>
            <Link to="/wines" className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1">
              View All <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : wines.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No wines found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {wines.slice(0, 8).map((product: ShopifyProduct) => (
                <ProductCard key={product.node.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Merch Section */}
      {merch.length > 0 && (
        <section className="py-16 bg-card">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-display text-3xl font-bold text-foreground">Merch & Accessories</h2>
              <Link to="/shop" className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1">
                View All <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {merch.slice(0, 4).map((product: ShopifyProduct) => (
                <ProductCard key={product.node.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* B2B CTA */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="bg-primary rounded-lg p-8 md:p-12 text-center">
            <Building2 className="h-10 w-10 text-gold mx-auto mb-4" />
            <h2 className="font-display text-2xl md:text-3xl font-bold text-primary-foreground mb-3">
              Wholesale & B2B Partners
            </h2>
            <p className="text-primary-foreground/80 max-w-xl mx-auto mb-6">
              Restaurants, retailers, and distributors — get volume pricing and dedicated support for your business.
            </p>
            <Button asChild size="lg" className="bg-gold text-accent-foreground hover:bg-gold-light font-semibold">
              <Link to="/wholesale">Learn About Wholesale <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
