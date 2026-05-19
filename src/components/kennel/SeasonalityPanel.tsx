import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Row = {
  month: number;
  budget_index: number;
  revenue_cents: number | null;
  orders: number | null;
  years_observed: number | null;
  computed_at: string;
};

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function SeasonalityPanel() {
  const [busy, setBusy] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["kennel-seasonality"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kennel_seasonality_curve" as any)
        .select("*")
        .order("month");
      if (error) throw error;
      return ((data as any) ?? []) as Row[];
    },
    staleTime: 60 * 1000,
  });

  const recompute = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("kennel-recompute-seasonality");
      if (error) throw error;
      toast.success("Seasonality recomputed");
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Recompute failed");
    } finally {
      setBusy(false);
    }
  };

  const currentMo = new Date().getMonth() + 1;
  const maxIdx = Math.max(1, ...(data ?? []).map(r => Number(r.budget_index)));

  return (
    <div className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs uppercase tracking-brand font-bold">Seasonality Budget Curve</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Lifetime consumer revenue by month-of-year</p>
        </div>
        <Button size="sm" variant="outline" onClick={recompute} disabled={busy}>
          <RefreshCw className={`h-3 w-3 mr-1 ${busy ? "animate-spin" : ""}`} />
          Recompute
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-12 gap-1 items-end" style={{ height: 140 }}>
          {(data ?? []).map(r => {
            const idx = Number(r.budget_index);
            const h = Math.max(4, (idx / maxIdx) * 120);
            const isNow = r.month === currentMo;
            const tone = idx >= 1.5 ? "bg-green-600" : idx >= 1.0 ? "bg-foreground" : idx >= 0.7 ? "bg-muted-foreground" : "bg-red-500";
            return (
              <div key={r.month} className="flex flex-col items-center gap-1">
                <div className="text-[9px] tabular-nums font-bold">{idx.toFixed(2)}×</div>
                <div style={{ height: h, width: "100%" }} className={`${tone} ${isNow ? "ring-2 ring-primary" : ""}`} />
                <div className={`text-[10px] ${isNow ? "font-bold" : "text-muted-foreground"}`}>{MONTHS[r.month]}</div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-3">
        Multiply your monthly ad budget by this index. Q4 (Nov/Dec) is typically 2–3×. Push to Meta/Google campaign budget rules.
      </p>
    </div>
  );
}