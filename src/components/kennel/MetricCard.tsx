import { ArrowDown, ArrowUp, Minus } from "lucide-react";

interface Props {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
}

export function MetricCard({ label, value, delta, hint }: Props) {
  const trend = delta == null ? "flat" : delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat";
  const Icon = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : Minus;
  const color = trend === "up" ? "text-green-700" : trend === "down" ? "text-red-700" : "text-muted-foreground";

  return (
    <div className="border border-border bg-card p-5" style={{ borderRadius: 0 }}>
      <div className="text-xs uppercase tracking-brand text-muted-foreground font-semibold">{label}</div>
      <div className="text-3xl font-bold text-foreground mt-2 tabular-nums">{value}</div>
      <div className="flex items-center justify-between mt-2">
        {delta != null ? (
          <div className={`flex items-center gap-1 text-xs font-medium ${color}`}>
            <Icon className="h-3 w-3" />
            {Math.abs(delta).toFixed(1)}% vs prior
          </div>
        ) : <span />}
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}