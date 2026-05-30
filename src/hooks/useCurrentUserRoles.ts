import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * useCurrentUserRoles — returns the caller's roles as a Set<string>.
 * Light-weight companion to useUserRole; used for gating UI features
 * (markdown editor, schedule fields) where typed AppRole helpers aren't
 * needed.
 */
export function useCurrentUserRoles() {
  return useQuery({
    queryKey: ["current-user-roles"],
    queryFn: async (): Promise<Set<string>> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Set<string>();
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      return new Set((data || []).map((r: any) => String(r.role)));
    },
    staleTime: 60_000,
  });
}