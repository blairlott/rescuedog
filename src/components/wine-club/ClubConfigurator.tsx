import { useState, useMemo, useEffect } from "react";
import { Wine, ArrowRight, Check, Percent, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { WineClubDisclaimer } from "@/components/WineClubDisclaimer";
import type { WineClubTier } from "@/hooks/useWineClub";

const frequencyOptions = [
  { value: "monthly", label: "Monthly", desc: "Every month" },
  { value: "quarterly", label: "Quarterly", desc: "Every 3 months" },
  { value: "bi-annual", label: "Bi-Annual", desc: "Twice a year" },
  { value: "yearly", label: "Yearly", desc: "Once a year (Holiday)" },
];

const wineTypeOptions = [
  { value: "mixed", label: "Mixed", desc: "Red, White & Sparkling" },
  { value: "red", label: "Red Only", desc: "Bold reds" },
  { value: "white_sparkling", label: "White & Sparkling", desc: "Crisp & bubbly" },
];

interface ClubConfiguratorProps {
  tiers: WineClubTier[];
  onSelect: (tier: WineClubTier) => void;
  isGift?: boolean;
  onGiftChange?: (isGift: boolean) => void;
}

export function ClubConfigurator({ tiers, onSelect, isGift = false, onGiftChange }: ClubConfiguratorProps) {
  const [frequency, setFrequency] = useState<string | null>(null);
  const [bottleCount, setBottleCount] = useState<number | null>(null);
  const [wineType, setWineType] = useState<string | null>(null);

  // Smart defaults: pick the most popular combo (Quarterly / 4 / Mixed) if the
  // tier catalog contains one. Falls back to the first available combination so
  // users land on a matched tier with zero clicks.
  useEffect(() => {
    if (!tiers?.length || frequency) return;
    const preferred =
      tiers.find(
        (t) => t.frequency === "quarterly" && t.bottle_count === 4 && t.wine_type === "mixed",
      ) ??
      tiers.find((t) => t.frequency === "quarterly") ??
      tiers[0];
    if (preferred) {
      setFrequency(preferred.frequency);
      setBottleCount(preferred.bottle_count);
      setWineType(preferred.wine_type);
    }
  }, [tiers, frequency]);

  // Derive available options based on selections
  const availableBottleCounts = useMemo(() => {
    if (!frequency) return [];
    const counts = [...new Set(tiers.filter(t => t.frequency === frequency).map(t => t.bottle_count))];
    return counts.sort((a, b) => a - b);
  }, [frequency, tiers]);

  const availableWineTypes = useMemo(() => {
    if (!frequency || !bottleCount) return [];
    return tiers
      .filter(t => t.frequency === frequency && t.bottle_count === bottleCount)
      .map(t => t.wine_type);
  }, [frequency, bottleCount, tiers]);

  const matchedTier = useMemo(() => {
    if (!frequency || !bottleCount || !wineType) return null;
    return tiers.find(
      t => t.frequency === frequency && t.bottle_count === bottleCount && t.wine_type === wineType
    ) || null;
  }, [frequency, bottleCount, wineType, tiers]);

  // When upstream changes, snap downstream to the closest available option
  // (don't wipe — users can keep iterating without re-picking everything).
  const handleFrequency = (val: string) => {
    setFrequency(val);
    const counts = [
      ...new Set(tiers.filter((t) => t.frequency === val).map((t) => t.bottle_count)),
    ].sort((a, b) => a - b);
    const nextCount =
      bottleCount && counts.includes(bottleCount)
        ? bottleCount
        : counts.find((c) => c >= (bottleCount ?? 0)) ?? counts[0] ?? null;
    if (nextCount !== bottleCount) setBottleCount(nextCount);
    const types = tiers
      .filter((t) => t.frequency === val && t.bottle_count === nextCount)
      .map((t) => t.wine_type);
    if (wineType && types.length && !types.includes(wineType)) {
      setWineType(types[0]);
    }
  };

  const handleBottleCount = (val: number) => {
    setBottleCount(val);
    const types = tiers
      .filter((t) => t.frequency === frequency && t.bottle_count === val)
      .map((t) => t.wine_type);
    if (wineType && types.length && !types.includes(wineType)) {
      setWineType(types[0]);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-center text-sm text-muted-foreground mb-8">
        We've pre-picked our most popular combo. Tweak any option below — your tier updates instantly.
      </p>

      {/* Gift toggle — surfaced up front so gifters know they're in the right flow */}
      {onGiftChange && (
        <div className="border border-border p-4 mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Gift className={`h-5 w-5 ${isGift ? "text-primary" : "text-muted-foreground"}`} />
            <div>
              <p className="text-sm font-bold text-foreground">Gifting this membership?</p>
              <p className="text-xs text-muted-foreground">
                We'll collect the recipient's name, email, and shipping address on the next step.
              </p>
            </div>
          </div>
          <Switch checked={isGift} onCheckedChange={onGiftChange} />
        </div>
      )}

      {/* Frequency */}
      <div className="mb-6">
        <p className="text-sm font-bold uppercase tracking-brand text-muted-foreground mb-3">Frequency</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {frequencyOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleFrequency(opt.value)}
              className={`p-4 border text-left transition-all ${
                frequency === opt.value
                  ? "border-primary bg-primary/5 ring-2 ring-primary"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <p className="font-bold text-foreground text-sm">{opt.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Bottle Count */}
      {frequency && availableBottleCounts.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-bold uppercase tracking-brand text-muted-foreground mb-3">Bottles per shipment</p>
          <div className="grid grid-cols-3 gap-3">
            {availableBottleCounts.map((count) => (
              <button
                key={count}
                onClick={() => handleBottleCount(count)}
                className={`p-4 border text-center transition-all ${
                  bottleCount === count
                    ? "border-primary bg-primary/5 ring-2 ring-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <p className="text-2xl font-bold text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground">bottles</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Wine Type */}
      {frequency && bottleCount && availableWineTypes.length > 0 && (
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-brand text-muted-foreground mb-3">Wine type</p>
          <div className="grid grid-cols-3 gap-3">
            {wineTypeOptions
              .filter((opt) => availableWineTypes.includes(opt.value))
              .map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setWineType(opt.value)}
                  className={`p-4 border text-center transition-all ${
                    wineType === opt.value
                      ? "border-primary bg-primary/5 ring-2 ring-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <p className="font-bold text-foreground text-sm">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Matched Tier Summary */}
      {matchedTier && (
        <div className="border-2 border-primary bg-primary/5 p-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <Wine className="h-8 w-8 text-primary flex-shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-foreground">{matchedTier.name}</h3>
                <p className="text-sm text-muted-foreground">{matchedTier.description}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded-sm uppercase tracking-brand flex-shrink-0">
              <Percent className="h-3 w-3" />
              {(matchedTier.shipment_discount_percent ?? matchedTier.discount_percent)}% Off Shipments
            </span>
          </div>

          <ul className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mb-4">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary flex-shrink-0" /> Free to join
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary flex-shrink-0" /> 20% off à la carte (25% on full cases)
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary flex-shrink-0" /> Shipping included on club shipments
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary flex-shrink-0" /> Cancel anytime
            </li>
          </ul>

          <p className="text-xs text-muted-foreground italic mb-4">
            Discount not stackable with other offers or Subscribe &amp; Save.
          </p>

          <WineClubDisclaimer variant="club" className="mb-4" />

          <div className="flex gap-3">
            <Button
              onClick={() => onSelect(matchedTier)}
              className="flex-1 uppercase tracking-brand text-sm font-bold gap-2"
            >
              Join This Club <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFrequency(null);
                setBottleCount(null);
                setWineType(null);
              }}
              className="uppercase tracking-brand text-sm font-bold"
            >
              Start Over
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
