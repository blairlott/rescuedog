import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Wine, Gift, Truck, Star, Heart, Users } from "lucide-react";

const perks = [
  { icon: Wine, title: "Curated Selections", desc: "Hand-picked wines from our award-winning portfolio, delivered to your door." },
  { icon: Gift, title: "Member-Only Pricing", desc: "Exclusive discounts on all wines — save on every bottle, every time." },
  { icon: Truck, title: "Free Shipping", desc: "Complimentary shipping on all club shipments, so you never pay extra." },
  { icon: Star, title: "Early Access", desc: "Be the first to taste new releases and limited-edition wines before anyone else." },
  { icon: Heart, title: "Double the Impact", desc: "Your membership means even more support for rescue organizations." },
  { icon: Users, title: "Exclusive Events", desc: "Invitations to member-only tastings, virtual events, and winery experiences." },
];

const WineClubPage = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-[50vh] min-h-[400px] flex items-center bg-foreground">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1920')] bg-cover bg-center opacity-50" />
          <div className="relative container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-4">Wine Club</h1>
            <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
              Join our wine club and enjoy exclusive wines, member pricing, and the satisfaction of supporting rescue dogs with every shipment.
            </p>
          </div>
        </section>

        {/* Perks */}
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3">Member Benefits</h2>
              <h3 className="text-3xl md:text-4xl font-bold text-foreground">Why Join Our Wine Club?</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {perks.map((perk) => (
                <div key={perk.title} className="text-center p-6 border border-border">
                  <perk.icon className="h-10 w-10 text-primary mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-foreground mb-2">{perk.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{perk.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Vinoshipper Embed */}
        <section className="py-16 bg-secondary">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3">Choose Your Club</h2>
              <h3 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Select a Membership</h3>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                We offer multiple club tiers to fit your preferences. From casual sippers to dedicated collectors, there's a club for you.
              </p>
            </div>
            <div className="max-w-4xl mx-auto bg-background border border-border p-8 md:p-12">
              <div className="text-center">
                <Wine className="h-16 w-16 text-primary mx-auto mb-6" />
                <h4 className="text-2xl font-bold text-foreground mb-4">Wine Club Memberships</h4>
                <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
                  Our wine clubs are managed through Vinoshipper. Click below to browse all available club tiers, see pricing, and sign up.
                </p>
                <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6">
                  <a href="https://rescuedogwines.vinoshipper.com/clubs" target="_blank" rel="noopener noreferrer">
                    Browse Club Options
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold text-foreground mb-8 text-center">Frequently Asked Questions</h2>
              <div className="space-y-6">
                {[
                  { q: "How often will I receive shipments?", a: "Shipment frequency depends on the club tier you choose. Most clubs ship quarterly, but some offer monthly or bi-monthly options." },
                  { q: "Can I customize my selections?", a: "Some club tiers allow you to swap wines before your shipment. Check your specific tier details for customization options." },
                  { q: "Can I cancel anytime?", a: "Yes! There are no long-term commitments. You can cancel your membership at any time through Vinoshipper." },
                  { q: "Where do you ship?", a: "We ship to most states in the US. Check Vinoshipper for specific state availability during sign-up." },
                ].map((faq) => (
                  <div key={faq.q} className="border-b border-border pb-6">
                    <h4 className="font-bold text-foreground mb-2">{faq.q}</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default WineClubPage;
