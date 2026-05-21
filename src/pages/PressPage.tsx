import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { Link } from "react-router-dom";
import { Download, Mail, Newspaper, Quote } from "lucide-react";

const FACTS = [
  { label: "Founded", value: "Family-owned California winery" },
  { label: "Region", value: "Lodi, CA — sustainably farmed" },
  { label: "Giveback", value: "50% of profits to 501(c)(3) dog-rescue partners" },
  { label: "Distribution", value: "DTC + wholesale across most U.S. states" },
  { label: "Wine Club", value: "'The Pack' — access-based loyalty, 20% off (25% on full cases)" },
  { label: "Ambassador program", value: "12% commission, managed via impact.com" },
];

const QUOTES = [
  {
    q: "We built Rescue Dog Wines as the opposite of a cause-marketing campaign. The mission is the product, not the marketing.",
    a: "Founders, Rescue Dog Wines",
  },
];

export default function PressPage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <Seo
        title="Press & Media — Rescue Dog Wines"
        description="Press kit, founder bios, brand assets, and high-resolution imagery for journalists covering Rescue Dog Wines — the Lodi winery donating 50% of profits to dog rescue."
        path="/press"
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Press", path: "/press" },
        ]}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "NewsMediaOrganization",
          name: "Rescue Dog Wines — Press Room",
          url: "https://rescuedogwines.com/press",
          parentOrganization: {
            "@type": "Organization",
            name: "Rescue Dog Wines",
            url: "https://rescuedogwines.com",
          },
        }}
      />
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-foreground text-background py-20 md:py-28">
          <div className="container mx-auto px-4 max-w-4xl">
            <p className="text-[11px] tracking-[0.3em] uppercase text-background/60 mb-6">For journalists & editors</p>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">Press & Media.</h1>
            <p className="text-lg text-background/80 max-w-2xl leading-relaxed">
              Brand assets, founder bios, key facts, and high-resolution imagery for stories about Rescue Dog Wines. Working on a deadline? Email us directly.
            </p>
            <a
              href="mailto:press@rescuedogwines.com"
              className="mt-8 inline-flex items-center gap-2 bg-background text-foreground px-6 py-3 text-xs uppercase tracking-[0.25em] font-bold hover:bg-background/90"
            >
              <Mail className="h-3.5 w-3.5" /> press@rescuedogwines.com
            </a>
          </div>
        </section>

        {/* Key facts */}
        <section className="py-20 border-b border-border">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="flex items-center gap-3 mb-8">
              <Newspaper className="h-5 w-5 text-primary" />
              <h2 className="text-2xl md:text-3xl font-bold">Key facts</h2>
            </div>
            <dl className="grid md:grid-cols-2 gap-6">
              {FACTS.map((f) => (
                <div key={f.label} className="border border-border p-6">
                  <dt className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">{f.label}</dt>
                  <dd className="text-base font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Story angles */}
        <section className="py-20 bg-muted/30 border-b border-border">
          <div className="container mx-auto px-4 max-w-4xl">
            <h2 className="text-2xl md:text-3xl font-bold mb-8">Story angles we can speak to</h2>
            <ul className="space-y-4 text-base">
              <li className="border-l-2 border-primary pl-4">
                <strong>The 50% commitment.</strong> Why a for-profit winery donates half its profits — and how it stays viable.
              </li>
              <li className="border-l-2 border-primary pl-4">
                <strong>Lodi vs Napa.</strong> The case for California's most sustainability-certified appellation as the next premium-wine story.
              </li>
              <li className="border-l-2 border-primary pl-4">
                <strong>Cause-marketing fatigue.</strong> Why "1% of one SKU" doesn't move consumers anymore — and what does.
              </li>
              <li className="border-l-2 border-primary pl-4">
                <strong>Rescue Ambassadors.</strong> A non-MLM affiliate model giving 501(c)(3) partners a 12% recurring revenue line.
              </li>
              <li className="border-l-2 border-primary pl-4">
                <strong>The economics of dog rescue.</strong> What recurring funding (vs one-time grants) actually changes for shelters.
              </li>
            </ul>
          </div>
        </section>

        {/* Quotes */}
        <section className="py-20 border-b border-border">
          <div className="container mx-auto px-4 max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-bold mb-10">Approved quotes</h2>
            {QUOTES.map((q, i) => (
              <blockquote key={i} className="border-l-4 border-primary pl-6 py-2">
                <Quote className="h-6 w-6 text-primary/40 mb-3" />
                <p className="text-xl leading-relaxed italic mb-4">"{q.q}"</p>
                <footer className="text-sm text-muted-foreground uppercase tracking-[0.2em]">— {q.a}</footer>
              </blockquote>
            ))}
          </div>
        </section>

        {/* Assets */}
        <section className="py-20 border-b border-border">
          <div className="container mx-auto px-4 max-w-4xl">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">Brand assets</h2>
            <p className="text-muted-foreground mb-8">
              Logos, bottle imagery, and founder photos available on request. Email <a href="mailto:press@rescuedogwines.com" className="underline">press@rescuedogwines.com</a> with your outlet and deadline and we'll send a Dropbox link.
            </p>
            <a
              href="mailto:press@rescuedogwines.com?subject=Press%20asset%20request"
              className="inline-flex items-center gap-2 border border-foreground px-6 py-3 text-xs uppercase tracking-[0.25em] font-bold hover:bg-foreground hover:text-background transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Request press kit
            </a>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-foreground text-background text-center">
          <div className="container mx-auto px-4 max-w-2xl">
            <h2 className="text-3xl font-bold mb-4">Writing about wine that gives back?</h2>
            <p className="text-background/70 mb-8">
              We're the only premium U.S. winery donating 50% of profits to dog rescue. Read the case here.
            </p>
            <Link to="/wine-that-gives-back" className="inline-flex items-center gap-2 bg-background text-foreground px-6 py-3 text-xs uppercase tracking-[0.25em] font-bold hover:bg-background/90">
              Read the story
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}