import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

type Row = {
  day_of_week: number;
  modifier: number;
  sample_days: number | null;
  sample_avg_revenue_cents: number | null;
  source_window_days: number;
  notes: string | null;
  computed_at: string;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatPct(mod: number) {
  const pct = (mod - 1) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

export function BidModifiersPanel() {
  const [recomputing, setRecomputing] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["kennel-bid-modifiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kennel_bid_modifiers" as any)
        .select("*")
        .order("day_of_week");
      if (error) throw error;
      return ((data as any) ?? []) as Row[];
    },
    staleTime: 60 * 1000,
  });

  const recompute = async () => {
    setRecomputing(true);
    try {
      const { error } = await supabase.functions.invoke("kennel-recompute-bid-modifiers");
      if (error) throw error;
      toast.success("Bid modifiers recomputed");
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Recompute failed");
    } finally {
      setRecomputing(false);
    }
  };

  const todayDow = new Date().getDay();
  const computedAt = data?.[0]?.computed_at
    ? new Date(data[0].computed_at).toLocaleString()
    : "—";

  return (
    <div className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs uppercase tracking-brand font-bold text-foreground">
            Day-of-Week Bid Modifiers
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Consumer (non-club) baseline · {data?.[0]?.source_window_days ?? 90}d window · updated {computedAt}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={recompute} disabled={recomputing}>
          <RefreshCw className={`h-3 w-3 mr-1 ${recomputing ? "animate-spin" : ""}`} />
          Recompute
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 || data.every(r => !r.sample_days) ? (
        <p className="text-xs text-muted-foreground">
          No samples yet — hit Recompute to seed day-of-week modifiers from the last {data?.[0]?.source_window_days ?? 90} days.
        </p>
      ) : (
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {DAYS.map((label, i) => {
            const row = data?.find(r => r.day_of_week === i);
            const mod = Number(row?.modifier ?? 1);
            const isToday = i === todayDow;
            const Icon = mod > 1.05 ? TrendingUp : mod < 0.95 ? TrendingDown : Minus;
            const tone =
              mod > 1.05 ? "text-green-600" :
              mod < 0.95 ? "text-red-600" :
              "text-muted-foreground";
            return (
              <div
                key={i}
                className={`p-1.5 sm:p-2 border min-w-0 ${isToday ? "border-foreground border-2 bg-muted" : "border-border"}`}
                style={{ borderRadius: 0 }}
                title={(row?.notes ?? "") + (isToday ? " (today)" : "")}
              >
                <div className="flex items-center justify-between gap-1 text-[10px] uppercase tracking-brand text-muted-foreground font-bold">
                  <span>{label}</span>
                  {isToday && (
                    <span className="text-[8px] px-1 bg-foreground text-background leading-tight">NOW</span>
                  )}
                </div>
                <div className={`text-base sm:text-lg font-bold tabular-nums ${tone} flex items-center gap-1`}>
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{formatPct(mod)}</span>
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums truncate">
                  ×{mod.toFixed(2)} · {row?.sample_days ?? 0}d
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        Push these into Meta/Google as dayparting bid adjustments. Clamped to ±100% with a 3-day minimum sample per DoW; weak samples hold at 1.00.
      </p>
    </div>
  );
}