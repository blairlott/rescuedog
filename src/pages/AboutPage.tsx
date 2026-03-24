import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const AboutPage = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-[50vh] min-h-[400px] flex items-center bg-foreground">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1920')] bg-cover bg-center opacity-50" />
          <div className="relative container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-4">About Us</h1>
            <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
              Our wine is for the dogs — and the people who love them.
            </p>
          </div>
        </section>

        {/* Story */}
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3">Our Story</h2>
                <h3 className="text-3xl font-bold text-foreground mb-6">Great Wine. Greater Purpose.</h3>
                <p className="text-foreground leading-relaxed mb-4">
                  Rescue Dog Wines was founded with a simple mission: craft award-winning wines while making a real difference for rescue dogs. Every bottle purchased helps fund animal rescue organizations across the country.
                </p>
                <p className="text-foreground leading-relaxed mb-4">
                  We source our grapes from sustainably farmed vineyards in Lodi, California — a region known for its Mediterranean climate and exceptional wine quality. Our winemaking team is dedicated to producing wines that stand out on their own merits.
                </p>
                <p className="text-foreground leading-relaxed">
                  But what truly sets us apart is our commitment to giving back. 50% of our profits go directly to rescue organizations, helping dogs find their forever homes.
                </p>
              </div>
              <div className="aspect-[4/3] bg-secondary overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1474722883778-792e7990302f?w=800"
                  alt="Rescue Dog Wines vineyard"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Sustainability */}
        <section className="py-16 bg-secondary">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="aspect-[4/3] bg-background overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=800"
                  alt="Sustainable vineyard"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3">Sustainability</h2>
                <h3 className="text-3xl font-bold text-foreground mb-6">Lodi Rules Certified</h3>
                <p className="text-foreground leading-relaxed mb-4">
                  Our grapes are grown under the Lodi Rules Sustainable Winegrowing Program, one of the most rigorous third-party sustainability certifications in the wine industry.
                </p>
                <p className="text-foreground leading-relaxed mb-4">
                  This means our vineyards follow strict standards for pest management, soil health, water conservation, and habitat preservation — ensuring every bottle is as responsible as it is delicious.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold text-foreground mb-4">Ready to Try Our Wines?</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              Every sip supports rescue dogs. Browse our award-winning collection today.
            </p>
            <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6">
              <Link to="/wines">Shop Wines</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default AboutPage;
