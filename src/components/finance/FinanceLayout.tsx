import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { DollarSign, LogOut, LayoutDashboard, Users, ArrowLeft, FlaskConical } from "lucide-react";

/**
 * Stripped-down chrome for the finance portal. CFOs do NOT get the admin
 * sidebar or any cross-links to CRM/CMS/Kennel. Owners/admins/executives get
 * a small "back to Admin Hub" link.
 */
export default function FinanceLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const { data: roleInfo, isLoading: roleLoading } = useUserRole();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
      if (!session?.user) navigate("/finance/login");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
      if (!session?.user) navigate("/finance/login");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!authChecked || roleLoading) {
    return <div className="min-h-dvh flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!user) return null;

  if (!roleInfo?.canViewFinance) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-bold">Finance access required</h1>
          <p className="text-sm text-muted-foreground">
            Your account doesn't have access to the Finance portal. Please contact the owner to be granted the CFO role.
          </p>
          <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate("/finance/login"); }}>
            <LogOut className="h-4 w-4 mr-1" /> Sign out
          </Button>
        </div>
      </div>
    );
  }

  const canManageUsers = roleInfo.isAdminOrOwner;
  const showAdminBack = !roleInfo.isPureCfo;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/finance" className="flex items-center gap-2 shrink-0">
            <DollarSign className="h-5 w-5 text-primary" />
            <span className="font-bold uppercase tracking-brand text-sm">Finance Portal</span>
          </Link>
          <nav className="flex items-center gap-1 ml-4">
            <Link
              to="/finance"
              className={`flex items-center gap-1.5 px-3 py-2 text-sm uppercase tracking-brand transition-colors ${
                location.pathname === "/finance" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </Link>
            <Link
              to="/finance/workspace"
              className={`flex items-center gap-1.5 px-3 py-2 text-sm uppercase tracking-brand transition-colors ${
                location.pathname.startsWith("/finance/workspace") ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FlaskConical className="h-4 w-4" /> Workspace
            </Link>
            {canManageUsers && (
              <Link
                to="/finance/users"
                className={`flex items-center gap-1.5 px-3 py-2 text-sm uppercase tracking-brand transition-colors ${
                  location.pathname === "/finance/users" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users className="h-4 w-4" /> Access
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">{roleInfo.profile?.full_name || user.email}</span>
            {showAdminBack && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> Admin Hub</Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); navigate("/finance/login"); }}>
              <LogOut className="h-4 w-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}