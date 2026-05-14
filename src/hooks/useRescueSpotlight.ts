import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RescueSpotlight = {
  id: string;
  name: string;
  city: string;
  state: string;
  url: string;
  photo_url: string | null;
  mission_blurb: string | null;
};

/**
 * Pulls all active + focus-region rescue partners (CA + GA today) and
 * picks one at random per render seed. A `seed` lets callers re-roll on
 * mount so cart drawer + shop page surface different rescues per session.
 */
export function useRescueSpotlight(seed?: string | number) {
  const { data, isLoading } = useQuery({
    queryKey: ["rescue-spotlight-pool"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rescue_partners")
        .select("id, name, city, state, url, photo_url, mission_blurb")
        .eq("is_active", true)
        .eq("is_focus", true);
      if (error) throw error;
      return (data ?? []) as RescueSpotlight[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const pick = useMemo<RescueSpotlight | null>(() => {
    if (!data || data.length === 0) return null;
    // Stable per-mount pick (seed is captured in deps)
    const idx = Math.floor(Math.random() * data.length);
    return data[idx];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, seed]);

  return { spotlight: pick, isLoading, poolSize: data?.length ?? 0 };
}