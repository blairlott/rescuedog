import { Link, NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Lightbulb, Settings, LogOut, Megaphone, ScrollText, Network, ChevronRight, Home, TrendingUp, Send, Menu, X, ShieldAlert, Key, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useState, useEffect } from "react";

const NAV = [
  { to: "/kennel", label: "Dashboard", icon: LayoutDashboard, end: true, viewerOk: true },
  { to: "/kennel/true-roas", label: "True ROAS", icon: TrendingUp, end: false, viewerOk: true },
  { to: "/kennel/capi", label: "Meta CAPI", icon: Send, end: false, viewerOk: false },
  { to: "/kennel/recommendations", label: "Recommendations", icon: Lightbulb, end: false, viewerOk: false },
  { to: "/kennel/channels", label: "Channels", icon: Network, end: false, viewerOk: true },
  { to: "/kennel/log", label: "Execution log", icon: ScrollText, end: false, viewerOk: true },
  { to: "/kennel/oci-log", label: "OCI uploads", icon: Target, end: false, viewerOk: false },
  { to: "/kennel/settings", label: "Settings", icon: Settings, end: false, viewerOk: false },
  { to: "/kennel/integrations", label: "Integrations", icon: Key, end: false, viewerOk: false },
];

export function KennelLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: roleInfo } = useUserRole();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [killActive, setKillActive] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadKill = async () => {
      const { data } = await supabase
        .from("ad_settings")
        .select("key,value")
        .or("key.eq.kill_switch,key.like.kill_switch_%");
      if (cancelled) return;
      const on: string[] = [];
      (data ?? []).forEach((r: any) => {
        if (r.value === true) {
          on.push(r.key === "kill_switch" ? "GLOBAL" : r.key.replace("kill_switch_", "").toUpperCase());
        }
      });
      setKillActive(on);
    };
    loadKill();
    const ch = supabase
      .channel("kennel-kill-switch")
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_settings" }, () => loadKill())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);

  // Close mobile drawer on route change
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  const segments = location.pathname.replace(/^\/+|\/+$/g, "").split("/");
  // segments[0] === "kennel"
  const crumbs: { label: string; to: string }[] = [];
  let acc = "";
  segments.forEach((seg, i) => {
    acc += `/${seg}`;
    const label =
      i === 0 ? "Kennel"
      : seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
    crumbs.push({ label, to: acc });
  });

  return (
    <div className="min-h-screen flex bg-background font-sans" style={{ fontFamily: '"Nunito Sans", system-ui, sans-serif' }}>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-3 py-2 border-b border-border bg-card">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="p-2 text-foreground"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" />
          <span className="font-bold text-foreground uppercase tracking-brand text-xs">The Kennel</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Mobile drawer overlay */}
      {mobileNavOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-60 border-r border-border bg-card flex flex-col shrink-0 transform transition-transform md:transform-none ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="md:hidden flex justify-end p-2">
          <button onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" className="p-1 text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <Link to="/kennel" className="flex items-center gap-2 px-4 py-4 border-b border-border">
          <Megaphone className="h-5 w-5 text-primary" />
          <div>
            <div className="font-bold text-foreground uppercase tracking-brand text-sm">The Kennel</div>
            <div className="text-[10px] text-muted-foreground">Every dollar finds its pack</div>
          </div>
        </Link>
        <nav className="flex-1 p-2 space-y-1">
          {NAV.filter((item) => item.viewerOk || roleInfo?.isAdOps).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                }`
              }
              style={{ borderRadius: 0 }}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <div className="text-xs text-muted-foreground truncate">{roleInfo?.profile?.email}</div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            style={{ borderRadius: 0 }}
            onClick={async () => { await supabase.auth.signOut(); navigate("/admin"); }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto pt-12 md:pt-0 min-w-0">
        {killActive.length > 0 && (
          <div
            className="sticky top-0 z-30 flex items-center gap-2 px-4 md:px-6 py-2 bg-destructive text-destructive-foreground border-b-2 border-foreground"
            style={{ borderRadius: 0 }}
          >
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span className="text-xs uppercase tracking-brand font-bold">
              Kill switch engaged · {killActive.join(" · ")} · no auto-execute or approve will run
            </span>
            <Link
              to="/kennel/settings"
              className="ml-auto text-[10px] uppercase tracking-brand underline shrink-0"
            >
              Manage
            </Link>
          </div>
        )}
        {crumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-xs px-4 md:px-6 py-2 border-b border-border bg-card/50 overflow-x-auto whitespace-nowrap"
          >
            <Home className="h-3 w-3 text-muted-foreground" />
            {crumbs.map((c, i) => (
              <span key={c.to} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                {i === crumbs.length - 1 ? (
                  <span className="uppercase tracking-brand font-bold text-foreground">{c.label}</span>
                ) : (
                  <Link
                    to={c.to}
                    className="uppercase tracking-brand text-muted-foreground hover:text-foreground"
                  >
                    {c.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        )}
        <Outlet />
      </main>
    </div>
  );
}