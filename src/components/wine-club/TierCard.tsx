import { Wine, Check, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WineClubTier } from "@/hooks/useWineClub";

const frequencyLabel: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  "bi-annual": "Bi-Annual",
  yearly: "Yearly",
};

const wineTypeLabel: Record<string, string> = {
  mixed: "Mixed (Red, White & Sparkling)",
  red: "Red Only",
  white_sparkling: "White & Sparkling",
};

interface TierCardProps {
  tier: WineClubTier;
  onSelect: (tier: WineClubTier) => void;
  isSelected?: boolean;
}

export function TierCard({ tier, onSelect, isSelected }: TierCardProps) {
  const shipmentPct = tier.shipment_discount_percent ?? tier.discount_percent;
  // Universal member rule (not per-tier): 20% off à la carte, 25% off full cases (12+).
  const ALACARTE_PCT = 20;
  const CASE_PCT = 25;
  return (
    <div
      className={`border p-6 flex flex-col transition-all ${
        isSelected
          ? "border-primary bg-primary/5 ring-2 ring-primary"
          : "border-border hover:border-primary/50"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wine className="h-5 w-5 text-primary" />
          <span className="text-xs font-bold uppercase tracking-brand text-muted-foreground">
            {frequencyLabel[tier.frequency] || tier.frequency}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded-sm uppercase tracking-brand">
          <Percent className="h-3 w-3" />
          {shipmentPct}% Off Shipments
        </span>
      </div>

      <h3 className="text-lg font-bold text-foreground mb-1">{tier.name}</h3>
      <p className="text-sm text-muted-foreground mb-4 flex-1">{tier.description}</p>

      <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 text-primary" />
          {tier.bottle_count} bottles per shipment
        </li>
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 text-primary" />
          {wineTypeLabel[tier.wine_type] || tier.wine_type}
        </li>
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 text-primary" />
          Free to join — no upfront cost
        </li>
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 text-primary" />
          {shipmentPct}% off your scheduled shipments
        </li>
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 text-primary" />
          {ALACARTE_PCT}% off à la carte purchases ({CASE_PCT}% on full cases of 12+)
        </li>
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 text-primary" />
          Cancel anytime
        </li>
      </ul>
      <p className="text-xs text-muted-foreground mb-4 italic">
        Discount not stackable with other offers or Subscribe &amp; Save.
      </p>

      <Button
        onClick={() => onSelect(tier)}
        variant={isSelected ? "default" : "outline"}
        className="w-full uppercase tracking-brand text-sm font-bold"
      >
        {isSelected ? "Selected" : "Join This Club"}
      </Button>
    </div>
  );
}
