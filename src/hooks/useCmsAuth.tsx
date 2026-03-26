import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase.rpc("is_cms_editor", { _user_id: session.user.id });
        setIsCmsEditor(!!data);
      } else {
        setIsCmsEditor(false);
      }
      setLoading(false);
    };

    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const { data } = await supabase.rpc("is_cms_editor", { _user_id: session.user.id });
        setIsCmsEditor(!!data);
      } else {
        setIsCmsEditor(false);
      }
    });

    return () => subscription.unsubscribe();
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
