import { Button } from "@/components/ui/button";
import { Wine, Package, Calendar, Settings, Percent } from "lucide-react";
import type { WineClubMembership, WineClubTier } from "@/hooks/useWineClub";

const frequencyLabel: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  "bi-annual": "Bi-Annual",
  yearly: "Yearly",
};

interface MemberDashboardProps {
  membership: WineClubMembership & { tier: WineClubTier };
}

export function MemberDashboard({ membership }: MemberDashboardProps) {
  const tier = membership.tier;
  const priceDisplay = `$${(tier.price_cents / 100).toFixed(0)}`;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Status Banner */}
      <div className="border border-primary bg-primary/5 p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Wine className="h-10 w-10 text-primary" />
            <div>
              <h2 className="text-xl font-bold text-foreground">{tier.name}</h2>
              <p className="text-sm text-muted-foreground">
                Member since {new Date(membership.joined_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-3 py-1 bg-primary/10 text-primary text-xs font-bold uppercase tracking-brand">
              {membership.status}
            </span>
            <span className="inline-flex items-center px-3 py-1 bg-muted text-muted-foreground text-xs font-bold uppercase tracking-brand">
              {membership.payment_status}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="border border-border p-6 text-center">
          <Package className="h-8 w-8 text-primary mx-auto mb-3" />
          <p className="text-2xl font-bold text-foreground">{tier.bottle_count}</p>
          <p className="text-sm text-muted-foreground">Bottles per shipment</p>
        </div>
        <div className="border border-border p-6 text-center">
          <Calendar className="h-8 w-8 text-primary mx-auto mb-3" />
          <p className="text-2xl font-bold text-foreground">
            {membership.next_shipment_date
              ? new Date(membership.next_shipment_date).toLocaleDateString()
              : "TBD"}
          </p>
          <p className="text-sm text-muted-foreground">Next shipment</p>
        </div>
        <div className="border border-border p-6 text-center">
          <Wine className="h-8 w-8 text-primary mx-auto mb-3" />
          <p className="text-2xl font-bold text-foreground">{priceDisplay}</p>
          <p className="text-sm text-muted-foreground">{frequencyLabel[tier.frequency]}</p>
        </div>
      </div>

      {/* Shipping Address */}
      <div className="border border-border p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Settings className="h-5 w-5" /> Shipping Address
          </h3>
          <Button variant="outline" size="sm" className="text-xs uppercase tracking-brand">
            Update
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {membership.shipping_address_line1}
          {membership.shipping_address_line2 && `, ${membership.shipping_address_line2}`}
          <br />
          {membership.shipping_city}, {membership.shipping_state} {membership.shipping_zip}
        </p>
      </div>

      {/* Wine Preferences */}
      {membership.wine_preferences && membership.wine_preferences.length > 0 && (
        <div className="border border-border p-6 mb-8">
          <h3 className="font-bold text-foreground mb-3">Your Wine Preferences</h3>
          <div className="flex flex-wrap gap-2">
            {membership.wine_preferences.map((pref) => (
              <span
                key={pref}
                className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold uppercase tracking-brand"
              >
                {pref}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Shipment Placeholder */}
      <div className="border border-border p-8 text-center">
        <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-bold text-foreground mb-2">No Upcoming Shipments Yet</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          When your next shipment is being prepared, you'll receive an email to review and customize
          your AI-curated selection before it ships.
        </p>
      </div>
    </div>
  );
}
