import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MerchBundle {
  id: string;
  handle: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  hero_image_url: string | null;
  sku_handles: string[];
  bundle_price_cents: number;
  compare_at_cents: number | null;
  badge_label: string | null;
  is_active: boolean;
  sort_order: number;
}

export function useMerchBundles() {
  return useQuery<MerchBundle[]>({
    queryKey: ["merch-bundles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merch_bundles" as any)
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as MerchBundle[];
    },
  });
}
