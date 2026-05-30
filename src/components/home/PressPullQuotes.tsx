import { usePullQuoteRotation } from "@/hooks/usePullQuoteRotation";

export const PressPullQuotes = () => {
  const { quotes: rows, loading } = usePullQuoteRotation();

  if (loading || !rows.length) return null;

  return (
    <section className="py-12 md:py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {rows.map((row) => (
            <blockquote
              key={row.outlet_slug}
              className="border-l-2 border-primary/40 pl-5 py-2"
            >
              <p className="font-serif italic text-lg md:text-xl leading-snug text-foreground">
                {"\u201C"}{row.pull_quote}{"\u201D"}
              </p>
              <cite className="block mt-3 text-xs uppercase tracking-brand not-italic text-muted-foreground">
                — {row.pull_quote_attribution ?? row.outlet_name}
              </cite>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PressPullQuotes;