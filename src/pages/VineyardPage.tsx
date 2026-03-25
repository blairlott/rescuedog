import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Leaf, Grape, TreePine, Sprout } from "lucide-react";

const VineyardPage = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-[50vh] min-h-[400px] flex items-center bg-foreground">
          <div className="absolute inset-0 bg-[url('https://rescuedogwines.com/wp-content/uploads/2023/09/rdw-vineyard-grapes.jpg')] bg-cover bg-center opacity-50" />
          <div className="relative container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-4">About Our Vineyard</h1>
            <p className="text-primary-foreground/80 text-lg max-w-3xl mx-auto">
              Committed to sustainable farming and exceptional winemaking in Lodi, California.
            </p>
          </div>
        </section>

        {/* Story */}
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3">Sustainability & Quality</h2>
              <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-6 uppercase">
                You might know Rescue Dog Wines is committed to sharing half our profits with rescue organizations, but did you know that we're also dedicated to sustainable farming?
              </h3>
              <p className="text-foreground leading-relaxed mb-6">
                When we started Rescue Dog Wines, we knew we wanted to make premium, sustainable wine that honored the rich winemaking history of California. We quickly fell in love with Lodi, a community outside Sacramento with historic roots in American winemaking that date back over 100 years.
              </p>
              <p className="text-foreground leading-relaxed mb-6">
                After two years of searching for just the right property, in 2017 we purchased a vineyard in Acampo (just a few minutes' drive north of Lodi). We knew we had a lot of work ahead of us to get the vineyard ready for planting and were fortunate to meet and partner with Round Valley Ranches and vineyard manager Aaron Shinn.
              </p>
              <p className="text-foreground leading-relaxed mb-6">
                We couldn't have asked for a better collaboration. As Aaron says, "Round Valley Ranches is a client-oriented, client-driven vineyard management company. Our goal is to work with the client to make them successful. We're a company that's built on long-term relationships." We've watched our vineyard transform under Round Valley Ranches' management. Aaron has guided us through every step of the revitalization of the Acampo property and shares our vision for a sustainable vineyard that yields exceptional grapes for exceptional wine.
              </p>
              <p className="text-foreground leading-relaxed">
                We cleared the then-abandoned vineyard, preserving the oak trees and as much native habitat as possible, and planted baby vines in 2020. Using a vertical shoot position (VSP) trellis system, we started with three grape varieties: Grenache Noir, Mourvèdre, and Sangiovese.
              </p>
            </div>
          </div>
        </section>

        {/* Vineyard Images */}
        <section className="py-8">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="aspect-[4/3] bg-secondary overflow-hidden">
                <img src="https://rescuedogwines.com/wp-content/uploads/2023/12/rdw-vineyard-5.jpg" alt="Rescue Dog Wines vineyard" className="w-full h-full object-cover" />
              </div>
              <div className="aspect-[4/3] bg-secondary overflow-hidden">
                <img src="https://rescuedogwines.com/wp-content/uploads/2023/12/rdw-vineyard-3.jpg" alt="Vineyard rows" className="w-full h-full object-cover" />
              </div>
              <div className="aspect-[4/3] bg-secondary overflow-hidden">
                <img src="https://rescuedogwines.com/wp-content/uploads/2023/12/rdw-vineyard-1.jpg" alt="Vineyard landscape" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </section>

        {/* Lodi Rules */}
        <section className="py-16 bg-secondary">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="flex justify-center">
                <img
                  src="https://rescuedogwines.com/wp-content/uploads/2023/12/lodi-sustainable-winegrowing.png"
                  alt="Lodi Rules Sustainable Winegrowing certification"
                  className="max-w-[300px] w-full h-auto"
                />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-foreground mb-6">Lodi Rules</h2>
                <p className="text-foreground leading-relaxed mb-4">
                  Vineyard owners, farmers, and winemakers in Lodi have been at the forefront of sustainable winemaking practices for decades. In the 1990s, the Lodi Winegrape Commission implemented programs to educate area farmers and reduce their reliance on pesticides through integrated pest management.
                </p>
                <p className="text-foreground leading-relaxed mb-4">
                  This program ultimately grew into the Lodi Rules certification, which is respected internationally for pioneering sustainable farming practices in the industry. There are over 1,200 Lodi Rules–certified vineyards now, from California, to Washington, to Israel.
                </p>
                <p className="text-foreground leading-relaxed mb-6">
                  Round Valley Ranches introduced us to Lodi Rules, knowing the certification program was in line with our goals for sustainability and quality. We are proud to say that our Acampo vineyard is Lodi Rules–certified.
                </p>
                <Button asChild variant="outline" size="lg" className="uppercase tracking-brand text-sm font-bold border-foreground text-foreground hover:bg-foreground hover:text-background px-10">
                  <a href="https://www.lodirules.org/" target="_blank" rel="noopener noreferrer">Learn About Lodi Rules</a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Sustainability Pillars */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {[
                { icon: Leaf, title: "Integrated Pest Management", desc: "Reducing reliance on pesticides through natural and sustainable methods." },
                { icon: Sprout, title: "Soil Health", desc: "Preserving and enriching soil through cover crops and organic practices." },
                { icon: TreePine, title: "Habitat Preservation", desc: "Preserving oak trees and native habitat throughout our vineyard property." },
                { icon: Grape, title: "VSP Trellis System", desc: "Vertical shoot positioning for optimal grape quality and vine health." },
              ].map((item) => (
                <div key={item.title} className="text-center p-6">
                  <item.icon className="h-10 w-10 text-primary mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default VineyardPage;
