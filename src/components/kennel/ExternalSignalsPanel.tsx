import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Radio, Loader2, ExternalLink, Check, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Signal = {
  id: string;
  title: string;
  summary: string | null;
  insight_type: string;
  signal_type: string | null;
  source: string;
  source_url: string | null;
  severity: string;
  urgency: string | null;
  scope_key: string;
  data: any;
  created_at: string;
  expires_at: string | null;
  actioned: boolean;
};

const SEVERITY_BORDER: Record<string, string> = {
  critical: "border-destructive",
  high: "border-destructive",
  warn: "border-destructive",
  warning: "border-destructive",
  medium: "border-primary",
  info: "border-foreground",
  low: "border-muted-foreground",
};

export function ExternalSignalsPanel() {
  const qc = useQueryClient();
  const [showActioned, setShowActioned] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [acting, setActing] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["kennel-external-signals", showActioned],
    queryFn: async () => {
      const q = supabase
        .from("kennel_insights")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      const { data, error } = showActioned
        ? await q
        : await q.eq("actioned", false);
      if (error) throw error;
      return (data ?? []) as Signal[];
    },
  });

  const markActioned = async (id: string) => {
    setActing(id);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("kennel_insights")
        .update({ actioned: true, actioned_at: new Date().toISOString(), actioned_by: u.user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
      toast.success("Signal marked actioned");
      qc.invalidateQueries({ queryKey: ["kennel-external-signals"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update");
    } finally {
      setActing(null);
    }
  };

  const signals = data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xs uppercase tracking-brand font-bold text-muted-foreground flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-primary" /> External signals
          {signals.length > 0 && (
            <span className="text-foreground">· {signals.filter(s => !s.actioned).length} open</span>
          )}
        </h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowActioned((v) => !v)}
            style={{ borderRadius: 0 }}
            className="uppercase tracking-brand text-xs"
          >
            {showActioned ? "Hide actioned" : "Show actioned"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            style={{ borderRadius: 0 }}
            className="uppercase tracking-brand text-xs"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading signals…
        </div>
      ) : signals.length === 0 ? (
        <div className="border-2 border-dashed border-muted-foreground/40 p-6 text-center text-xs text-muted-foreground" style={{ borderRadius: 0 }}>
          No {showActioned ? "" : "open "}external signals. Lindy and other sources will post here as they fire.
        </div>
      ) : (
        <div className="space-y-2">
          {signals.map((s) => {
            const border = SEVERITY_BORDER[s.severity?.toLowerCase()] ?? "border-foreground";
            const open = expanded[s.id];
            return (
              <div
                key={s.id}
                className={`border-2 ${border} bg-background p-3 ${s.actioned ? "opacity-60" : ""}`}
                style={{ borderRadius: 0 }}
              >
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase tracking-brand font-bold text-muted-foreground font-mono">
                        {s.source}
                      </span>
                      <span className="text-[10px] uppercase tracking-brand text-muted-foreground">·</span>
                      <span className="text-[10px] uppercase tracking-brand text-muted-foreground font-mono">
                        {s.insight_type}
                      </span>
                      {s.urgency && (
                        <>
                          <span className="text-[10px] uppercase tracking-brand text-muted-foreground">·</span>
                          <span className="text-[10px] uppercase tracking-brand text-foreground font-bold">{s.urgency}</span>
                        </>
                      )}
                      <span className="text-[10px] uppercase tracking-brand text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-foreground mt-1">{s.title}</div>
                    {s.summary && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.summary}</p>
                    )}
                    {open && (
                      <pre className="mt-2 text-[10px] bg-muted/40 border border-border p-2 overflow-auto max-h-64 font-mono whitespace-pre-wrap break-all">
{JSON.stringify(s.data, null, 2)}
                      </pre>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))}
                        style={{ borderRadius: 0 }}
                        className="uppercase tracking-brand text-[10px] h-7 px-2"
                      >
                        {open ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                        {open ? "Hide payload" : "View payload"}
                      </Button>
                      {s.source_url && (
                        <a
                          href={s.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-brand font-bold text-primary hover:underline"
                        >
                          Source <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {!s.actioned && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markActioned(s.id)}
                          disabled={acting === s.id}
                          style={{ borderRadius: 0 }}
                          className="uppercase tracking-brand text-[10px] h-7 px-2 ml-auto"
                        >
                          {acting === s.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3 mr-1" />
                          )}
                          Mark actioned
                        </Button>
                      )}
                      {s.actioned && (
                        <span className="text-[10px] uppercase tracking-brand text-muted-foreground ml-auto">
                          Actioned
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}