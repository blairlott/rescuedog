import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DonationMetricPublic {
  metric_key: string;
  value_display: string;
  partner_count: number | null;
  as_of: string;
  source: "quickbooks" | "manual" | "fallback";
}

/** Public-safe donation metric (uses get_donation_metric_public RPC, no sensitive fields). */
export function useDonationMetric(metricKey = "lifetime_donations") {
  return useQuery({
    queryKey: ["donation_metric_public", metricKey],
    queryFn: async (): Promise<DonationMetricPublic | null> => {
      const { data, error } = await supabase.rpc("get_donation_metric_public", {
        _metric_key: metricKey,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as DonationMetricPublic | undefined) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}