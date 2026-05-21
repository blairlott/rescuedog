import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

export function KennelGuard({ children }: { children: React.ReactNode }) {
  const { data: roleInfo, isLoading } = useUserRole();
  const [authChecked, setAuthChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
      setAuthChecked(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!authChecked || isLoading) {
    return <div className="min-h-dvh flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!hasSession) return <Navigate to="/admin" replace />;
  if (!roleInfo?.canViewKennel) return <Navigate to="/admin/request-access?area=kennel" replace />;
  return <>{children}</>;
}