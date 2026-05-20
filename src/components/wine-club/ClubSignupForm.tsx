import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { US_STATES } from "@/lib/usStates";
import type { WineClubTier, JoinClubData } from "@/hooks/useWineClub";
import { ArrowLeft, Wine, Gift, Percent, ShieldCheck, AlertTriangle } from "lucide-react";
import { VinoshipperClubHandoff } from "./VinoshipperClubHandoff";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";

interface ClubSignupFormProps {
  tier: WineClubTier;
  onBack: () => void;
  onSubmit: (data: JoinClubData) => void;
  isSubmitting: boolean;
}

export function ClubSignupForm({ tier, onBack, onSubmit, isSubmitting }: ClubSignupFormProps) {
  const { user } = useCustomerAuth();
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [form, setForm] = useState({
    shipping_address_line1: "",
    shipping_address_line2: "",
    shipping_city: "",
    shipping_state: "",
    shipping_zip: "",
    is_gift: false,
    gift_message: "",
    gift_recipient_name: "",
    gift_recipient_email: "",
  });

  const update = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Persist a local membership draft so we capture gift data, address,
    // etc. Vinoshipper owns card capture + recurring billing, and members
    // customize each release via the link Vinoshipper emails them.
    onSubmit({
      tier_id: tier.id,
      shipping_address_line1: form.shipping_address_line1,
      shipping_address_line2: form.shipping_address_line2 || undefined,
      shipping_city: form.shipping_city,
      shipping_state: form.shipping_state,
      shipping_zip: form.shipping_zip,
      is_gift: form.is_gift,
      gift_message: form.is_gift ? form.gift_message : undefined,
    });

    // If this tier is linked to a Vinoshipper Club, immediately open the
    // inline VS handoff so the customer can enter card-on-file without
    // leaving /club.
    if (tier.vinoshipper_join_url) {
      setHandoffOpen(true);
    }
  };

  const frequencyLabel: Record<string, string> = {
    monthly: "Monthly",
    quarterly: "Quarterly",
    "bi-annual": "Bi-Annual",
    yearly: "Yearly",
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to club selection
      </button>

      {/* Selected Tier Summary */}
      <div className="border border-primary bg-primary/5 p-6 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wine className="h-8 w-8 text-primary" />
            <div>
              <h3 className="font-bold text-foreground">{tier.name}</h3>
              <p className="text-sm text-muted-foreground">
                {tier.bottle_count} bottles · {frequencyLabel[tier.frequency] || tier.frequency}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded-sm uppercase tracking-brand">
            <Percent className="h-3 w-3" />
            {tier.discount_percent}% Off
          </span>
        </div>
      </div>

      {/* Gift Toggle */}
      <div className="border border-border p-5 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Gift className={`h-5 w-5 ${form.is_gift ? "text-primary" : "text-muted-foreground"}`} />
            <div>
              <p className="text-sm font-bold text-foreground">Gift a Membership</p>
              <p className="text-xs text-muted-foreground">Send this wine club membership to someone special</p>
            </div>
          </div>
          <Switch
            checked={form.is_gift}
            onCheckedChange={(checked) => update("is_gift", checked)}
          />
        </div>

        {form.is_gift && (
          <div className="mt-4 pt-4 border-t border-border space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="gift_name">Recipient's Name *</Label>
                <Input
                  id="gift_name"
                  value={form.gift_recipient_name}
                  onChange={(e) => update("gift_recipient_name", e.target.value)}
                  placeholder="Their full name"
                  required={form.is_gift}
                />
              </div>
              <div>
                <Label htmlFor="gift_email">Recipient's Email *</Label>
                <Input
                  id="gift_email"
                  type="email"
                  value={form.gift_recipient_email}
                  onChange={(e) => update("gift_recipient_email", e.target.value)}
                  placeholder="their@email.com"
                  required={form.is_gift}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="gift_message">Gift Message (optional)</Label>
              <Textarea
                id="gift_message"
                value={form.gift_message}
                onChange={(e) => update("gift_message", e.target.value)}
                placeholder="Add a personal note to your gift..."
                rows={3}
              />
            </div>
          </div>
        )}
      </div>

      {/* Shipping Address */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-foreground mb-1">
          {form.is_gift ? "Recipient's Shipping Address" : "Shipping Address"}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          {form.is_gift
            ? "Where should we ship the wine to your gift recipient?"
            : "Where should we deliver your club shipments?"}
        </p>
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

      {/* Customization note — sets expectation that Vinoshipper emails the customization link */}
      <div className="mb-8 border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Before each release, Vinoshipper will email you a link to your customization page where you can swap or adjust wines before the deadline.
      </div>

      {/* Name (used to prefill the Vinoshipper payment step) */}
      {tier.vinoshipper_join_url && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div>
            <Label htmlFor="first_name">First Name *</Label>
            <Input
              id="first_name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="last_name">Last Name *</Label>
            <Input
              id="last_name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
        </div>
      )}

      {/* Payment notice */}
      {tier.vinoshipper_join_url ? (
        <div className="border border-border bg-muted/30 p-4 mb-8 text-sm flex gap-3">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-foreground mb-1">Secure card on file</p>
            <p className="text-muted-foreground text-xs">
              After you continue, our compliance & shipping partner (Vinoshipper)
              will open a secure payment step right here on this page to save your
              card. Future club shipments ship and bill automatically.
            </p>
          </div>
        </div>
      ) : (
        <div className="border border-brand-gold/30 bg-brand-gold/5 p-4 mb-8 text-sm flex gap-3">
          <AlertTriangle className="h-5 w-5 text-brand-gold shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-foreground mb-1">Payment setup pending</p>
            <p className="text-muted-foreground text-xs">
              This tier isn't fully linked to Vinoshipper yet. Your preferences
              and shipping address will be saved, and our team will reach out to
              complete payment setup before your first shipment.
            </p>
          </div>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={
          isSubmitting ||
          !form.shipping_address_line1 ||
          !form.shipping_city ||
          !form.shipping_state ||
          !form.shipping_zip ||
          (!!tier.vinoshipper_join_url && (!firstName || !lastName)) ||
          (form.is_gift && (!form.gift_recipient_name || !form.gift_recipient_email))
        }
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold py-6"
      >
        {isSubmitting
          ? "Processing..."
          : tier.vinoshipper_join_url
          ? `Continue to Secure Payment`
          : form.is_gift
          ? `Gift ${tier.name}`
          : `Join ${tier.name}`}
      </Button>

      {tier.vinoshipper_join_url && (
        <VinoshipperClubHandoff
          open={handoffOpen}
          onClose={() => setHandoffOpen(false)}
          joinUrl={tier.vinoshipper_join_url}
          tierName={tier.name}
          prefill={{
            email: user?.email ?? undefined,
            firstName,
            lastName,
            address1: form.shipping_address_line1,
            address2: form.shipping_address_line2,
            city: form.shipping_city,
            state: form.shipping_state,
            zip: form.shipping_zip,
          }}
        />
      )}
    </form>
  );
}
