import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Lightbulb, AlertTriangle, TrendingUp, Loader2, RefreshCw, Radio, Send } from "lucide-react";
import { toast } from "sonner";

type Nudge = {
  title: string;
  severity?: "info" | "warn" | "opportunity";
  body: string;
  metric?: string;
};

type SoftSignal = {
  id: string;
  created_at: string;
  signal_text: string;
  category: string;
  channel?: string | null;
  region?: string | null;
  sku?: string | null;
  effective_date?: string | null;
  confidence?: string | null;
  extracted?: { summary?: string | null } | null;
};

interface Props {
  snapshot: Record<string, unknown>;
  rangeLabel: string;
}

export function AiInsights({ snapshot, rangeLabel }: Props) {
  const qc = useQueryClient();
  const [mode, setMode] = useState("ask");
  const [question, setQuestion] = useState("");
  const [signal, setSignal] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [telling, setTelling] = useState(false);
  const [nudges, setNudges] = useState<Nudge[] | null>(null);
  const [loadingNudges, setLoadingNudges] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: signals = [] } = useQuery({
    queryKey: ["kennel-soft-signals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kennel_soft_signals" as any)
        .select("id, created_at, signal_text, category, channel, region, sku, effective_date, confidence, extracted")
        .eq("status", "active")
        .order("effective_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as SoftSignal[];
    },
  });

  const fetchNudges = async () => {
    setLoadingNudges(true);
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke("kennel-ai-insights", {
        body: { mode: "nudges", snapshot, rangeLabel },
      });
      if (error) throw error;
      setNudges((data?.nudges as Nudge[]) ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to generate nudges");
    } finally {
      setLoadingNudges(false);
    }
  };

  useEffect(() => {
    fetchNudges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeLabel]);

  const ask = async () => {
    if (!question.trim()) return;
    setAsking(true);
    setAnswer(null);
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke("kennel-ai-insights", {
        body: { mode: "query", question, snapshot, rangeLabel },
      });
      if (error) throw error;
      setAnswer(data?.answer ?? "");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to query AI");
    } finally {
      setAsking(false);
    }
  };

  const tell = async () => {
    if (!signal.trim()) return;
    setTelling(true);
    setErr(null);
    try {
      const { error } = await supabase.functions.invoke("kennel-ai-insights", {
        body: { mode: "ingest-signal", signal },
      });
      if (error) throw error;
      setSignal("");
      toast.success("Soft signal saved");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["kennel-soft-signals"] }),
        qc.invalidateQueries({ queryKey: ["tile-ai-guidance"] }),
      ]);
      fetchNudges();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save signal");
    } finally {
      setTelling(false);
    }
  };

  const sevIcon = (s?: string) =>
    s === "warn" ? <AlertTriangle className="h-4 w-4 text-destructive shrink-0" /> :
    s === "opportunity" ? <TrendingUp className="h-4 w-4 text-primary shrink-0" /> :
    <Lightbulb className="h-4 w-4 text-foreground shrink-0" />;

  const sevBorder = (s?: string) =>
    s === "warn" ? "border-destructive" :
    s === "opportunity" ? "border-primary" :
    "border-foreground";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xs uppercase tracking-brand font-bold text-muted-foreground flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> AI insights
        </h2>
        <Button size="sm" variant="outline" onClick={fetchNudges} disabled={loadingNudges} style={{ borderRadius: 0 }} className="uppercase tracking-brand text-xs">
          <RefreshCw className={`h-3 w-3 mr-1 ${loadingNudges ? "animate-spin" : ""}`} /> Regenerate
        </Button>
      </div>

      <div className="border-2 border-foreground bg-background p-4 space-y-3" style={{ borderRadius: 0 }}>
        <Tabs value={mode} onValueChange={setMode}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="text-xs uppercase tracking-brand font-bold text-foreground">Command Center AI</label>
            <TabsList className="h-8 p-0 border-2 border-foreground bg-background" style={{ borderRadius: 0 }}>
              <TabsTrigger value="ask" className="h-7 rounded-none uppercase tracking-brand text-[10px] data-[state=active]:bg-foreground data-[state=active]:text-background">Ask</TabsTrigger>
              <TabsTrigger value="tell" className="h-7 rounded-none uppercase tracking-brand text-[10px] data-[state=active]:bg-foreground data-[state=active]:text-background">Tell</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="ask" className="space-y-2 mt-3">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Which channel has the worst ROAS this period? Where should we cut spend?"
              rows={2}
              className="text-sm"
              style={{ borderRadius: 0 }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(); }}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] uppercase tracking-brand text-muted-foreground">Grounded in live snapshot + soft signals · ⌘/Ctrl + Enter</span>
              <Button size="sm" onClick={ask} disabled={asking || !question.trim()} style={{ borderRadius: 0 }} className="uppercase tracking-brand text-xs">
                {asking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />} Ask AI
              </Button>
            </div>
            {answer && <div className="mt-2 border-t-2 border-border pt-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">{answer}</div>}
          </TabsContent>
          <TabsContent value="tell" className="space-y-2 mt-3">
            <Textarea
              value={signal}
              onChange={(e) => setSignal(e.target.value)}
              placeholder="e.g. Kroger chain placement starts in CO on June 10 for Cabernet; support with Denver geo spend and ambassador visits."
              rows={3}
              className="text-sm"
              style={{ borderRadius: 0 }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) tell(); }}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] uppercase tracking-brand text-muted-foreground">Feeds future nudges and forecast actions</span>
              <Button size="sm" onClick={tell} disabled={telling || !signal.trim()} style={{ borderRadius: 0 }} className="uppercase tracking-brand text-xs">
                {telling ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />} Save intel
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {signals.length > 0 && (
        <div className="border-2 border-border bg-muted/30 p-3" style={{ borderRadius: 0 }}>
          <h3 className="text-[10px] uppercase tracking-brand font-bold text-muted-foreground flex items-center gap-2 mb-2">
            <Radio className="h-3.5 w-3.5 text-primary" /> Recent soft intelligence
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {signals.map((s) => (
              <div key={s.id} className="border border-border bg-background p-2" style={{ borderRadius: 0 }}>
                <div className="flex items-center gap-1 flex-wrap mb-1">
                  <Badge variant="outline" className="text-[9px] uppercase tracking-brand" style={{ borderRadius: 0 }}>{s.category.replace(/_/g, " ")}</Badge>
                  {s.channel && <Badge variant="secondary" className="text-[9px] uppercase tracking-brand" style={{ borderRadius: 0 }}>{s.channel}</Badge>}
                  {s.region && <span className="text-[10px] uppercase tracking-brand text-muted-foreground">{s.region}</span>}
                  {s.effective_date && <span className="text-[10px] uppercase tracking-brand text-muted-foreground">{s.effective_date}</span>}
                </div>
                <p className="text-xs text-foreground leading-snug">{s.extracted?.summary ?? s.signal_text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <div className="border-2 border-destructive bg-destructive/10 p-3 text-xs text-destructive" style={{ borderRadius: 0 }}>{err}</div>}
      {loadingNudges && !nudges && <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Generating actionable nudges…</div>}
      {nudges && nudges.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {nudges.map((n, i) => (
            <div key={i} className={`border-2 ${sevBorder(n.severity)} bg-background p-3 flex gap-2`} style={{ borderRadius: 0 }}>
              {sevIcon(n.severity)}
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-brand font-bold text-foreground">{n.title}</div>
                {n.metric && <div className="text-[10px] uppercase tracking-brand text-muted-foreground mt-0.5 font-mono">{n.metric}</div>}
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{n.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}