import { cn } from "@/lib/utils";
import { Sparkles, ListOrdered } from "lucide-react";

interface Props {
  mode: "curated" | "smart";
  onChange: (m: "curated" | "smart") => void;
  className?: string;
}

/**
 * Two-pill sort toggle. Curated stays the default everywhere so the
 * hand-tuned wine order is never disturbed unless the visitor opts in.
 */
export function SmartSortToggle({ mode, onChange, className }: Props) {
  return (
    <div
      className={cn("inline-flex border border-border bg-background", className)}
      role="group"
      aria-label="Sort mode"
    >
      <button
        type="button"
        onClick={() => onChange("curated")}
        className={cn(
          "px-4 py-2 text-[11px] uppercase tracking-brand font-bold flex items-center gap-1.5 transition-colors",
          mode === "curated" ? "bg-foreground text-background" : "text-foreground hover:bg-muted",
        )}
        aria-pressed={mode === "curated"}
      >
        <ListOrdered className="h-3.5 w-3.5" />
        Curated
      </button>
      <button
        type="button"
        onClick={() => onChange("smart")}
        className={cn(
          "px-4 py-2 text-[11px] uppercase tracking-brand font-bold flex items-center gap-1.5 transition-colors border-l border-border",
          mode === "smart" ? "bg-foreground text-background" : "text-foreground hover:bg-muted",
        )}
        aria-pressed={mode === "smart"}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Smart
      </button>
    </div>
  );
}