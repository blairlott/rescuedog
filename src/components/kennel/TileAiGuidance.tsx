import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";

type GuidanceAction = {
  title: string;
  lever?: string;
  expected_lift?: string;
  owner_hint?: string;
  confidence?: "low" | "medium" | "high";
  rationale?: string;
};

type Props = {
  tileId: string;
  rangeLabel: string;
  tileData: Record<string, unknown>;
};

export function TileAiGuidance({ tileId, rangeLabel, tileData }: Props) {
  const fingerprint = useMemo(() => JSON.stringify(tileData).slice(0, 2000), [tileData]);
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["tile-ai-guidance", tileId, rangeLabel, fingerprint],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("kennel-ai-insights", {
        body: { mode: "tile-guidance", tileId, tileData, rangeLabel },
      });
      if (error) throw error;
      return ((data?.actions as GuidanceAction[]) ?? []).slice(0, 4);
    },
    staleTime: 10 * 60_000,
  });

  const actions = data ?? [];

  return (
    <div className="mt-4 border-2 border-border bg-muted/30 p-3" style={{ borderRadius: 0 }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-[10px] uppercase tracking-brand font-bold text-foreground flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Recommended actions
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          style={{ borderRadius: 0 }}
          className="uppercase tracking-brand text-[10px] h-7 px-2"
        >
          {isFetching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Refresh
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-muted-foreground">AI guidance unavailable.</p>
      ) : isFetching && actions.length === 0 ? (
        <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Reading forecast and soft signals…</p>
      ) : actions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {actions.map((action, index) => (
            <div key={`${action.title}-${index}`} className="border border-border bg-background p-3" style={{ borderRadius: 0 }}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs uppercase tracking-brand font-bold text-foreground leading-tight">{action.title}</div>
                {action.lever && <Badge variant="outline" className="shrink-0 text-[9px] uppercase tracking-brand" style={{ borderRadius: 0 }}>{action.lever}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{action.rationale}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tracking-brand text-muted-foreground">
                {action.expected_lift && <span>Lift: <strong className="text-foreground">{action.expected_lift}</strong></span>}
                {action.owner_hint && <span>Owner: <strong className="text-foreground">{action.owner_hint}</strong></span>}
                {action.confidence && <span>Confidence: <strong className="text-foreground">{action.confidence}</strong></span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No grounded actions yet.</p>
      )}
    </div>
  );
}