import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CfoInsight = {
  id: string;
  tile_key: string;
  severity: "critical" | "watch" | "fyi";
  headline: string;
  body: string | null;
  recommended_action: string | null;
  status: "open" | "done" | "dismissed";
  generated_at: string;
  metric_snapshot: any;
  date_range_days: number | null;
};

export function useCfoInsights(status: CfoInsight["status"] = "open") {
  return useQuery({
    queryKey: ["cfo_insights", status],
    queryFn: async (): Promise<CfoInsight[]> => {
      const { data, error } = await supabase
        .from("cfo_insights" as any)
        .select("id, tile_key, severity, headline, body, recommended_action, status, generated_at, metric_snapshot, date_range_days")
        .eq("status", status)
        .order("generated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useUpdateInsightStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CfoInsight["status"] }) => {
      const { error } = await supabase
        .from("cfo_insights" as any)
        .update({ status, resolved_at: status === "open" ? null : new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cfo_insights"] });
    },
    onError: (e: any) => toast.error("Update failed", { description: String(e?.message ?? e) }),
  });
}

export function useGenerateInsights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (days: number) => {
      const { data, error } = await supabase.functions.invoke("cfo-insights-generate", {
        body: { days },
      });
      if (error) throw error;
      return data as { generated: number; deduped: number; considered: number };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["cfo_insights"] });
      toast.success(
        r.generated > 0
          ? `${r.generated} new insight${r.generated === 1 ? "" : "s"}`
          : "Insights up to date",
        {
          description:
            r.considered === 0
              ? "No material moves vs prior period."
              : `${r.considered} signals checked, ${r.deduped} already on board.`,
        }
      );
    },
    onError: (e: any) => toast.error("Insight generation failed", { description: String(e?.message ?? e) }),
  });
}