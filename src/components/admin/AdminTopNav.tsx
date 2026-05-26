import { Link, useLocation } from "react-router-dom";
import { Shield, LogOut, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_AREAS, hasAreaAccess } from "@/lib/adminAreas";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface AdminTopNavProps {
  roles: string[];
}

export function AdminTopNav({ roles }: AdminTopNavProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin");
  };

  return (
    <header className="border-b border-border bg-background sticky top-0 z-30">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link to="/admin" className="flex items-center gap-2 shrink-0">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-bold uppercase tracking-brand text-sm">Admin Portal</span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {ADMIN_AREAS.map((area) => {
            const allowed = hasAreaAccess(area, roles);
            const to = allowed ? area.to : `/admin/request-access?area=${area.key}`;
            const isActive = allowed && pathname.startsWith(area.to);
            const Icon = area.icon;
            return (
              <Link
                key={area.key}
                to={to}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm uppercase tracking-brand transition-colors ${
                  isActive
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                } ${!allowed ? "opacity-60" : ""}`}
                title={allowed ? area.title : `Request access to ${area.title}`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{area.title}</span>
                {!allowed && <span className="text-[10px] ml-1">🔒</span>}
              </Link>
            );
          })}
        </nav>

        <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5 shrink-0">
          <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
        </Button>
        {roles.includes("owner") && (
          <Link
            to="/admin/secrets-access"
            className="flex items-center gap-1.5 px-2 py-2 text-sm uppercase tracking-brand text-muted-foreground hover:text-foreground shrink-0"
            title="Secrets & Token Access (owner only)"
          >
            <KeyRound className="h-4 w-4" />
            <span className="hidden lg:inline">Secrets</span>
          </Link>
        )}
      </div>
    </header>
  );
}