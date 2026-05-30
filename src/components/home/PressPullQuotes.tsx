import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  outlet_slug: string;
  outlet_name: string;
  pull_quote: string;
  pull_quote_attribution: string | null;
};

export const PressPullQuotes = () => {
  const { data: rows = [] } = useQuery({
    queryKey: ["press-pull-quotes-homepage"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await (supabase as any)
        .from("press_mentions")
        .select("outlet_slug,outlet_name,pull_quote,pull_quote_attribution")
        .eq("status", "active")
        .eq("show_on_homepage", true)
        .eq("pull_quote_show_on_homepage", true)
        .not("pull_quote", "is", null)
        .order("display_order", { ascending: true })
        .limit(3);
      if (error) throw error;
      return (data || []).filter((r: Row) => r.pull_quote && r.pull_quote.trim().length > 0);
    },
  });

  if (!rows.length) return null;

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