import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { useProducts } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, Loader2 } from "lucide-react";
import { ShopifyProduct } from "@/lib/shopify";
import { isWineProduct } from "@/lib/productUtils";

const MerchHomePage = () => {
  const { data: products, isLoading } = useProducts(50);

  const merch = products?.filter((p: ShopifyProduct) => !isWineProduct(p)) || [];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero */}
      <section className="relative h-[70vh] min-h-[500px] flex items-center bg-foreground">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=1920')] bg-cover bg-center opacity-60" />
        <div className="relative container mx-auto px-4">
          <p className="text-primary-foreground/80 text-sm tracking-brand uppercase mb-4">
            Gear up for the dogs
          </p>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-primary-foreground mb-6 max-w-3xl leading-tight">
            Merch & Accessories That Make a Difference
          </h1>
          <Button
            asChild
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6"
          >
            <Link to="/merch#products">Shop Now</Link>
          </Button>
        </div>
      </section>

      {/* Mission Statement */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-sm font-bold tracking-brand uppercase text-foreground mb-4">
                50% of our PROFITS SUPPORT RESCUE ORGANIZATIONS
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                At Rescue Dog, we create products you'll love — knowing half our profits support animal rescue organizations across the country.
              </p>
              <p className="text-foreground mb-6">
                We ship to most of the US from our online store!
              </p>
              <Button
                asChild
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6"
              >
                <Link to="/shop">Shop Online</Link>
              </Button>
            </div>
            <div className="aspect-[4/3] bg-secondary overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800"
                alt="Rescue dog with merchandise"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Merch Grid */}
      <section className="py-16 bg-secondary">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl font-bold text-foreground">Our Products</h2>
            <Link to="/shop" className="text-sm font-medium text-foreground hover:text-primary flex items-center gap-1 uppercase tracking-brand">
              View All <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : merch.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No products found.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {merch.map((product: ShopifyProduct) => (
                <ProductCard key={product.node.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* About Section */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="aspect-[4/3] bg-secondary overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800"
                alt="Our mission"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <p className="text-xs tracking-brand uppercase text-muted-foreground mb-2">About us:</p>
              <h2 className="text-3xl md:text-4xl font-bold text-primary leading-tight mb-4">
                Responsible, Sustainable, Exceptional.
              </h2>
              <p className="text-foreground leading-relaxed mb-6">
                We believe in creating exceptional products while giving back to the community. Every purchase helps support rescue dogs in need.
              </p>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="uppercase tracking-brand text-sm font-bold border-foreground text-foreground hover:bg-foreground hover:text-background px-10"
              >
                <Link to="/about">Learn More</Link>
              </Button>
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
              Wholesale & B2B Partners
            </h2>
            <p className="text-primary-foreground/80 max-w-xl mx-auto mb-6">
              Retailers and distributors — get volume pricing and dedicated support for your business.
            </p>
            <Button
              asChild
              size="lg"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 uppercase tracking-brand text-sm font-bold px-10"
            >
              <Link to="/wholesale">Learn About Wholesale <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default MerchHomePage;
