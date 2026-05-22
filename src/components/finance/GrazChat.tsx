import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, MessageSquare, Megaphone, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type Msg = { role: "user" | "assistant"; content: string };
type Mode = "ask" | "tell";

export function GrazChat({ days, userId }: { days: number; userId: string | null }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("ask");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: directives = [] } = useQuery({
    queryKey: ["graz-directives", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("graz_directives")
        .select("id,directive,active,created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");

    if (mode === "tell") {
      const { error } = await supabase.functions.invoke("cfo-graz-chat", {
        body: { mode: "tell", message: text },
      });
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Directive saved. Graz will apply it going forward.");
      qc.invalidateQueries({ queryKey: ["graz-directives", userId] });
      return;
    }

    setMessages(prev => [...prev, { role: "user", content: text }]);
    const { data, error } = await supabase.functions.invoke("cfo-graz-chat", {
      body: { mode: "ask", message: text, threadId, days },
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if ((data as any)?.error) { toast.error((data as any).error); return; }
    setThreadId((data as any).threadId);
    setMessages(prev => [...prev, { role: "assistant", content: (data as any).reply }]);
  };

  const toggleDirective = async (id: string, active: boolean) => {
    await supabase.from("graz_directives").update({ active: !active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["graz-directives", userId] });
  };
  const deleteDirective = async (id: string) => {
    await supabase.from("graz_directives").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["graz-directives", userId] });
  };
  const newThread = () => { setMessages([]); setThreadId(null); };

  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 bg-foreground text-background flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-none">Graz</div>
            <div className="text-[10px] uppercase tracking-brand text-muted-foreground mt-0.5">RDW AI agent · finance & ops</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant={mode === "ask" ? "default" : "outline"} className="h-7 text-xs gap-1" onClick={() => setMode("ask")}>
            <MessageSquare className="h-3 w-3" /> Ask
          </Button>
          <Button size="sm" variant={mode === "tell" ? "default" : "outline"} className="h-7 text-xs gap-1" onClick={() => setMode("tell")}>
            <Megaphone className="h-3 w-3" /> Tell
          </Button>
          {mode === "ask" && messages.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={newThread}>New thread</Button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_280px]">
        {/* Chat area */}
        <div className="flex flex-col min-h-[320px]">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[420px]">
            {mode === "ask" && messages.length === 0 && (
              <div className="text-sm text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">Ask Graz anything about the business.</p>
                <p>Examples: "Where did margin slip last month?" · "Rank channels by ROAS over 90 days" · "What 3 actions move EBITDA this quarter?"</p>
              </div>
            )}
            {mode === "tell" && (
              <div className="text-sm text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">Give Graz strategic direction.</p>
                <p>Examples: "Prioritize cash conversion over growth this quarter." · "Flag any campaign with ROAS &lt; 1.5 as a kill candidate." · "Treat shipping incidents above $50 as material."</p>
                <p className="mt-2">Directives persist and shape every future Ask response.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 text-sm ${m.role === "user" ? "bg-foreground text-background" : "bg-muted text-foreground"}`}>
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  )}
                </div>
              </div>
            ))}
            {busy && mode === "ask" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Graz is thinking...
              </div>
            )}
          </div>

          <div className="border-t border-border p-2 flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
              placeholder={mode === "ask" ? "Ask Graz... (⌘/Ctrl+Enter to send)" : "Tell Graz a standing directive..."}
              className="min-h-[44px] resize-none text-sm"
              rows={2}
            />
            <Button onClick={send} disabled={busy || !input.trim()} className="h-auto">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Directives sidebar */}
        <div className="border-t md:border-t-0 md:border-l border-border p-3 bg-muted/30">
          <div className="text-[10px] uppercase tracking-brand font-semibold text-muted-foreground mb-2">Standing directives</div>
          {!directives.length && (
            <div className="text-xs text-muted-foreground">None yet. Switch to <span className="font-semibold">Tell</span> to give Graz a directive.</div>
          )}
          <div className="space-y-1.5 max-h-[380px] overflow-y-auto">
            {directives.map((d: any) => (
              <div key={d.id} className={`group border border-border p-2 text-xs ${d.active ? "bg-background" : "bg-muted/50 opacity-60"}`}>
                <div className="flex items-start gap-1">
                  <button onClick={() => toggleDirective(d.id, d.active)} className="text-[9px] uppercase tracking-brand shrink-0 px-1 py-0.5 border border-border hover:bg-foreground hover:text-background">
                    {d.active ? "on" : "off"}
                  </button>
                  <div className="flex-1 leading-snug">{d.directive}</div>
                  <button onClick={() => deleteDirective(d.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}