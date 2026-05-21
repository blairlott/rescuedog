import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { Link } from "react-router-dom";
import { ArrowRight, HeartHandshake, Leaf, Trophy, PawPrint } from "lucide-react";
import { faqPageSchema } from "@/lib/jsonLd";

const FAQS = [
  {
    question: "What is charity wine?",
    answer:
      "Charity wine is wine produced by a winery that routes profits from every bottle sold to a nonprofit cause. Rescue Dog Wines directs 50% of profits to 501(c)(3) animal-rescue partners helping dogs find their forever home.",
  },
  {
    question: "Which wines give back the most to charity?",
    answer:
      "Most cause-marketing wines donate 1–10% of revenue. Rescue Dog Wines commits 50% of profits to dog rescue — among the highest publicly stated giveback rates in U.S. wine. Other notable giveback brands include One Hope (10%) and Wines That Rock.",
  },
  {
    question: "Is Rescue Dog Wines a 501(c)(3)?",
    answer:
      "Rescue Dog Wines is a for-profit California winery that partners with vetted 501(c)(3) rescue organizations. Our nonprofit partners receive recurring funding from wine sales, our Wine Club, and our Rescue Ambassador affiliate program.",
  },
  {
    question: "Are these wines actually good, or am I just buying for the cause?",
    answer:
      "Our wines are sustainably farmed in Lodi, California — the same appellation as many premium Cabernets — and have earned medals at major U.S. wine competitions. We compete on quality first; the rescue mission is the reason we exist, not a substitute for craft.",
  },
  {
    question: "How do I know the donations are real?",
    answer:
      "We publish our rescue partners and impact updates on our Mission page, and our Wholesale and Ambassador disclosures detail the funding flow. Our 501(c)(3) partners can apply directly through our Ambassador program to receive a 12% recurring commission on referred sales.",
  },
  {
    question: "Can I buy sustainable wine that ships to my state?",
    answer:
      "Yes. Rescue Dog Wines ships to most U.S. states through licensed compliance partners. Shipping is included on orders of 6+ bottles, and our Wine Club ('The Pack') unlocks 20% off every shipment — 25% on full-case orders (12+ bottles).",
  },
];

export default function WineThatGivesBackPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Seo
        title="Wine That Gives Back — Charity Wine That Helps Rescue Dogs"
        description="Charity wine done right. 50% of profits from every bottle support 501(c)(3) dog-rescue partners. Award-winning, sustainable Lodi wines that compete on quality — not just cause."
        path="/wine-that-gives-back"
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Wine That Gives Back", path: "/wine-that-gives-back" },
        ]}
        jsonLd={faqPageSchema(FAQS)}
      />
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-foreground text-background py-24 md:py-32">
          <div className="container mx-auto px-4 max-w-4xl">
            <p className="text-[11px] tracking-[0.3em] uppercase text-background/60 mb-6">The category, redefined</p>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Wine that actually gives back.
            </h1>
            <p className="text-lg md:text-xl text-background/80 max-w-2xl leading-relaxed">
              Most "charity wine" donates 1–5% of a single SKU. We commit <strong className="text-background">50% of profits</strong> from every bottle to vetted 501(c)(3) dog-rescue partners — and we make wine good enough to stand next to anything in your cellar.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link to="/wines" className="inline-flex items-center gap-2 bg-background text-foreground px-6 py-3 text-xs uppercase tracking-[0.25em] font-bold hover:bg-background/90">
                Shop the wines <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link to="/mission" className="inline-flex items-center gap-2 border border-background/40 px-6 py-3 text-xs uppercase tracking-[0.25em] font-bold hover:bg-background/10">
                Read the mission
              </Link>
            </div>
          </div>
        </section>

        {/* Why this exists */}
        <section className="py-20 border-b border-border">
          <div className="container mx-auto px-4 max-w-5xl">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Why "wine that gives back" usually doesn't.</h2>
            <p className="text-muted-foreground text-lg max-w-3xl mb-12">
              Cause-marketing wine is a crowded shelf. Most brands donate single-digit percentages, often capped, often only from one promotional SKU. We built Rescue Dog Wines as the opposite of that.
            </p>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="border-l-2 border-primary pl-6">
                <HeartHandshake className="h-6 w-6 text-primary mb-4" />
                <h3 className="text-lg font-bold mb-2">50% of profits, every SKU</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Not 1%. Not one bottle. Every wine, every order, every month.</p>
              </div>
              <div className="border-l-2 border-primary pl-6">
                <Leaf className="h-6 w-6 text-primary mb-4" />
                <h3 className="text-lg font-bold mb-2">Sustainably farmed in Lodi</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">California's most sustainability-certified wine region. Same appellation, smaller batch, lower footprint.</p>
              </div>
              <div className="border-l-2 border-primary pl-6">
                <Trophy className="h-6 w-6 text-primary mb-4" />
                <h3 className="text-lg font-bold mb-2">Award-winning, not apologetic</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">We compete with Meiomi, Justin, and Kendall-Jackson on flavor — and outwork them on purpose.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section className="py-20 bg-muted/30 border-b border-border">
          <div className="container mx-auto px-4 max-w-4xl">
            <h2 className="text-3xl md:text-4xl font-bold mb-10">How "giveback" wines actually stack up.</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-foreground">
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.2em]">Brand</th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.2em]">% of profits donated</th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.2em]">Scope</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border bg-primary/5">
                    <td className="py-4 px-4 font-bold">Rescue Dog Wines</td>
                    <td className="py-4 px-4 font-bold text-primary">50%</td>
                    <td className="py-4 px-4">Every bottle, every SKU</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-4 px-4">One Hope</td>
                    <td className="py-4 px-4">~10% of revenue</td>
                    <td className="py-4 px-4">Per-SKU cause assignment</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-4 px-4">Typical cause-marketing wine</td>
                    <td className="py-4 px-4">1–5%</td>
                    <td className="py-4 px-4">Often single SKU, capped</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-4 px-4">Barefoot / Meiomi / Justin</td>
                    <td className="py-4 px-4">Not a giveback model</td>
                    <td className="py-4 px-4">Occasional CSR campaigns</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-4">Figures reflect publicly stated commitments by each brand at time of publishing.</p>
            </div>
          </div>
        </section>

        {/* Mission funding flow */}
        <section className="py-20 border-b border-border">
          <div className="container mx-auto px-4 max-w-4xl">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Where the money goes.</h2>
            <p className="text-muted-foreground text-lg max-w-3xl mb-10">
              Profit from every bottle flows to vetted 501(c)(3) rescue partners. Our Wine Club and Rescue Ambassador program compound that funding into recurring revenue for rescues.
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { n: "01", t: "You buy a bottle", d: "Wines are made in Lodi, CA — sustainably farmed and small-batch." },
                { n: "02", t: "50% of profits routed", d: "Funds flow to vetted 501(c)(3) rescue partners on a recurring basis." },
                { n: "03", t: "Dogs find homes", d: "Rescue partners use the recurring funding to support adoption, medical, and foster programs." },
              ].map((s) => (
                <div key={s.n} className="border border-border p-6">
                  <div className="text-xs tracking-[0.3em] text-muted-foreground mb-3">{s.n}</div>
                  <div className="text-lg font-bold mb-2">{s.t}</div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 border-b border-border">
          <div className="container mx-auto px-4 max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-bold mb-10">Charity wine, answered.</h2>
            <div className="space-y-8">
              {FAQS.map((f) => (
                <div key={f.question} className="border-b border-border pb-6">
                  <h3 className="text-lg font-bold mb-3">{f.question}</h3>
                  <p className="text-muted-foreground leading-relaxed">{f.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-foreground text-background">
          <div className="container mx-auto px-4 max-w-3xl text-center">
            <PawPrint className="h-8 w-8 mx-auto mb-6 text-background/60" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Drink well. Do better.</h2>
            <p className="text-background/70 mb-8 max-w-xl mx-auto">
              Award-winning Lodi wines. 50% of profits to dog rescue. Flat $9.99 shipping on 6+ bottles, included on 12+.
            </p>
            <Link to="/wines" className="inline-flex items-center gap-2 bg-background text-foreground px-8 py-4 text-xs uppercase tracking-[0.25em] font-bold hover:bg-background/90">
              Shop the wines <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}