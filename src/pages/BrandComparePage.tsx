import { Navigate, useParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { ArrowRight, Check, X, PawPrint } from "lucide-react";
import { faqPageSchema } from "@/lib/jsonLd";
import { getBrandComparison, BRAND_COMPARISONS } from "@/data/brandComparisons";

export default function BrandComparePage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const data = getBrandComparison(slug.toLowerCase());

  if (!data) return <Navigate to="/compare" replace />;

  return (
    <div className="min-h-screen flex flex-col">
      <Seo
        title={data.seoTitle}
        description={data.seoDescription}
        path={`/compare/${data.slug}`}
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Compare", path: "/compare" },
          { name: `vs ${data.competitor}`, path: `/compare/${data.slug}` },
        ]}
        jsonLd={faqPageSchema(data.faqs)}
      />
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-foreground text-background py-24 md:py-32">
          <div className="container mx-auto px-4 max-w-4xl">
            <p className="text-[11px] tracking-[0.3em] uppercase text-background/60 mb-6">
              {data.hero.eyebrow}
            </p>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              {data.hero.headline}
            </h1>
            <p className="text-lg md:text-xl text-background/80 max-w-3xl leading-relaxed">
              {data.hero.sub}
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                to="/wines"
                className="inline-flex items-center gap-2 bg-background text-foreground px-6 py-3 text-xs uppercase tracking-[0.25em] font-bold hover:bg-background/90"
              >
                Shop the wines <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/wine-that-gives-back"
                className="inline-flex items-center gap-2 border border-background/40 px-6 py-3 text-xs uppercase tracking-[0.25em] font-bold hover:bg-background/10"
              >
                Why we give back
              </Link>
            </div>
          </div>
        </section>

        {/* Side-by-side spec table */}
        <section className="py-20 border-b border-border">
          <div className="container mx-auto px-4 max-w-5xl">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Rescue Dog Wines vs {data.competitor}
            </h2>
            <p className="text-muted-foreground text-lg mb-10">
              {data.competitorTagline}. Here's how the two stack up.
            </p>
            <div className="overflow-x-auto border border-border">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-foreground bg-muted/30">
                    <th className="text-left py-4 px-4 text-xs uppercase tracking-[0.2em] w-1/3">
                      Attribute
                    </th>
                    <th className="text-left py-4 px-4 text-xs uppercase tracking-[0.2em] w-1/3 bg-primary/5">
                      Rescue Dog Wines
                    </th>
                    <th className="text-left py-4 px-4 text-xs uppercase tracking-[0.2em] w-1/3">
                      {data.competitor}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.specs.map((row) => (
                    <tr key={row.attribute} className="border-b border-border last:border-b-0">
                      <td className="py-4 px-4 font-bold">{row.attribute}</td>
                      <td className="py-4 px-4 bg-primary/5">
                        <div className="flex items-start gap-2">
                          {row.advantageRdw && (
                            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          )}
                          <span>{row.rdw}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-muted-foreground">
                        <div className="flex items-start gap-2">
                          {row.advantageRdw && (
                            <X className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                          )}
                          <span>{row.them}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.disclosure && (
              <p className="text-xs text-muted-foreground mt-4">{data.disclosure}</p>
            )}
            {data.sources && data.sources.length > 0 && (
              <div className="mt-8 border-t border-border pt-6">
                <p className="text-[11px] tracking-[0.3em] uppercase text-muted-foreground mb-3">
                  Sources
                </p>
                <ol className="space-y-2 text-xs text-muted-foreground list-decimal pl-5">
                  {data.sources.map((s) => (
                    <li key={s.url}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="underline hover:text-foreground"
                      >
                        {s.label}
                      </a>
                      {s.publisher && (
                        <span className="text-muted-foreground/70"> — {s.publisher}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </section>

        {/* Reasons to switch */}
        <section className="py-20 border-b border-border">
          <div className="container mx-auto px-4 max-w-5xl">
            <h2 className="text-3xl md:text-4xl font-bold mb-12">
              Three reasons to make the switch.
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              {data.reasons.map((r, i) => (
                <div key={r.title} className="border-l-2 border-primary pl-6">
                  <div className="text-xs tracking-[0.3em] text-muted-foreground mb-3">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <h3 className="text-lg font-bold mb-3">{r.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{r.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 border-b border-border">
          <div className="container mx-auto px-4 max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-bold mb-10">
              {data.competitor}, answered.
            </h2>
            <div className="space-y-8">
              {data.faqs.map((f) => (
                <div key={f.question} className="border-b border-border pb-6">
                  <h3 className="text-lg font-bold mb-3">{f.question}</h3>
                  <p className="text-muted-foreground leading-relaxed">{f.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Related comparisons */}
        <section className="py-16 border-b border-border bg-muted/20">
          <div className="container mx-auto px-4 max-w-5xl">
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-6">
              Compare more brands
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              {BRAND_COMPARISONS.filter((b) => b.slug !== data.slug).map((b) => (
                <Link
                  key={b.slug}
                  to={`/compare/${b.slug}`}
                  className="border border-border p-6 hover:border-primary transition-colors group"
                >
                  <div className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-2">
                    vs {b.competitor}
                  </div>
                  <div className="font-bold flex items-center gap-2">
                    {b.seoTitle.split("—")[0].trim()}
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
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
            <Link
              to="/wines"
              className="inline-flex items-center gap-2 bg-background text-foreground px-8 py-4 text-xs uppercase tracking-[0.25em] font-bold hover:bg-background/90"
            >
              Shop the wines <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}