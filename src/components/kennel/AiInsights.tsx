import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Lightbulb, AlertTriangle, TrendingUp, Loader2, RefreshCw } from "lucide-react";

type Nudge = {
  title: string;
  severity?: "info" | "warn" | "opportunity";
  body: string;
  metric?: string;
};

interface Props {
  snapshot: Record<string, unknown>;
  rangeLabel: string;
}

export function AiInsights({ snapshot, rangeLabel }: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [nudges, setNudges] = useState<Nudge[] | null>(null);
  const [loadingNudges, setLoadingNudges] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  // Auto-load nudges when snapshot changes (period switch)
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
        <Button
          size="sm"
          variant="outline"
          onClick={fetchNudges}
          disabled={loadingNudges}
          style={{ borderRadius: 0 }}
          className="uppercase tracking-brand text-xs"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${loadingNudges ? "animate-spin" : ""}`} />
          Regenerate
        </Button>
      </div>

      {/* Ask AI box */}
      <div className="border-2 border-foreground bg-background p-4 space-y-2" style={{ borderRadius: 0 }}>
        <label className="text-xs uppercase tracking-brand font-bold text-foreground">
          Ask the Command Center
        </label>
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Which channel has the worst ROAS this period? Where should we cut spend?"
          rows={2}
          className="text-sm"
          style={{ borderRadius: 0 }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
          }}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-brand text-muted-foreground">
            Grounded in your live snapshot · ⌘/Ctrl + Enter to send
          </span>
          <Button
            size="sm"
            onClick={ask}
            disabled={asking || !question.trim()}
            style={{ borderRadius: 0 }}
            className="uppercase tracking-brand text-xs"
          >
            {asking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Ask AI
          </Button>
        </div>
        {answer && (
          <div className="mt-2 border-t-2 border-border pt-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {answer}
          </div>
        )}
      </div>

      {/* Nudges */}
      {err && (
        <div className="border-2 border-destructive bg-destructive/10 p-3 text-xs text-destructive" style={{ borderRadius: 0 }}>
          {err}
        </div>
      )}
      {loadingNudges && !nudges && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Generating actionable nudges…
        </div>
      )}
      {nudges && nudges.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {nudges.map((n, i) => (
            <div
              key={i}
              className={`border-2 ${sevBorder(n.severity)} bg-background p-3 flex gap-2`}
              style={{ borderRadius: 0 }}
            >
              {sevIcon(n.severity)}
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-brand font-bold text-foreground">{n.title}</div>
                {n.metric && (
                  <div className="text-[10px] uppercase tracking-brand text-muted-foreground mt-0.5 font-mono">
                    {n.metric}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{n.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}