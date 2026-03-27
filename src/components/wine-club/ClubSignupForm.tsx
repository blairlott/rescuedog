import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { US_STATES } from "@/lib/usStates";
import type { WineClubTier, JoinClubData } from "@/hooks/useWineClub";
import { ArrowLeft, Wine } from "lucide-react";

const winePreferenceOptions = [
  "Bold Reds",
  "Light Reds",
  "Dry Whites",
  "Sweet Whites",
  "Sparkling",
  "Rosé",
];

interface ClubSignupFormProps {
  tier: WineClubTier;
  onBack: () => void;
  onSubmit: (data: JoinClubData) => void;
  isSubmitting: boolean;
}

export function ClubSignupForm({ tier, onBack, onSubmit, isSubmitting }: ClubSignupFormProps) {
  const [form, setForm] = useState({
    shipping_address_line1: "",
    shipping_address_line2: "",
    shipping_city: "",
    shipping_state: "",
    shipping_zip: "",
    is_gift: false,
    gift_message: "",
  });
  const [preferences, setPreferences] = useState<string[]>([]);

  const update = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const togglePref = (pref: string) =>
    setPreferences((prev) =>
      prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      tier_id: tier.id,
      shipping_address_line1: form.shipping_address_line1,
      shipping_address_line2: form.shipping_address_line2 || undefined,
      shipping_city: form.shipping_city,
      shipping_state: form.shipping_state,
      shipping_zip: form.shipping_zip,
      wine_preferences: preferences,
      is_gift: form.is_gift,
      gift_message: form.is_gift ? form.gift_message : undefined,
    });
  };

  const priceDisplay = `$${(tier.price_cents / 100).toFixed(0)}`;

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to tiers
      </button>

      {/* Selected Tier Summary */}
      <div className="border border-primary bg-primary/5 p-6 mb-8">
        <div className="flex items-center gap-3">
          <Wine className="h-8 w-8 text-primary" />
          <div>
            <h3 className="font-bold text-foreground">{tier.name}</h3>
            <p className="text-sm text-muted-foreground">
              {priceDisplay}/shipment · {tier.bottle_count} bottles
            </p>
          </div>
        </div>
      </div>

      {/* Shipping Address */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-foreground mb-4">Shipping Address</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="line1">Street Address *</Label>
            <Input
              id="line1"
              value={form.shipping_address_line1}
              onChange={(e) => update("shipping_address_line1", e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="line2">Apt / Suite / Unit</Label>
            <Input
              id="line2"
              value={form.shipping_address_line2}
              onChange={(e) => update("shipping_address_line2", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="col-span-2 md:col-span-1">
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                value={form.shipping_city}
                onChange={(e) => update("shipping_city", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="state">State *</Label>
              <Select value={form.shipping_state} onValueChange={(v) => update("shipping_state", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent>
                  {US_STATES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="zip">ZIP *</Label>
              <Input
                id="zip"
                value={form.shipping_zip}
                onChange={(e) => update("shipping_zip", e.target.value)}
                required
                maxLength={10}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Wine Preferences */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-foreground mb-2">Wine Preferences</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Help our AI curate the perfect selection for you. Select all that apply.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {winePreferenceOptions.map((pref) => (
            <label
              key={pref}
              className={`flex items-center gap-2 border p-3 cursor-pointer transition-colors ${
                preferences.includes(pref)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <Checkbox
                checked={preferences.includes(pref)}
                onCheckedChange={() => togglePref(pref)}
              />
              <span className="text-sm text-foreground">{pref}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Gift Option */}
      <div className="mb-8">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={form.is_gift}
            onCheckedChange={(checked) => update("is_gift", !!checked)}
          />
          <span className="text-sm font-bold text-foreground">This is a gift</span>
        </label>
        {form.is_gift && (
          <div className="mt-3">
            <Label htmlFor="gift_message">Gift Message</Label>
            <Textarea
              id="gift_message"
              value={form.gift_message}
              onChange={(e) => update("gift_message", e.target.value)}
              placeholder="Add a personal note..."
              rows={3}
            />
          </div>
        )}
      </div>

      {/* Payment Simulation Notice */}
      <div className="border border-brand-gold/30 bg-brand-gold/5 p-4 mb-8 text-sm">
        <p className="font-bold text-foreground mb-1">💳 Payment (Simulated)</p>
        <p className="text-muted-foreground">
          Payment processing is not yet live. Your membership will be created in simulation mode.
          You'll be charged {priceDisplay} per shipment once payments are enabled.
        </p>
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting || !form.shipping_address_line1 || !form.shipping_city || !form.shipping_state || !form.shipping_zip}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold py-6"
      >
        {isSubmitting ? "Joining..." : `Join ${tier.name}`}
      </Button>
    </form>
  );
}
