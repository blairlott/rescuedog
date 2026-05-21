import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Loader2, Wine } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";

type Msg = { role: "user" | "assistant"; content: string };

// Parse an "Ingredients" list out of an assistant cocktail reply.
// Returns the ingredient lines (with measurements) or null if none found.
function parseIngredients(text: string): string[] | null {
  if (!text) return null;
  // Find "Ingredients" header (case-insensitive), optionally followed by ":" and newline
  const match = text.match(/ingredients\s*:?\s*\n([\s\S]+?)(?:\n\s*\n|\n\s*(?:steps?|method|instructions|directions|garnish|why this wine)\b)/i);
  if (!match) return null;
  const block = match[1];
  const items = block
    .split("\n")
    .map(l => l.replace(/^\s*[-•*\d.]+\s*/, "").trim())
    .filter(l => l.length > 0 && l.length < 140);
  return items.length >= 2 ? items : null;
}

// Split "1.5 oz — Chardonnay" into { amount: "1.5 oz", name: "Chardonnay" }.
// Falls back to putting the whole line in `name` if no measurement is detected.
const UNIT_RE = /\b(oz|ml|dash(?:es)?|tsp|tbsp|cup|bottle|splash|sprig|slices?|wedges?|leaf|leaves|cubes?|pieces?)\b/i;
function splitMeasurement(line: string): { amount: string; name: string } {
  // Strip leading bold/italic markdown
  const clean = line.replace(/\*\*/g, "").replace(/__/g, "").trim();
  // Preferred format: "<amount> <unit> — <name>"
  const em = clean.split(/\s+—\s+|\s+-\s+/);
  if (em.length >= 2 && UNIT_RE.test(em[0])) {
    return { amount: em[0].trim(), name: em.slice(1).join(" — ").trim() };
  }
  // Fallback: regex match leading "<num><opt frac> <unit>"
  const m = clean.match(/^([\d.\/]+\s*(?:oz|ml|dash(?:es)?|tsp|tbsp|cup|bottle|splash|sprig|slices?|wedges?|leaf|leaves|cubes?|pieces?))\b[\s,:\-—]*(.+)$/i);
  if (m) return { amount: m[1].trim(), name: m[2].trim() };
  return { amount: "", name: clean };
}

function IngredientsChecklist({ items }: { items: string[] }) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  return (
    <div className="mt-2 border border-border bg-secondary/40 p-2">
      <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
        Ingredients checklist
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => {
          const { amount, name } = splitMeasurement(item);
          const done = !!checked[i];
          return (
            <li key={i}>
              <label className="flex items-start gap-2 cursor-pointer text-xs leading-snug">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(e) => setChecked(c => ({ ...c, [i]: e.target.checked }))}
                  className="mt-0.5 h-3.5 w-3.5 accent-primary shrink-0"
                />
                <span className={`flex-1 ${done ? "line-through text-muted-foreground" : ""}`}>
                  {amount && (
                    <span className="inline-block min-w-[3.5rem] font-mono font-bold text-foreground mr-1.5">
                      {amount}
                    </span>
                  )}
                  <span>{name}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const STARTER_PROMPTS = [
  "What pairs with grilled steak?",
  "Pick a wine for a dinner party of 6",
  "Best gift bottle under $30",
  "I like big, bold reds — recommend?",
  "Invent a wine cocktail with one of your wines 🍹",
  "Make me a wine spritz ✨",
  "Invent a sangria with one of your reds 🍇",
  "Shake me a wine cocktail 🍸",
];

export function SommelierChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! I'm your Rescue Dog Wines sommelier. Ask me about pairings, recommendations, or what to gift. 🐶🍷" },
  ]);
  const [loading, setLoading] = useState(false);
  // Guest preference chips — sent as soft context with each user message
  const [sweetness, setSweetness] = useState<"dry" | "off-dry" | "sweet" | null>(null);
  const [strength, setStrength] = useState<"light" | "medium" | "full" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: products } = useProducts(50);

  // Build a compact catalog snapshot the model can reason over without bloating tokens.
  const catalog = (products || [])
    .map((edge: any) => {
      const n = edge?.node ?? edge;
      if (!n?.title) return null;
      const price = n?.priceRange?.minVariantPrice?.amount;
      const tags = Array.isArray(n?.tags) ? n.tags.slice(0, 6).join(", ") : "";
      const desc = (n?.description || "").replace(/\s+/g, " ").slice(0, 140);
      return `• ${n.title}${price ? ` — $${Number(price).toFixed(2)}` : ""}${tags ? ` [${tags}]` : ""}${desc ? ` — ${desc}` : ""}`;
    })
    .filter(Boolean)
    .join("\n");

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  // Allow other components (PDP, homepage) to open the sommelier with a pre-filled prompt
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string }>).detail || {};
      setOpen(true);
      if (detail.prompt) {
        // Defer to allow open animation
        setTimeout(() => send(detail.prompt!), 50);
      }
    };
    window.addEventListener("rdw:sommelier-open", handler as EventListener);
    return () => window.removeEventListener("rdw:sommelier-open", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    const prefBits: string[] = [];
    if (sweetness) prefBits.push(`sweetness: ${sweetness}`);
    if (strength) prefBits.push(`body/alcohol: ${strength}`);
    const decorated = prefBits.length
      ? `${content}\n\n(My preferences — ${prefBits.join("; ")}.)`
      : content;
    const next = [...messages, { role: "user" as const, content: decorated }];
    setMessages(next);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-sommelier", {
        body: {
          messages: next.filter(m => m.role !== "assistant" || messages.indexOf(m) > 0),
          catalog,
        },
      });
      if (error) throw error;
      const reply = (data as any)?.reply || "Sorry, I didn't catch that — could you rephrase?";
      setMessages(m => [...m, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setMessages(m => [...m, { role: "assistant", content: "I'm having trouble right now. Try again in a moment, or contact our team." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask the sommelier"
        className={`fixed z-40 right-4 bottom-24 md:right-6 md:bottom-6 bg-primary text-primary-foreground shadow-lg flex items-center gap-2 px-4 py-3 hover:bg-primary/90 transition-all ${open ? "opacity-0 pointer-events-none" : ""}`}


      >
        <Wine className="h-4 w-4" />
        <span className="text-sm font-bold">Ask the Sommelier</span>
      </button>

      {open && (
        <div className="fixed z-50 inset-0 md:inset-auto md:right-6 md:bottom-6 md:w-[380px] md:h-[560px] bg-background border border-border shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary text-primary-foreground">
            <div className="flex items-center gap-2">
              <Wine className="h-4 w-4" />
              <div>
                <p className="text-sm font-bold">Pip · RDW Sommelier</p>
                <p className="text-[10px] opacity-80">Lodi Rules certified · Rescue-funding pours</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-secondary/30">
            {messages.map((m, i) => {
              const ingredients = m.role === "assistant" ? parseIngredients(m.content) : null;
              return (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-background border border-border"}`}>
                    {m.content}
                    {ingredients && <IngredientsChecklist items={ingredients} />}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-background border border-border px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            {messages.length <= 1 && !loading && (
              <div className="flex flex-wrap gap-2 pt-2">
                {STARTER_PROMPTS.map(p => (
                  <button key={p} onClick={() => send(p)} className="text-xs px-2 py-1 border border-border bg-background hover:bg-secondary text-foreground">
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preference chips */}
          <div className="px-3 pt-2 pb-1 border-t border-border space-y-1.5 bg-background">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mr-1">Sweetness</span>
              {(["dry", "off-dry", "sweet"] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSweetness(s => s === opt ? null : opt)}
                  className={`text-[11px] px-2 py-0.5 border transition-colors ${sweetness === opt ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:bg-secondary"}`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mr-1">Strength</span>
              {(["light", "medium", "full"] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setStrength(s => s === opt ? null : opt)}
                  className={`text-[11px] px-2 py-0.5 border transition-colors ${strength === opt ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:bg-secondary"}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 pt-2 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a pairing, gift, or wine…"
              maxLength={500}
              disabled={loading}
              className="text-sm"
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="text-[10px] text-center text-muted-foreground pb-2">AI replies may be inaccurate. Please drink responsibly.</p>
        </div>
      )}
    </>
  );
}
