import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import {
  DollarSign, LogOut, LayoutDashboard, Users, ArrowLeft, FlaskConical,
  ChevronLeft, ChevronRight,
} from "lucide-react";

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
  const [collapsed, setCollapsed] = useState(false);
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

  const navItems = [
    { to: "/finance", label: "Overview", icon: LayoutDashboard, match: (p: string) => p === "/finance" },
    { to: "/finance/workspace", label: "Workspace", icon: FlaskConical, match: (p: string) => p.startsWith("/finance/workspace") },
    ...(canManageUsers ? [{ to: "/finance/users", label: "Access", icon: Users, match: (p: string) => p === "/finance/users" }] : []),
  ];
  const current = navItems.find(n => n.match(location.pathname)) ?? navItems[0];
  const initial = (roleInfo.profile?.full_name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh bg-muted/30 flex">
      {/* Sidebar */}
      <aside
        className={`${collapsed ? "w-[68px]" : "w-60"} shrink-0 border-r border-border bg-card flex flex-col transition-[width] duration-200 sticky top-0 h-dvh`}
      >
        <div className={`flex items-center gap-2 px-4 h-14 border-b border-border ${collapsed ? "justify-center px-0" : ""}`}>
          <div className="h-8 w-8 bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <DollarSign className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-[11px] uppercase tracking-brand text-muted-foreground">Rescue Dog</div>
              <div className="font-bold text-sm">Finance</div>
            </div>
          )}
        </div>
        <nav className="flex-1 py-3 space-y-0.5">
          {navItems.map(item => {
            const active = item.match(location.pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={`mx-2 flex items-center gap-3 px-3 h-10 text-sm transition-colors ${
                  active
                    ? "bg-primary/10 text-primary border-l-2 border-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground border-l-2 border-transparent"
                } ${collapsed ? "justify-center" : ""}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-2 space-y-1">
          {showAdminBack && (
            <Button variant="ghost" size="sm" className={`w-full ${collapsed ? "justify-center px-0" : "justify-start"}`} asChild>
              <Link to="/admin">
                <ArrowLeft className="h-4 w-4" />
                {!collapsed && <span className="ml-2">Admin Hub</span>}
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={`w-full ${collapsed ? "justify-center px-0" : "justify-start"}`}
            onClick={() => setCollapsed(c => !c)}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span className="ml-2">Collapse</span></>}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card flex items-center gap-3 px-6 sticky top-0 z-30">
          <div>
            <div className="text-[10px] uppercase tracking-brand text-muted-foreground leading-none">Finance Portal</div>
            <div className="font-bold text-sm leading-tight">{current.label}</div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-7 w-7 bg-foreground/10 text-foreground flex items-center justify-center font-semibold">{initial}</div>
              <span className="truncate max-w-[180px]">{roleInfo.profile?.full_name || user.email}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => { await supabase.auth.signOut(); navigate("/finance/login"); }}
            >
              <LogOut className="h-4 w-4 mr-1" /> Sign out
            </Button>
          </div>
        </header>
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}