import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Heart, PawPrint, Wine, TreePine } from "lucide-react";

const pillars = [
  { icon: Heart, title: "50% of Profits Donated", desc: "Half of every dollar we earn goes directly to rescue organizations helping dogs find forever homes." },
  { icon: PawPrint, title: "Rescue Partners", desc: "We partner with rescue organizations nationwide to fund adoptions, medical care, and shelter operations." },
  { icon: Wine, title: "Award-Winning Quality", desc: "Our wines have earned Gold and Double Gold medals at prestigious competitions — great wine for a great cause." },
  { icon: TreePine, title: "Sustainable Farming", desc: "Lodi Rules certified sustainable vineyards ensure we protect the land while producing exceptional grapes." },
];

const MissionPage = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-[50vh] min-h-[400px] flex items-center bg-foreground">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=1920')] bg-cover bg-center opacity-50" />
          <div className="relative container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-4">Our Mission</h1>
            <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
              Great wine with a greater purpose — saving rescue dogs, one bottle at a time.
            </p>
          </div>
        </section>

        {/* Pillars */}
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {pillars.map((p) => (
                <div key={p.title} className="text-center p-6">
                  <p.icon className="h-10 w-10 text-primary mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-foreground mb-2">{p.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Impact */}
        <section className="py-16 bg-secondary">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3">Our Impact</h2>
              <h3 className="text-3xl md:text-4xl font-bold text-foreground mb-6">Every Bottle Makes a Difference</h3>
              <p className="text-foreground leading-relaxed mb-4">
                Since our founding, Rescue Dog Wines has donated to rescue organizations across the United States. Your purchase directly funds adoption events, veterinary care, foster programs, and shelter improvements.
              </p>
              <p className="text-foreground leading-relaxed">
                We believe that enjoying great wine and doing good should go hand in hand. When you choose Rescue Dog Wines, you're choosing to make a difference in the lives of rescue dogs.
              </p>
            </div>
          </div>
        </section>

        {/* Quote */}
        <section className="py-16">
          <div className="container mx-auto px-4 text-center">
            <blockquote className="text-2xl md:text-3xl font-bold text-primary italic max-w-3xl mx-auto leading-relaxed">
              "Our wine is for the dogs."
            </blockquote>
            <p className="text-muted-foreground mt-4 text-sm tracking-brand uppercase">— Rescue Dog Wines</p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default MissionPage;
