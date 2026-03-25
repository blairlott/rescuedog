import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Heart, PawPrint, Wine, TreePine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { useState, useMemo } from "react";

const pillars = [
  { icon: Heart, title: "50% of Profits Donated", desc: "Half of every dollar we earn goes directly to rescue organizations helping dogs find forever homes." },
  { icon: PawPrint, title: "Rescue Partners", desc: "We partner with rescue organizations nationwide to fund adoptions, medical care, and shelter operations." },
  { icon: Wine, title: "Award-Winning Quality", desc: "Our wines have earned Gold and Double Gold medals at prestigious competitions — great wine for a great cause." },
  { icon: TreePine, title: "Sustainable Farming", desc: "Lodi Rules certified sustainable vineyards ensure we protect the land while producing exceptional grapes." },
];

const rescuePartners = [
  { name: "Texas Critter Crusaders", city: "Taylor", state: "TX", url: "https://texascrittercrusaders.com/" },
  { name: "Caring Hearts 4 Paws", city: "Toledo", state: "WA", url: "https://caringhearts4paws.org/" },
  { name: "Furry Friends Humane", city: "Jupiter", state: "FL", url: "https://ffhumane.org/" },
  { name: "San Francisco SPCA", city: "San Francisco", state: "CA", url: "https://www.sfspca.org/" },
  { name: "Heaven Can Wait Rescue", city: "Congers", state: "NY", url: "https://heavencanwaitlv.org/" },
  { name: "Ho-Bo Care Boxer Rescue", city: "Denver", state: "CO", url: "https://www.hobocare.org/" },
  { name: "Annenberg Pet Space", city: "Playa Vista", state: "CA", url: "https://annenbergpetspace.org/" },
  { name: "Safe Animal Shelter of Orange County", city: "Orange", state: "FL", url: "https://www.safeanimalshelter.com/" },
  { name: "Reagan and Rowan's Rescue", city: "Illinois City", state: "IL", url: "https://reaganandrowansrescue.com/" },
  { name: "Pawsitive Change", city: "Athens", state: "GA", url: "https://pawsitive-change.org/" },
  { name: "Lodi Animal Services Foundation", city: "Lodi", state: "CA", url: "https://www.thelasf.org/" },
  { name: "El Dorado County German Shepherd Rescue", city: "Shingle Springs", state: "CA", url: "https://www.grcgla.org/" },
  { name: "Golden Retriever Club Of Greater Los Angeles", city: "Los Angeles", state: "CA", url: "https://www.grcgla.org/" },
  { name: "Whitman County Humane Society", city: "Pullman", state: "WA", url: "https://www.whitmanpets.org/" },
  { name: "Forget Me Not Animal Rescue", city: "Joliet", state: "IL", url: "https://forgetmenotrescue.com/" },
  { name: "Bakersfield SPCA", city: "Bakersfield", state: "CA", url: "https://bakersfieldspca.org/" },
  { name: "Better Together Pet Resource Center", city: "Niagara Falls", state: "NY", url: "https://www.bettertogetherpetresourcecenter.org/" },
  { name: "The Animal Pad", city: "San Diego", state: "CA", url: "https://theanimalpad.org/" },
  { name: "Relay For Rescue Inc.", city: "Longmont", state: "CO", url: "http://relayforrescue.com/" },
  { name: "Hard Luck Animal Welfare Advocates", city: "Sacramento", state: "CA", url: "https://www.hardluckawa.org/" },
  { name: "Triad Golden Retriever Rescue", city: "Greensboro", state: "NC", url: "https://tgrr.org/" },
  { name: "PAALS", city: "Columbia", state: "SC", url: "http://paals.org/" },
  { name: "It's a Pittie Rescue", city: "Morris", state: "IL", url: "http://rescueapittie.org/" },
  { name: "New York Bully Crew", city: "East Patchogue", state: "NY", url: "https://www.nybullycrew.org/" },
  { name: "Footbridge Foundation", city: "San Antonio", state: "TX", url: "https://www.footbridgefoundation.org/" },
];

const MissionPage = () => {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return rescuePartners;
    const q = search.toLowerCase();
    return rescuePartners.filter(
      (p) => p.name.toLowerCase().includes(q) || p.city.toLowerCase().includes(q) || p.state.toLowerCase().includes(q)
    );
  }, [search]);

  const displayed = showAll ? filtered : filtered.slice(0, 10);

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
              Through wine sales and donations, our mission is to support the placement of as many rescue dogs as possible into loving homes.
            </p>
          </div>
        </section>

        {/* 50% Stat */}
        <section className="py-16 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <p className="text-7xl md:text-9xl font-bold mb-4">50%</p>
            <p className="text-xl md:text-2xl font-bold">of our profits support rescue dog and charitable organizations</p>
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

        {/* How We Give */}
        <section className="py-16 bg-secondary">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">How We Give</h2>
              <p className="text-foreground leading-relaxed mb-4">
                We support rescue dogs in many ways, ranging from wine donations for fundraising events, to endowments, to volunteering our time and personally fostering dogs.
              </p>
              <p className="text-foreground leading-relaxed">
                We prefer to donate wine for fundraising. We tend to donate locally in California or in other states where we have distribution, so our partners can donate on our behalf. If you're really close by, our team can potentially show up and pour our wines at your rescue organization's event!
              </p>
            </div>
          </div>
        </section>

        {/* Rescue Partners Table */}
        <section className="py-16" id="partners">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8">
              <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3">Our Network</h2>
              <h3 className="text-3xl md:text-4xl font-bold text-foreground mb-2">Supported Rescue Organizations</h3>
              <p className="text-muted-foreground">Showing {filtered.length} of 216+ partner organizations</p>
            </div>

            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <Input
                  placeholder="Search by name, city, or state..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setShowAll(true); }}
                  className="max-w-sm"
                />
              </div>

              <div className="border border-border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-secondary">
                      <th className="text-left py-3 px-4 text-sm font-bold text-foreground">Organization Name</th>
                      <th className="text-left py-3 px-4 text-sm font-bold text-foreground hidden md:table-cell">City</th>
                      <th className="text-left py-3 px-4 text-sm font-bold text-foreground">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((org, i) => (
                      <tr key={org.name} className={i % 2 === 0 ? "bg-background" : "bg-secondary/50"}>
                        <td className="py-3 px-4 text-sm">
                          <a href={org.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {org.name}
                          </a>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground hidden md:table-cell">{org.city}</td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">{org.state}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!showAll && filtered.length > 10 && (
                <div className="text-center mt-6">
                  <Button variant="outline" onClick={() => setShowAll(true)} className="uppercase tracking-brand text-sm font-bold">
                    Show All {filtered.length} Organizations
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Partner CTA */}
        <section className="py-16 bg-secondary">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold text-foreground mb-4">Partner with Us</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              If you'd like for us to consider your rescue organization for a donation, please complete our Donation Request form. We appreciate your understanding that we are a small, family-owned winery with limited resources.
            </p>
            <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6">
              <Link to="/donation">Donation Request Form</Link>
            </Button>
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
