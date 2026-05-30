import { useEffect, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, Map, Route, Users, UserCircle, Heart, TrendingUp, ShieldCheck, ExternalLink, PenLine, FileText, Mail, Link2, Brain, Globe2, Webhook, TrendingDown, FlaskConical, Headphones, ArrowLeft, Radar, Menu, X, AlertTriangle, Newspaper } from "lucide-react";
import { ProfileDialog } from "@/components/crm/ProfileDialog";
import { CrmCommandPalette } from "@/components/crm/CrmCommandPalette";
import { CrmBreadcrumbs } from "@/components/crm/CrmBreadcrumbs";
import { Link, useLocation } from "react-router-dom";

export default function CrmLayout() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { data: roleInfo, isLoading: roleLoading } = useUserRole();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [driftCount, setDriftCount] = useState(0);

  useEffect(() => {
    if (!roleInfo?.isAdminOrOwner) return;
    let cancelled = false;
    const fetchCount = async () => {
      const { count } = await supabase
        .from("wine_products_pending")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (!cancelled) setDriftCount(count || 0);
    };
    fetchCount();
    const onFocus = () => fetchCount();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
  }, [roleInfo?.isAdminOrOwner]);

  const isBrandOwner = roleInfo?.isOwner || (roleInfo?.roles || []).includes("brand_owner" as any);
  const navItems = [
    { to: "/crm", label: "Dashboard", icon: LayoutDashboard },
    { to: "/crm/map", label: "Map", icon: Map },
    { to: "/crm/routes", label: "Route Planner", icon: Route },
    ...(roleInfo?.isAdminOrOwner ? [{ to: "/crm/intelligence", label: "Intelligence", icon: Brain }] : []),
    ...(roleInfo?.isAdminOrOwner ? [{ to: "/crm/customer-map", label: "Customer Map", icon: Globe2 }] : []),
    ...(roleInfo?.isAmbassadorManager ? [{ to: "/crm/ambassadors", label: "Ambassadors", icon: Heart }] : []),
    ...(roleInfo?.isAdminOrOwner ? [{ to: "/crm/margin", label: "Margin", icon: TrendingUp }] : []),
    ...(roleInfo?.isAdminOrOwner ? [{ to: "/crm/leads", label: "Leads", icon: Mail }] : []),
    ...(roleInfo?.isAdminOrOwner ? [{ to: "/crm/customer-service", label: "Customer Service", icon: Headphones }] : []),
    ...(roleInfo?.isAdminOrOwner ? [{ to: "/admin/ab-results", label: "A/B Results", icon: FlaskConical }] : []),
    ...(roleInfo?.isAdminOrOwner ? [{ to: "/crm/admin#depletion-uploader", label: "Depletion Upload", icon: FileText }] : []),
    ...(roleInfo?.isAdminOrOwner ? [{ to: "/crm/legacy-migration", label: "Legacy Migration", icon: Link2 }] : []),
    ...(roleInfo?.isAdminOrOwner ? [{ to: "/crm/admin/sync-drift", label: "Catalog Drift", icon: AlertTriangle, badge: driftCount }] : []),
    ...(isBrandOwner ? [{ to: "/crm/admin/press-mentions", label: "Press Mentions", icon: Newspaper }] : []),
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

  // Force password change gate: any authenticated user with
  // profiles.must_change_password=true gets redirected to the change-password
  // page with ?next= pointing back to where they were going.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (profile?.must_change_password) {
        const next = encodeURIComponent(location.pathname + location.search);
        navigate(`/admin/change-password?next=${next}`, { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, navigate]);

  // Close mobile nav on route change — must be declared before any conditional return
  // to keep hook order stable across renders.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  if (loading || roleLoading) return <div className="min-h-dvh flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return null;

  // Block unapproved users (except admins/owners who are always approved)
  const isApproved = roleInfo?.profile && (roleInfo.profile as any).approved;
  if (!isApproved && !roleInfo?.isAdminOrOwner && !roleInfo?.isAmbassadorManager && !roleInfo?.canViewBackend) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
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

  const sidebarContent = (
    <>
        <div className="p-4 border-b border-border">
          <h2 className="font-bold text-foreground text-sm tracking-brand uppercase">Sales CRM</h2>
          <p className="text-xs text-muted-foreground truncate mt-1">{roleInfo?.profile?.full_name || user.email}</p>
          {roleInfo?.roles && roleInfo.roles.length > 0 && (
            <p className="text-xs text-primary mt-0.5 capitalize">{roleInfo.roles[0]}</p>
          )}
        </div>
        <Link
          to="/admin"
          className="flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-brand text-muted-foreground hover:text-foreground hover:bg-muted border-b border-border"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Admin Hub
        </Link>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
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
                <span className="flex-1">{item.label}</span>
                {"badge" in item && (item as any).badge > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-bold bg-destructive text-destructive-foreground rounded">
                    {(item as any).badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t border-border space-y-1">
          {roleInfo?.isAdminOrOwner && (
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2" asChild>
              <Link to="/cms" target="_blank" rel="noopener noreferrer">
                <PenLine className="h-4 w-4" /> Content Manager
                <ExternalLink className="h-3 w-3 ml-auto opacity-60" />
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" asChild>
            <Link to="/" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> View Site
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => setProfileOpen(true)}>
            <UserCircle className="h-4 w-4" /> My Contact Info
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={async () => { await supabase.auth.signOut(); navigate("/crm/login"); }}>
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
    </>
  );

  return (
    <div className="h-dvh bg-background flex overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 border-r border-border bg-card flex-col shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-64 max-w-[80%] border-r border-border bg-card flex flex-col h-full">
            <button
              onClick={() => setMobileNavOpen(false)}
              className="absolute top-3 right-3 p-1 rounded hover:bg-muted z-10"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-auto flex flex-col min-w-0">
        <header className="h-12 border-b border-border bg-card flex items-center px-3 md:px-4 gap-2 md:gap-3 shrink-0">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden p-1.5 rounded hover:bg-muted"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <CrmBreadcrumbs />
          <div className="ml-auto flex items-center gap-2">
            <CrmCommandPalette />
          </div>
        </header>
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
