import { Link, NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Lightbulb, Settings, LogOut, Megaphone, ScrollText, Network, ChevronRight, Home, TrendingUp, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

const NAV = [
  { to: "/kennel", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/kennel/true-roas", label: "True ROAS", icon: TrendingUp, end: false },
  { to: "/kennel/capi", label: "Meta CAPI", icon: Send, end: false },
  { to: "/kennel/recommendations", label: "Recommendations", icon: Lightbulb, end: false },
  { to: "/kennel/channels", label: "Channels", icon: Network, end: false },
  { to: "/kennel/log", label: "Execution log", icon: ScrollText, end: false },
  { to: "/kennel/settings", label: "Settings", icon: Settings, end: false },
];

export function KennelLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: roleInfo } = useUserRole();

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
      <aside className="w-60 border-r border-border bg-card flex flex-col shrink-0">
        <Link to="/kennel" className="flex items-center gap-2 px-4 py-4 border-b border-border">
          <Megaphone className="h-5 w-5 text-primary" />
          <div>
            <div className="font-bold text-foreground uppercase tracking-brand text-sm">The Kennel</div>
            <div className="text-[10px] text-muted-foreground">Every dollar finds its pack</div>
          </div>
        </Link>
        <nav className="flex-1 p-2 space-y-1">
          {NAV.map((item) => (
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
      <main className="flex-1 overflow-auto">
        {crumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-xs px-6 py-2 border-b border-border bg-card/50"
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