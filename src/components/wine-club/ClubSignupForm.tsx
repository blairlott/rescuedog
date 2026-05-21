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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface ClubSignupFormProps {
  tier: WineClubTier;
  onBack: () => void;
  onSubmit: (data: JoinClubData) => void;
  isSubmitting: boolean;
  /** When true, the gift toggle is hidden and is_gift is always true (used by existing members adding a gift). */
  lockGift?: boolean;
  /** Optional override for the back button label. */
  backLabel?: string;
}

export function ClubSignupForm({ tier, onBack, onSubmit, isSubmitting, lockGift = false, backLabel }: ClubSignupFormProps) {
  const { user } = useCustomerAuth();
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<JoinClubData | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [form, setForm] = useState({
    shipping_address_line1: "",
    shipping_address_line2: "",
    shipping_city: "",
    shipping_state: "",
    shipping_zip: "",
    is_gift: lockGift,
    gift_message: "",
    gift_recipient_name: "",
    gift_recipient_email: "",
  });

  const update = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // No account yet? Create one inline before saving the membership.
    if (!user) {
      if (!email || !password) {
        toast.error("Please enter your email and password");
        return;
      }
      if (password.length < 6) {
        toast.error("Password must be at least 6 characters");
        return;
      }
      setCreatingAccount(true);
      try {
        const { data: sd, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/club`,
            data: firstName || lastName
              ? { full_name: `${firstName} ${lastName}`.trim() }
              : undefined,
          },
        });
        if (error) {
          // Former members already have an account. Try signing them in
          // with the provided password so they can rejoin without leaving
          // the page.
          const looksLikeExisting =
            /registered|exists|already/i.test(error.message);
          if (looksLikeExisting) {
            const { error: signInErr } = await supabase.auth.signInWithPassword({
              email,
              password,
            });
            if (signInErr) {
              toast.error(
                "You already have an account with this email. Sign in to rejoin, or use the password you set previously.",
              );
              setCreatingAccount(false);
              return;
            }
            // Signed in — fall through and submit the membership.
            await new Promise((r) => setTimeout(r, 400));
          } else {
            toast.error(error.message);
            setCreatingAccount(false);
            return;
          }
        } else {
          if (!sd.session) {
            toast.info(
              "Check your email to confirm your account, then come back to finish joining.",
            );
            setCreatingAccount(false);
            return;
          }
          // Let the auth context propagate before submitting so useJoinClub
          // sees the new user.
          await new Promise((r) => setTimeout(r, 400));
        }
      } catch (err: any) {
        toast.error(err?.message || "Could not create account");
        setCreatingAccount(false);
        return;
      }
      setCreatingAccount(false);
    }

    // Build the membership payload but DO NOT persist it yet. We require
    // the customer to complete Vinoshipper card capture first — otherwise
    // we end up with a membership row in our DB that has no card on file
    // and no recurring billing in Vinoshipper.
    const payload: JoinClubData = {
      tier_id: tier.id,
      // For self-signup these stay blank — Vinoshipper captures the real
      // address during card-on-file. For gifts we collect the recipient
      // address above and pass it through here.
      shipping_address_line1: form.shipping_address_line1 || undefined,
      shipping_address_line2: form.shipping_address_line2 || undefined,
      shipping_city: form.shipping_city || undefined,
      shipping_state: form.shipping_state || undefined,
      shipping_zip: form.shipping_zip || undefined,
      is_gift: form.is_gift,
      gift_message: form.is_gift ? form.gift_message : undefined,
      gift_recipient_name: form.is_gift ? form.gift_recipient_name : undefined,
      gift_recipient_email: form.is_gift ? form.gift_recipient_email : undefined,
    };

    if (!tier.vinoshipper_join_url) {
      toast.error(
        "This club tier isn't connected to our payment partner yet. Please choose a different tier or contact us to finish setup.",
      );
      return;
    }

    setPendingSubmit(payload);
    setHandoffOpen(true);
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
        <ArrowLeft className="h-4 w-4" /> {backLabel ?? "Back to club selection"}
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

      {/* Gift Toggle (hidden when adding a gift from the member dashboard) */}
      {!lockGift && (
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
      )}

      {/* Locked-gift recipient inputs (member adding a gift) */}
      {lockGift && (
        <div className="border border-primary bg-primary/5 p-5 mb-8 space-y-4">
          <div className="flex items-center gap-3">
            <Gift className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-bold text-foreground">Gift Recipient</p>
              <p className="text-xs text-muted-foreground">Who is this membership for?</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="gift_name">Recipient's Name *</Label>
              <Input
                id="gift_name"
                value={form.gift_recipient_name}
                onChange={(e) => update("gift_recipient_name", e.target.value)}
                placeholder="Their full name"
                required
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
                required
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

      {/* Shipping Address — only required for gifts (we need recipient's address).
          For self-signup, Vinoshipper collects the shipping address during card
          capture, so we skip it here to cut click fatigue. */}
      {form.is_gift && (
      <div className="mb-8">
        <h3 className="text-lg font-bold text-foreground mb-1">Recipient's Shipping Address</h3>
        <p className="text-xs text-muted-foreground mb-4">Where should we ship the wine to your gift recipient?</p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="line1">Street Address *</Label>
            <Input
              id="line1"
              value={form.shipping_address_line1}
              onChange={(e) => update("shipping_address_line1", e.target.value)}
              required={form.is_gift}
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
                required={form.is_gift}
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
                required={form.is_gift}
                maxLength={10}
              />
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Customization note — sets expectation that Vinoshipper emails the customization link */}
      <div className="mb-8 border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Before each release, Vinoshipper will email you a link to your customization page where you can swap or adjust wines before the deadline.
      </div>

      {/* Name fields removed — Vinoshipper collects them during card capture.
          For gifts we still want the recipient's name (captured above) but the
          giver's name is optional and Vinoshipper will prompt for it. */}

      {/* Inline account creation for guests */}
      {!user && (
        <div className="border border-border bg-muted/30 p-5 mb-8 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground uppercase tracking-brand">
              Create your account
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              We'll create your Rescue Dog Wines account as you join — used for
              order history, shipment customization, and secure payment with our
              compliance partner Vinoshipper.{" "}
              <Link
                to="/login?redirect=/club"
                className="underline hover:text-foreground"
              >
                Already have an account? Sign in
              </Link>
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="signup_email">Email *</Label>
              <Input
                id="signup_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="signup_password">Password *</Label>
              <Input
                id="signup_password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="At least 6 characters"
              />
            </div>
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
              will open a secure payment step right here on this page to save
              your card. <strong>A card on file is required</strong> — your
              membership is not active until card capture is complete. Future
              club shipments ship and bill automatically.
            </p>
          </div>
        </div>
      ) : (
        <div className="border border-brand-gold/30 bg-brand-gold/5 p-4 mb-8 text-sm flex gap-3">
          <AlertTriangle className="h-5 w-5 text-brand-gold shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-foreground mb-1">Tier not yet available</p>
            <p className="text-muted-foreground text-xs">
              This tier isn't connected to our secure payment partner yet, so
              we can't take card-on-file. Please pick a different tier or
              contact us — we'll finish setup and reach out when it's ready.
            </p>
          </div>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={
          isSubmitting ||
          creatingAccount ||
          !tier.vinoshipper_join_url ||
          (form.is_gift &&
            (!form.shipping_address_line1 ||
              !form.shipping_city ||
              !form.shipping_state ||
              !form.shipping_zip)) ||
          (!user && (!email || !password)) ||
          (form.is_gift && (!form.gift_recipient_name || !form.gift_recipient_email))
        }
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold py-6"
      >
        {creatingAccount
          ? "Creating your account..."
          : isSubmitting
          ? "Processing..."
          : !tier.vinoshipper_join_url
          ? "Choose another tier"
          : tier.vinoshipper_join_url
          ? `Continue to Secure Payment`
          : form.is_gift
          ? `Gift ${tier.name}`
          : `Join ${tier.name}`}
      </Button>

      {tier.vinoshipper_join_url && (
        <VinoshipperClubHandoff
          open={handoffOpen}
          onClose={() => {
            setHandoffOpen(false);
            // If they closed without confirming card capture, drop the
            // pending payload so we don't accidentally persist it later.
            setPendingSubmit(null);
          }}
          onCompleted={() => {
            if (pendingSubmit) {
              onSubmit(pendingSubmit);
              setPendingSubmit(null);
            }
          }}
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
