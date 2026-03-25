import { useEffect, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, Map, Route, Users, UserCircle } from "lucide-react";
import { ProfileDialog } from "@/components/crm/ProfileDialog";
import { Link, useLocation } from "react-router-dom";

export default function CrmLayout() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { data: roleInfo } = useUserRole();
  const [profileOpen, setProfileOpen] = useState(false);

  const navItems = [
    { to: "/crm", label: "Dashboard", icon: LayoutDashboard },
    { to: "/crm/map", label: "Map", icon: Map },
    { to: "/crm/routes", label: "Route Planner", icon: Route },
    ...(roleInfo?.isAdminOrOwner ? [{ to: "/crm/admin", label: "Users", icon: Users }] : []),
  ];

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session?.user) navigate("/crm/login");
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session?.user) navigate("/crm/login");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return null;

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      <aside className="w-56 border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <h2 className="font-bold text-foreground text-sm tracking-brand uppercase">Sales CRM</h2>
          <p className="text-xs text-muted-foreground truncate mt-1">{roleInfo?.profile?.full_name || user.email}</p>
          {roleInfo?.roles && roleInfo.roles.length > 0 && (
            <p className="text-xs text-primary mt-0.5 capitalize">{roleInfo.roles[0]}</p>
          )}
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors ${
                  isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t border-border space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => setProfileOpen(true)}
          >
            <UserCircle className="h-4 w-4" /> My Contact Info
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={async () => { await supabase.auth.signOut(); navigate("/crm/login"); }}
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
