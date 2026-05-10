import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, boolean>();

export function useFeatureFlag(key: string, fallback = false): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => cache.get(key) ?? fallback);

  useEffect(() => {
    let active = true;
    supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", key)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const val = data?.enabled ?? fallback;
        cache.set(key, val);
        setEnabled(val);
      });
    return () => {
      active = false;
    };
  }, [key, fallback]);

  return enabled;
}