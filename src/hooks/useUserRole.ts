import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "admin" | "national_manager" | "regional_manager" | "state_manager" | "brand_ambassador" | "ambassador_manager" | "wine_club_manager" | "dropship_manager" | "cms_editor" | "crm_user" | "ad_ops_manager" | "executive" | "kennel_viewer" | "viewer" | "cfo" | "developer";

export interface UserRoleInfo {
  roles: AppRole[];
  isOwner: boolean;
  isAdmin: boolean;
  isAdminOrOwner: boolean;
  isSalesRep: boolean;
  isAmbassadorManager: boolean;
  isAdOps: boolean;
  isKennelViewer: boolean;
  canViewKennel: boolean;
  isBackendViewer: boolean;
  canViewBackend: boolean;
  isCfo: boolean;
  canViewFinance: boolean;
  isPureCfo: boolean;
  isDeveloper: boolean;
  profile: { id: string; email: string | null; full_name: string | null; approved?: boolean } | null;
}

export function useUserRole() {
  return useQuery({
    queryKey: ["user_role"],
    queryFn: async (): Promise<UserRoleInfo> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { roles: [], isOwner: false, isAdmin: false, isAdminOrOwner: false, isSalesRep: false, isAmbassadorManager: false, isAdOps: false, isKennelViewer: false, canViewKennel: false, isBackendViewer: false, canViewBackend: false, isCfo: false, canViewFinance: false, isPureCfo: false, isDeveloper: false, profile: null };

      const [{ data: roleRows }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("id, email, full_name, approved").eq("id", user.id).single(),
      ]);

      const roles = (roleRows || []).map((r: any) => r.role as AppRole);
      const isOwner = roles.includes("owner");
      const isAdmin = roles.includes("admin");
      const isAdminOrOwner = isOwner || isAdmin;

      const isAdOps = isAdminOrOwner || roles.includes("ad_ops_manager");
      const isKennelViewer = roles.includes("kennel_viewer");
      const isExecutive = roles.includes("executive");
      const isViewer = roles.includes("viewer");
      const isCfo = roles.includes("cfo");
      // canViewBackend: read-only navigation across CMS/CRM/Wine Club/Dropship/Kennel.
      // Owners, admins, executives, and the new viewer role all qualify.
      const canViewBackend = isAdminOrOwner || isExecutive || isViewer;
      // Finance portal access: owners, admins, executives, CFOs, and backend viewers.
      const canViewFinance = isAdminOrOwner || isExecutive || isViewer || isCfo;
      // "Pure CFO" = ONLY has cfo role (no admin, owner, exec, viewer, etc.).
      // These users must be locked to /finance and redirected away from /admin,
      // /crm, /cms, /kennel, /club, /dropship.
      const isPureCfo = isCfo && !isAdminOrOwner && !isExecutive && !isViewer
        && !roles.some(r => ["cms_editor","crm_user","ad_ops_manager","kennel_viewer","wine_club_manager","dropship_manager","ambassador_manager","brand_ambassador","national_manager","regional_manager","state_manager"].includes(r));
      return {
        roles,
        isOwner,
        isAdmin,
        isAdminOrOwner,
        isSalesRep: roles.includes("brand_ambassador") || roles.length === 0,
        isAmbassadorManager: isAdminOrOwner || roles.includes("ambassador_manager"),
        isAdOps,
        isKennelViewer,
        canViewKennel: isAdOps || isExecutive || isKennelViewer || isViewer,
        isBackendViewer: isViewer,
        canViewBackend,
        isCfo,
        canViewFinance,
        isPureCfo,
        isDeveloper: roles.includes("developer"),
        profile,
      };
    },
  });
}
