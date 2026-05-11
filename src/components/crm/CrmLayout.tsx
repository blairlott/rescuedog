import { useEffect, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, Map, Route, Users, UserCircle, Truck, Heart } from "lucide-react";
import { ProfileDialog } from "@/components/crm/ProfileDialog";
import { Link, useLocation } from "react-router-dom";

export default function CrmLayout() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { data: roleInfo, isLoading: roleLoading } = useUserRole();
  const [profileOpen, setProfileOpen] = useState(false);

  const navItems = [
    { to: "/crm", label: "Dashboard", icon: LayoutDashboard },
    { to: "/crm/map", label: "Map", icon: Map },
    { to: "/crm/routes", label: "Route Planner", icon: Route },
    ...(roleInfo?.isAdminOrOwner || (roleInfo?.roles as string[] | undefined)?.includes("dropship_manager")
      ? [{ to: "/crm/dropship", label: "Drop-Ship", icon: Truck }]
      : []),
    ...(roleInfo?.isAmbassadorManager ? [{ to: "/crm/ambassadors", label: "Ambassadors", icon: Heart }] : []),
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

  if (loading || roleLoading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return null;

  // Block unapproved users (except admins/owners who are always approved)
  const isApproved = roleInfo?.profile && (roleInfo.profile as any).approved;
  if (!isApproved && !roleInfo?.isAdminOrOwner) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-2xl font-bold text-foreground">Account Pending Approval</h1>
          <p className="text-muted-foreground">
            Your account has been created but is waiting for admin approval. You'll be able to access the CRM once approved.
          </p>
          <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate("/crm/login"); }}>
            <LogOut className="h-4 w-4 mr-1" /> Sign Out
          </Button>
        </div>
      </div>
    );
  }

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
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => setProfileOpen(true)}>
            <UserCircle className="h-4 w-4" /> My Contact Info
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={async () => { await supabase.auth.signOut(); navigate("/crm/login"); }}>
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
