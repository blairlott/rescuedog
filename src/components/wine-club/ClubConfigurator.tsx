import { useState, useMemo } from "react";
import { Wine, ArrowRight, Check, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
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
}

export function ClubConfigurator({ tiers, onSelect }: ClubConfiguratorProps) {
  const [frequency, setFrequency] = useState<string | null>(null);
  const [bottleCount, setBottleCount] = useState<number | null>(null);
  const [wineType, setWineType] = useState<string | null>(null);

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

  // Reset downstream when upstream changes
  const handleFrequency = (val: string) => {
    setFrequency(val);
    setBottleCount(null);
    setWineType(null);
  };

  const handleBottleCount = (val: number) => {
    setBottleCount(val);
    setWineType(null);
  };

  const currentStep = !frequency ? 1 : !bottleCount ? 2 : !wineType ? 3 : 4;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 mb-10">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                currentStep > step
                  ? "bg-primary text-primary-foreground"
                  : currentStep === step
                  ? "bg-primary/10 text-primary border-2 border-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {currentStep > step ? <Check className="h-4 w-4" /> : step}
            </div>
            {step < 3 && (
              <div className={`w-12 h-0.5 ${currentStep > step ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Frequency */}
      <div className="mb-8">
        <h3 className="text-sm font-bold uppercase tracking-brand text-muted-foreground mb-1">
          Step 1
        </h3>
        <p className="text-lg font-bold text-foreground mb-4">How often do you want wine delivered?</p>
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

      {/* Step 2: Bottle Count */}
      {frequency && (
        <div className="mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <h3 className="text-sm font-bold uppercase tracking-brand text-muted-foreground mb-1">
            Step 2
          </h3>
          <p className="text-lg font-bold text-foreground mb-4">How many bottles per shipment?</p>
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

      {/* Step 3: Wine Type */}
      {frequency && bottleCount && (
        <div className="mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <h3 className="text-sm font-bold uppercase tracking-brand text-muted-foreground mb-1">
            Step 3
          </h3>
          <p className="text-lg font-bold text-foreground mb-4">What type of wine do you prefer?</p>
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
              {matchedTier.discount_percent}% Off
            </span>
          </div>

          <ul className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mb-4">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary flex-shrink-0" /> Free to join
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary flex-shrink-0" /> {matchedTier.discount_percent}% off à la carte orders
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
