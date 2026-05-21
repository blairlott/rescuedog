import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type CmsEditScope =
  | "marketing"   // hero, copy, CTAs, headlines
  | "partners"    // rescue partners, ambassador partners
  | "branding"    // header, logos, banner
  | "events"      // event listings
  | "wine_club"   // wine club page content
  | "team";       // team / about bios

// Maps each scope to the roles allowed to edit it.
// owner + admin + cms_editor implicitly get every scope.
const SCOPE_ROLES: Record<CmsEditScope, string[]> = {
  marketing:  ["owner", "admin", "cms_editor"],
  partners:   ["owner", "admin", "cms_editor", "ambassador_manager"],
  branding:   ["owner", "admin", "cms_editor"],
  events:     ["owner", "admin", "cms_editor", "ambassador_manager"],
  wine_club:  ["owner", "admin", "cms_editor", "wine_club_manager"],
  team:       ["owner", "admin", "cms_editor"],
};

interface CmsAuthContextType {
  isCmsEditor: boolean;
  roles: string[];
  canEdit: (scope?: CmsEditScope) => boolean;
  loading: boolean;
  logout: () => Promise<void>;
}

const CmsAuthContext = createContext<CmsAuthContextType>({
  isCmsEditor: false,
  roles: [],
  canEdit: () => false,
  loading: true,
  logout: async () => {},
});

export const useCmsAuth = () => useContext(CmsAuthContext);

export const CmsAuthProvider = ({ children }: { children: ReactNode }) => {
  const [isCmsEditor, setIsCmsEditor] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const syncCmsAccess = async (session: Session | null) => {
      if (!isMounted) return;
      setLoading(true);

      if (session?.user?.id) {
        const [{ data: editorFlag, error: editorErr }, { data: roleRows }] = await Promise.all([
          supabase.rpc("is_cms_editor", { _user_id: session.user.id }),
          supabase.from("user_roles").select("role").eq("user_id", session.user.id),
        ]);

        if (!isMounted) return;
        const userRoles = (roleRows || []).map((r: any) => String(r.role));
        setRoles(userRoles);
        // Treat read-only `viewer` / `executive` as CMS-accessible (read-only).
        // canEdit() below still returns false for them, so they cannot edit/publish.
        const hasReadOnlyBackend = userRoles.some((r) => r === "viewer" || r === "executive");
        setIsCmsEditor((!editorErr && !!editorFlag) || hasReadOnlyBackend);
      } else {
        setRoles([]);
        setIsCmsEditor(false);
      }

      if (isMounted) setLoading(false);
    };

    const initialize = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      await syncCmsAccess(session);
    };

    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncCmsAccess(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setIsCmsEditor(false);
    setRoles([]);
  };

  const canEdit = (scope?: CmsEditScope) => {
    // Owner / admin / generic cms_editor can edit anything.
    if (roles.some((r) => r === "owner" || r === "admin" || r === "cms_editor")) return true;
    if (!scope) return false;
    const allowed = SCOPE_ROLES[scope] || [];
    return roles.some((r) => allowed.includes(r));
  };

  return (
    <CmsAuthContext.Provider value={{ isCmsEditor, roles, canEdit, loading, logout }}>
      {children}
    </CmsAuthContext.Provider>
  );
};
