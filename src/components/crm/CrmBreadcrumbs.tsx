import { Link, useLocation, useParams } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

/**
 * Maps CRM route segments → human labels for breadcrumbs.
 * Dynamic segments (e.g. account ids) are handled inline.
 */
const LABELS: Record<string, string> = {
  crm: "CRM",
  map: "Map",
  routes: "Route Planner",
  admin: "Users",
  dropship: "Drop-Ship",
  margin: "Margin",
  ambassadors: "Ambassadors",
  compliance: "Compliance",
  account: "Account",
};

export function CrmBreadcrumbs() {
  const { pathname } = useLocation();
  const params = useParams();
  const segments = pathname.split("/").filter(Boolean);

  // Build cumulative crumbs.
  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    let label = LABELS[seg] ?? seg;
    // Replace :id in account/:id with a short id preview
    if (params.id && seg === params.id) {
      label = `#${seg.slice(0, 6)}`;
    }
    return { href, label };
  });

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-xs text-muted-foreground min-w-0"
    >
      <Link
        to="/admin"
        aria-label="Admin home"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={c.href} className="flex items-center gap-1 min-w-0">
            <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
            <Link
              to={c.href}
              className={`hover:text-foreground transition-colors truncate ${
                isLast ? "text-foreground font-medium" : ""
              }`}
            >
              {c.label}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}