import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface CmsAuthContextType {
  isCmsEditor: boolean;
  loading: boolean;
  logout: () => Promise<void>;
}

const CmsAuthContext = createContext<CmsAuthContextType>({ isCmsEditor: false, loading: true, logout: async () => {} });

export const useCmsAuth = () => useContext(CmsAuthContext);

export const CmsAuthProvider = ({ children }: { children: ReactNode }) => {
  const [isCmsEditor, setIsCmsEditor] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const syncCmsAccess = async (session: Session | null) => {
      if (!isMounted) return;
      setLoading(true);

      if (session?.user?.id) {
        const { data, error } = await supabase.rpc("is_cms_editor", {
          _user_id: session.user.id,
        });

        if (!isMounted) return;
        setIsCmsEditor(!error && !!data);
      } else {
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
  };

  return (
    <CmsAuthContext.Provider value={{ isCmsEditor, loading, logout }}>
      {children}
    </CmsAuthContext.Provider>
  );
};
