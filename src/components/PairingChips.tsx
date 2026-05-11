import { Wine } from "lucide-react";

// Reads Shopify tags like "pairs:steak", "pairing:seafood", "food:cheese"
// and renders them as clickable chips that open the sommelier with a pairing prompt.
export function PairingChips({ tags, productTitle }: { tags: string[]; productTitle: string }) {
  const pairings = Array.from(new Set(
    (tags || [])
      .map(t => t.toLowerCase().trim())
      .filter(t => t.startsWith("pairs:") || t.startsWith("pairing:") || t.startsWith("food:"))
      .map(t => t.split(":")[1]?.replace(/-/g, " ").trim())
      .filter(Boolean) as string[]
  ));

  const ask = (food?: string) => {
    const prompt = food
      ? `What's the best way to enjoy ${productTitle} with ${food}? Suggest a serving tip too.`
      : `What food pairs best with ${productTitle}? Give me 3 quick ideas.`;
    window.dispatchEvent(new CustomEvent("rdw:sommelier-open", { detail: { prompt } }));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Wine className="h-3.5 w-3.5" /> Pairs With
      </div>
      <div className="flex flex-wrap gap-2">
        {pairings.length > 0 ? pairings.map(p => (
          <button
            key={p}
            onClick={() => ask(p)}
            className="text-xs px-2.5 py-1 border border-border bg-background hover:bg-secondary capitalize"
          >
            {p}
          </button>
        )) : (
          <span className="text-xs text-muted-foreground italic">Tag products with <code>pairs:steak</code> in Shopify to show pairings.</span>
        )}
        <button
          onClick={() => ask()}
          className="text-xs px-2.5 py-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
        >
          What pairs with this? →
        </button>
      </div>
    </div>
  );
}