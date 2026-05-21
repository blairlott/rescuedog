import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { ArrowRight } from "lucide-react";
import { BRAND_COMPARISONS } from "@/data/brandComparisons";

export default function CompareHubPage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <Seo
        title="Compare Rescue Dog Wines — Meiomi, Justin, Barefoot Alternatives"
        description="Side-by-side comparisons of Rescue Dog Wines vs premium California brands. Same shelf price, small-batch craft, 50% of profits to 501(c)(3) dog rescue."
        path="/compare"
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Compare", path: "/compare" },
        ]}
      />
      <Header />
      <main className="flex-1">
        <section className="bg-foreground text-background py-24 md:py-28">
          <div className="container mx-auto px-4 max-w-4xl">
            <p className="text-[11px] tracking-[0.3em] uppercase text-background/60 mb-6">
              Compare brands
            </p>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Picking your next bottle? Start here.
            </h1>
            <p className="text-lg md:text-xl text-background/80 max-w-2xl leading-relaxed">
              Honest, side-by-side comparisons of Rescue Dog Wines against the premium California
              brands you already know — at the same price points, with 50% of profits routed to
              vetted 501(c)(3) dog-rescue partners.
            </p>
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="grid md:grid-cols-3 gap-6">
              {BRAND_COMPARISONS.map((b) => (
                <Link
                  key={b.slug}
                  to={`/compare/${b.slug}`}
                  className="border border-border p-8 hover:border-primary transition-colors group"
                >
                  <div className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">
                    vs {b.competitor}
                  </div>
                  <h2 className="text-2xl font-bold mb-3">
                    {b.hero.headline}
                  </h2>
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed line-clamp-3">
                    {b.competitorTagline} · {b.category}
                  </p>
                  <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] font-bold text-primary">
                    See the comparison
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}