import { AlertTriangle, Eye, Info, Check, X, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCfoInsights, useUpdateInsightStatus, type CfoInsight } from "@/hooks/finance/useCfoInsights";
import { cn } from "@/lib/utils";

const SEV_META: Record<CfoInsight["severity"], { icon: typeof AlertTriangle; cls: string; label: string; pulse?: boolean }> = {
  critical: {
    icon: Siren,
    cls: "border-l-4 border-l-destructive bg-destructive text-destructive-foreground",
    label: "Urgent",
    pulse: true,
  },
  watch: {
    icon: Eye,
    cls: "border-l-4 border-l-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-300",
    label: "Watch",
  },
  fyi: {
    icon: Info,
    cls: "border-l-4 border-l-foreground/30 bg-muted/40 text-foreground/80",
    label: "FYI",
  },
};

const SEV_RANK: Record<CfoInsight["severity"], number> = { critical: 0, watch: 1, fyi: 2 };

/** Stack of pushed insights rendered at the bottom of every Finance tile.
 *  Urgent (critical) insights appear in red, watch in amber, fyi muted.
 *  All open insights for the tile are shown — most severe first. */
export function TileInsightStrip({ tileKey, onOpen }: { tileKey: string; onOpen?: () => void }) {
  const { data: insights } = useCfoInsights("open");
  const update = useUpdateInsightStatus();
  const tileInsights = (insights ?? [])
    .filter((i) => i.tile_key === tileKey)
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  if (!tileInsights.length) {
    return (
      <div className="mt-0 -mx-4 -mb-4 border-t border-border bg-muted/30 px-3 py-2">
        <div className="text-[9px] uppercase tracking-brand font-bold text-foreground/60">Graz AI</div>
        <div className="text-xs text-muted-foreground italic mt-0.5">Coming Soon! Insights from Graz AI.</div>
      </div>
    );
  }

  return (
    <div className="mt-0 -mx-4 -mb-4 border-t border-border divide-y divide-border/60">
      <div className="px-3 pt-1.5 pb-0.5 text-[9px] uppercase tracking-brand font-bold text-foreground/60 bg-muted/30">Graz AI</div>
      {tileInsights.map((ins) => {
        const Sev = SEV_META[ins.severity];
        const Icon = Sev.icon;
        return (
          <div
            key={ins.id}
            className={cn(
              "px-3 py-2 flex items-start gap-2 group",
              Sev.cls,
            )}
          >
            <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", Sev.pulse && "animate-pulse")} />
            <button
              type="button"
              onClick={onOpen}
              className="min-w-0 flex-1 text-left"
              title="View insight details"
            >
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  "text-[9px] font-bold uppercase tracking-brand px-1 py-0.5",
                  ins.severity === "critical" ? "bg-destructive-foreground/20" : "bg-foreground/10"
                )}>
                  {Sev.label}
                </span>
                <span className="text-[11px] font-semibold leading-tight truncate">{ins.headline}</span>
              </div>
              {ins.recommended_action && (
                <div className="text-[10px] uppercase tracking-brand opacity-90 mt-0.5 truncate">
                  → {ins.recommended_action}
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); update.mutate({ id: ins.id, status: "dismissed" }); }}
              className="opacity-60 hover:opacity-100 shrink-0"
              title="Dismiss"
              aria-label="Dismiss insight"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Full insight card used in the side panel. */
export function InsightCard({ insight }: { insight: CfoInsight }) {
  const Sev = SEV_META[insight.severity];
  const Icon = Sev.icon;
  const update = useUpdateInsightStatus();
  return (
    <div className={cn("border border-border border-l-2 p-3 space-y-2", Sev.cls.replace(/text-[a-z\-/0-9]+/g, ""))}>
      <div className="flex items-start gap-2">
        <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[9px] uppercase tracking-brand font-bold opacity-70">
            {Sev.label} · {insight.tile_key}
          </div>
          <div className="text-xs font-semibold leading-snug mt-0.5">{insight.headline}</div>
        </div>
      </div>
      {insight.body && <div className="text-xs text-foreground/80 leading-snug pl-5">{insight.body}</div>}
      {insight.recommended_action && (
        <div className="text-[11px] font-medium pl-5 border-l border-border ml-1.5">
          → {insight.recommended_action}
        </div>
      )}
      <div className="flex items-center gap-1 pt-1">
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] gap-1"
          onClick={() => update.mutate({ id: insight.id, status: "done" })}
        >
          <Check className="h-3 w-3" /> Mark done
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] gap-1"
          onClick={() => update.mutate({ id: insight.id, status: "dismissed" })}
        >
          <X className="h-3 w-3" /> Dismiss
        </Button>
      </div>
    </div>
  );
}