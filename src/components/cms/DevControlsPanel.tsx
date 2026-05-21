import { useDevToggles, type DevToggle, type DevToggleCategory } from "@/hooks/useDevToggles";
import { Switch } from "@/components/ui/switch";
import { Lock } from "lucide-react";

const GROUPS: { category: DevToggleCategory; title: string; blurb: string }[] = [
  {
    category: "account_features",
    title: "Account Features",
    blurb:
      "Master switch + per-feature switches for everything that lives behind a customer account. All default OFF for dev. Subscribe & Save is locked ON and cannot be disabled.",
  },
  {
    category: "notifications",
    title: "Customer Notifications",
    blurb:
      "Master switch + per-email switches for outbound customer email. When OFF, the matching Mailchimp / transactional trigger is suppressed. Subscribe & Save confirmation is locked ON and always sends.",
  },
];

function ToggleRow({ row, onChange }: { row: DevToggle; onChange: (next: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-border last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{row.label}</span>
          {row.locked && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground border border-border px-1.5 py-0.5">
              <Lock className="h-3 w-3" /> Locked ON
            </span>
          )}
        </div>
        {row.description && (
          <p className="text-xs text-muted-foreground mt-1">{row.description}</p>
        )}
      </div>
      <Switch
        checked={row.enabled}
        disabled={row.locked}
        onCheckedChange={onChange}
        aria-label={row.label}
      />
    </div>
  );
}

function Group({ category, title, blurb }: { category: DevToggleCategory; title: string; blurb: string }) {
  const { toggles, isLoading, update } = useDevToggles(category);
  const master = toggles.find((t) => t.key === "__master__");
  const subs = toggles.filter((t) => t.key !== "__master__");

  if (isLoading) {
    return (
      <div className="bg-background border border-border p-6 text-sm text-muted-foreground">
        Loading {title.toLowerCase()}…
      </div>
    );
  }

  return (
    <section className="bg-background border border-border">
      <header className="px-4 py-3 border-b border-border">
        <h3 className="font-bold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1">{blurb}</p>
      </header>

      {master && (
        <div className="bg-secondary">
          <ToggleRow
            row={master}
            onChange={(next) =>
              update.mutate({ category, key: master.key, enabled: next })
            }
          />
        </div>
      )}

      <div>
        {subs.map((row) => (
          <ToggleRow
            key={row.key}
            row={row}
            onChange={(next) =>
              update.mutate({ category, key: row.key, enabled: next })
            }
          />
        ))}
      </div>
    </section>
  );
}

export function DevControlsPanel() {
  return (
    <div className="space-y-6">
      <div className="bg-background border border-border p-4">
        <h2 className="font-bold text-foreground">Dev Controls</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Pre-launch gating. Changes save instantly and apply across the site and all outbound emails.
          Subscribe &amp; Save (feature) and its confirmation email are locked ON.
        </p>
      </div>
      {GROUPS.map((g) => (
        <Group key={g.category} {...g} />
      ))}
    </div>
  );
}