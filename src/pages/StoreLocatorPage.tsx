import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Link } from "react-router-dom";

const storeLocatorLinks = [
  {
    label: "LUCKY",
    url: "https://luckysupermarkets.com/search/products?q=rescue%20dog%20wines",
  },
  {
    label: "SAVEMART",
    url: "https://bottlebarn.com/search?q=rescue%20dog%20wines",
  },
  {
    label: "BOTTLE BARN",
    url: "https://bottlebarn.com/search?q=rescue%20dog%20wines",
  },
  {
    label: "INSTACART",
    url: "https://www.instacart.com/store/brands/rescue-dog-wines",
  },
];

const GRAPPOS_UID = "TG-5727723373";

const StoreLocatorPage = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero / Intro */}
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4 text-center max-w-3xl">
            <p className="text-xs tracking-brand uppercase text-muted-foreground mb-2">
              Shop in Stores
            </p>
            <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
              Find Rescue Dog Wines Near You
            </h1>
            <h2 className="text-lg md:text-xl text-muted-foreground mb-4 uppercase tracking-brand">
              Find Us in Your Local Restaurant, Wine Bar, or Retailer
            </h2>
            <p className="text-foreground leading-relaxed mb-2">
              Rescue Dog Wines are carried at retailers and restaurants. Enter your zip code below to find the location closest to you.
            </p>
            <p className="text-foreground">
              You can also always order Rescue Dog Wines from our{" "}
              <Link to="/wines" className="text-primary hover:underline font-medium">
                online store
              </Link>
              .
            </p>
          </div>
        </section>

        {/* Grappos Store Locator Embed */}
        <section className="pb-12 md:pb-16">
          <div className="container mx-auto px-4">
            <div id="grappos-locator" className="w-full max-w-5xl mx-auto overflow-hidden rounded-lg border border-border" style={{ width: "100%", height: "625px" }} />
          </div>
        </section>

        {/* Same Day Delivery */}
        <section className="py-12 md:py-16 bg-secondary">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
              Need It Same Day?
            </h2>
            <p className="text-muted-foreground mb-8">
              Check your local delivery options:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
              {storeLocatorLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-background border border-border hover:border-primary px-6 py-4 text-sm font-bold tracking-brand uppercase text-foreground hover:text-primary transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default StoreLocatorPage;
