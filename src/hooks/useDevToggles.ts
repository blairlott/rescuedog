import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface DevToggle {
  category: string;
  key: string;
  enabled: boolean;
  locked: boolean;
  label: string;
  description: string | null;
  sort_order: number;
}

export type DevToggleCategory = "account_features" | "notifications";

/**
 * Read + mutate `dev_toggles` rows. Anyone may read; only admins/owners may
 * mutate. Locked rows are enforced server-side by a trigger.
 *
 * The MASTER row uses key `__master__`. A sub-toggle is effectively enabled
 * only when both the master AND its own row are enabled (or when the row is
 * `locked` — locked rows ignore the master gate, which is how Subscribe & Save
 * stays on even when the master is OFF for dev).
 */
export function useDevToggles(category?: DevToggleCategory) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["dev-toggles", category ?? "all"],
    queryFn: async () => {
      let q = supabase.from("dev_toggles").select("*").order("sort_order");
      if (category) q = q.eq("category", category);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DevToggle[];
    },
    staleTime: 30_000,
  });

  const update = useMutation({
    mutationFn: async ({ category: c, key, enabled }: { category: string; key: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("dev_toggles")
        .update({ enabled })
        .eq("category", c)
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dev-toggles"] });
      qc.invalidateQueries({ queryKey: ["dev-toggle-enabled"] });
    },
    onError: (e: Error) => {
      toast({ title: "Could not update toggle", description: e.message, variant: "destructive" });
    },
  });

  return { toggles: query.data ?? [], isLoading: query.isLoading, update };
}

/**
 * Compute the effective enabled state for a single sub-toggle, factoring in
 * the master and the locked flag. Use this on the frontend to gate routes,
 * nav links, account widgets, etc.
 */
export function useIsFeatureEnabled(category: DevToggleCategory, key: string) {
  const { data, isLoading } = useQuery({
    queryKey: ["dev-toggle-enabled", category, key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dev_toggles")
        .select("key, enabled, locked")
        .eq("category", category)
        .in("key", [key, "__master__"]);
      if (error) throw error;
      const rows = data ?? [];
      const self = rows.find((r) => r.key === key);
      const master = rows.find((r) => r.key === "__master__");
      if (!self) return false;
      if (self.locked && self.enabled) return true; // locked-ON bypasses master
      if (!master?.enabled) return false;
      return !!self.enabled;
    },
    staleTime: 30_000,
  });
  return { enabled: data ?? false, isLoading };
}