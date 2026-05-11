import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Loader2, Wine } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const STARTER_PROMPTS = [
  "What pairs with grilled steak?",
  "Pick a wine for a dinner party of 6",
  "Best gift bottle under $30",
  "I like big, bold reds — recommend?",
];

export function SommelierChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! I'm your Rescue Dog Wines sommelier. Ask me about pairings, recommendations, or what to gift. 🐶🍷" },
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-sommelier", {
        body: { messages: next.filter(m => m.role !== "assistant" || messages.indexOf(m) > 0) },
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
        className={`fixed z-40 right-4 bottom-4 md:right-6 md:bottom-6 bg-primary text-primary-foreground shadow-lg flex items-center gap-2 px-4 py-3 hover:bg-primary/90 transition-all ${open ? "opacity-0 pointer-events-none" : ""}`}
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
                <p className="text-sm font-bold">RDW Sommelier</p>
                <p className="text-[10px] opacity-80">AI-powered · Always learning</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-secondary/30">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-background border border-border"}`}>
                  {m.content}
                </div>
              </div>
            ))}
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

          {/* Input */}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 border-t border-border flex gap-2">
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
