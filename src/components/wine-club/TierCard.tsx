import { Wine, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WineClubTier } from "@/hooks/useWineClub";

const frequencyLabel: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  "bi-annual": "Bi-Annual",
  yearly: "Yearly",
};

const wineTypeLabel: Record<string, string> = {
  mixed: "Mixed",
  red: "Red Only",
  white_sparkling: "White & Sparkling",
};

interface TierCardProps {
  tier: WineClubTier;
  onSelect: (tier: WineClubTier) => void;
  isSelected?: boolean;
}

export function TierCard({ tier, onSelect, isSelected }: TierCardProps) {
  const priceDisplay = `$${(tier.price_cents / 100).toFixed(0)}`;

  return (
    <div
      className={`border p-6 flex flex-col transition-all ${
        isSelected
          ? "border-primary bg-primary/5 ring-2 ring-primary"
          : "border-border hover:border-primary/50"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Wine className="h-5 w-5 text-primary" />
        <span className="text-xs font-bold uppercase tracking-brand text-muted-foreground">
          {frequencyLabel[tier.frequency] || tier.frequency}
        </span>
      </div>

      <h3 className="text-lg font-bold text-foreground mb-1">{tier.name}</h3>
      <p className="text-sm text-muted-foreground mb-4 flex-1">{tier.description}</p>

      <div className="mb-4">
        <span className="text-3xl font-bold text-foreground">{priceDisplay}</span>
        <span className="text-sm text-muted-foreground ml-1">/ shipment</span>
      </div>

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
          AI-curated selections
        </li>
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 text-primary" />
          Customize before each shipment
        </li>
      </ul>

      <Button
        onClick={() => onSelect(tier)}
        variant={isSelected ? "default" : "outline"}
        className="w-full uppercase tracking-brand text-sm font-bold"
      >
        {isSelected ? "Selected" : "Select This Club"}
      </Button>
    </div>
  );
}
