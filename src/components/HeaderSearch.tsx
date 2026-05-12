import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProducts } from "@/hooks/useProducts";
import type { ShopifyProduct } from "@/lib/shopify";

interface Props {
  className?: string;
}

export function HeaderSearch({ className }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { data: products, isLoading } = useProducts(50);

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    if (!products) return [];
    const term = q.trim().toLowerCase();
    if (!term) return products.slice(0, 6);
    return products
      .filter((p: ShopifyProduct) => {
        const hay = `${p.node.title} ${p.node.description ?? ""} ${(p.node.tags ?? []).join(" ")}`.toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 8);
  }, [products, q]);

  const go = (handle: string) => {
    setOpen(false);
    setQ("");
    navigate(`/product/${handle}`);
  };

  return (
    <>
      <button
        className={className ?? "p-1 text-foreground hover:text-primary transition-colors"}
        onClick={() => setOpen(true)}
        aria-label="Search products"
      >
        <Search className="h-5 w-5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl p-0 gap-0 top-[15%] translate-y-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Search products</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search wines, merch, bundles…"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear" className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : results.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground text-center">
                No matches for "{q}". Try "red", "rosé", or "sampler".
              </div>
            ) : (
              <ul className="py-2">
                {results.map((p: ShopifyProduct) => {
                  const img = p.node.images.edges[0]?.node?.url;
                  const price = parseFloat(p.node.priceRange.minVariantPrice.amount).toFixed(2);
                  return (
                    <li key={p.node.id}>
                      <button
                        onClick={() => go(p.node.handle)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted transition-colors"
                      >
                        <div className="w-12 h-12 bg-muted flex-shrink-0 overflow-hidden">
                          {img && <img src={img} alt={p.node.title} className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{p.node.title}</div>
                          <div className="text-xs text-muted-foreground">${price}</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="px-4 py-2 border-t border-border text-[10px] uppercase tracking-brand text-muted-foreground flex justify-between">
            <span>Press ⌘K to search anytime</span>
            <span>Esc to close</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}