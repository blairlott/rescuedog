import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "admin" | "national_manager" | "regional_manager" | "state_manager" | "brand_ambassador";

export interface UserRoleInfo {
  roles: AppRole[];
  isOwner: boolean;
  isAdmin: boolean;
  isAdminOrOwner: boolean;
  isSalesRep: boolean;
  profile: { id: string; email: string | null; full_name: string | null; approved?: boolean } | null;
}

export function useUserRole() {
  return useQuery({
    queryKey: ["user_role"],
    queryFn: async (): Promise<UserRoleInfo> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { roles: [], isOwner: false, isAdmin: false, isAdminOrOwner: false, isSalesRep: false, profile: null };

      const [{ data: roleRows }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("id, email, full_name, approved").eq("id", user.id).single(),
      ]);

      const roles = (roleRows || []).map((r: any) => r.role as AppRole);
      const isOwner = roles.includes("owner");
      const isAdmin = roles.includes("admin");

      return {
        roles,
        isOwner,
        isAdmin,
        isAdminOrOwner: isOwner || isAdmin,
        isSalesRep: roles.includes("brand_ambassador") || roles.length === 0,
        profile,
      };
    },
  });
}
