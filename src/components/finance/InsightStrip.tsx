import { AlertTriangle, Eye, Info, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCfoInsights, useUpdateInsightStatus, type CfoInsight } from "@/hooks/finance/useCfoInsights";
import { cn } from "@/lib/utils";

const SEV_META: Record<CfoInsight["severity"], { icon: typeof AlertTriangle; cls: string; label: string }> = {
  critical: { icon: AlertTriangle, cls: "border-l-destructive bg-destructive/5 text-destructive", label: "Critical" },
  watch:    { icon: Eye,           cls: "border-l-amber-500 bg-amber-500/5 text-amber-700 dark:text-amber-400", label: "Watch" },
  fyi:      { icon: Info,          cls: "border-l-foreground/30 bg-muted/30 text-foreground/80", label: "FYI" },
};

/** Inline strip rendered at the bottom of every Finance tile. */
export function TileInsightStrip({ tileKey, onOpen }: { tileKey: string; onOpen?: () => void }) {
  const { data: insights } = useCfoInsights("open");
  const tileInsights = (insights ?? []).filter((i) => i.tile_key === tileKey);
  if (!tileInsights.length) return null;
  const top = tileInsights[0];
  const Sev = SEV_META[top.severity];
  const Icon = Sev.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "mt-3 -mx-4 -mb-4 px-3 py-2 border-t border-border border-l-2 text-left w-[calc(100%+2rem)] flex items-start gap-2 hover:bg-muted/40 transition-colors",
        Sev.cls,
      )}
      title="View insight"
    >
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold leading-tight truncate">{top.headline}</div>
        {top.recommended_action && (
          <div className="text-[10px] uppercase tracking-brand opacity-80 mt-0.5 truncate">→ {top.recommended_action}</div>
        )}
      </div>
      {tileInsights.length > 1 && (
        <span className="text-[10px] font-bold tabular-nums">+{tileInsights.length - 1}</span>
      )}
    </button>
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