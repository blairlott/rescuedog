import { Button } from "@/components/ui/button";
import { ExternalLink, CreditCard, MapPin, Receipt, Settings2 } from "lucide-react";
import { vinoshipperPortalUrl, VS_PORTAL_LABELS, type VsPortalSection } from "@/lib/vinoshipperPortal";

type Action = { section: VsPortalSection; icon: any };
const ACTIONS: Action[] = [
  { section: "payment_methods", icon: CreditCard },
  { section: "addresses", icon: MapPin },
  { section: "subscriptions", icon: Settings2 },
  { section: "orders", icon: Receipt },
];

export function VinoshipperPortalPanel({
  vinoshipperCustomerId,
  compact = false,
}: {
  vinoshipperCustomerId?: string | null;
  compact?: boolean;
}) {
  return (
    <div className="border border-border p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h3 className="font-bold text-foreground uppercase tracking-brand text-sm">
            Member Portal — secure billing
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            Card updates, billing addresses, and your full Vinoshipper order history live
            in the compliance-grade member portal. Each link opens in a new tab.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="uppercase tracking-brand text-xs">
          <a
            href={vinoshipperPortalUrl("overview", vinoshipperCustomerId)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Portal <ExternalLink className="h-3 w-3 ml-1.5" />
          </a>
        </Button>
      </div>
      <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 md:grid-cols-2 gap-3"}>
        {ACTIONS.map(({ section, icon: Icon }) => {
          const { title, description } = VS_PORTAL_LABELS[section];
          return (
            <a
              key={section}
              href={vinoshipperPortalUrl(section, vinoshipperCustomerId)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-3 border border-border hover:bg-muted/40 transition-colors"
            >
              <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  {title} <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </div>
                {!compact && (
                  <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}