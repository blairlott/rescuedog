import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Lock, Wine } from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "@/stores/cartStore";
import { useMyMembership } from "@/hooks/useWineClub";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  VS_FLAT_SHIPPING_USD,
  VS_MEMBER_DISCOUNT_PERCENT,
  VS_SHIPPING_THRESHOLD_BOTTLES,
  VS_SIMULATION,
} from "@/lib/vinoshipperConfig";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Simulated Vinoshipper-hosted checkout overlay.
 * Mimics the real VS cart screen so we can demo the full flow on iPhone
 * without Account ID / API keys yet. On "Place Order" it logs a fake
 * vinoshipper_webhook_logs row and clears the cart.
 */
export function VinoshipperCheckoutModal({ open, onOpenChange }: Props) {
  const { user } = useCustomerAuth();
  const { data: membership } = useMyMembership();
  const { items, clearCart } = useCartStore();

  const [ageOk, setAgeOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: user?.email ?? "",
    name: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    card: "4242 4242 4242 4242",
    exp: "12/29",
    cvc: "123",
  });

  const totalBottles = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce(
    (s, i) => s + parseFloat(i.price.amount) * i.quantity,
    0,
  );
  const isMember = !!membership && membership.status !== "cancelled";
  const memberDiscount = useMemo(
    () => (isMember ? subtotal * (VS_MEMBER_DISCOUNT_PERCENT / 100) : 0),
    [isMember, subtotal],
  );
  const shipping =
    totalBottles >= VS_SHIPPING_THRESHOLD_BOTTLES ? 0 : VS_FLAT_SHIPPING_USD;
  const tax = (subtotal - memberDiscount) * 0.07; // sim flat 7%
  const total = subtotal - memberDiscount + shipping + tax;

  const update = (k: keyof typeof form, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const placeOrder = async () => {
    if (!ageOk) {
      toast.error("Please confirm you are 21 or older");
      return;
    }
    setSubmitting(true);
    try {
      const fakeOrderId = `SIM-${Date.now()}`;
      const { error } = await supabase.from("vinoshipper_webhook_logs").insert({
        event: "order.created",
        subject: "order",
        identifier: fakeOrderId,
        payload: {
          simulated: true,
          order_id: fakeOrderId,
          customer_email: form.email,
          customer_id: membership?.vinoshipper_customer_id ?? null,
          line_items: items.map((i) => ({
            title: i.product.node.title,
            variant_id: i.variantId,
            quantity: i.quantity,
            unit_price: parseFloat(i.price.amount),
          })),
          totals: {
            subtotal: subtotal.toFixed(2),
            member_discount: memberDiscount.toFixed(2),
            shipping: shipping.toFixed(2),
            tax: tax.toFixed(2),
            total: total.toFixed(2),
          },
          ship_to: {
            name: form.name,
            address: form.address,
            city: form.city,
            state: form.state,
            zip: form.zip,
          },
        },
        notes: "Simulated checkout — Vinoshipper Injector not yet live",
      });
      if (error) throw error;
      toast.success("Order placed (simulated)", {
        description: `Order ${fakeOrderId} — total $${total.toFixed(2)}`,
      });
      clearCart();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Could not log simulated order", {
        description: e?.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Wine className="h-5 w-5 text-primary" />
            Vinoshipper Checkout
            {VS_SIMULATION && (
              <span className="text-[10px] uppercase tracking-brand bg-brand-gold/20 text-brand-gold px-2 py-0.5 rounded-sm">
                Simulation
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Wine orders are processed by Vinoshipper for compliance &
            payment. In simulation mode no card is charged.
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="border border-border p-3 text-sm space-y-1 bg-muted/30">
          {items.map((i) => (
            <div key={i.variantId} className="flex justify-between">
              <span className="truncate pr-2">
                {i.quantity}× {i.product.node.title}
              </span>
              <span>
                ${(parseFloat(i.price.amount) * i.quantity).toFixed(2)}
              </span>
            </div>
          ))}
          <div className="border-t border-border my-2" />
          <Row label="Subtotal" value={subtotal} />
          {isMember && (
            <Row
              label={`Member discount (${VS_MEMBER_DISCOUNT_PERCENT}%)`}
              value={-memberDiscount}
              accent
            />
          )}
          <Row
            label={
              shipping === 0
                ? "Shipping (included, 6+ bottles)"
                : "Shipping"
            }
            value={shipping}
          />
          <Row label="Tax (est.)" value={tax} />
          <div className="flex justify-between font-bold pt-1 border-t border-border">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

        {/* Ship to */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" value={form.email} onChange={(v) => update("email", v)} />
            <Field label="Full name" value={form.name} onChange={(v) => update("name", v)} />
          </div>
          <Field label="Street address" value={form.address} onChange={(v) => update("address", v)} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" value={form.city} onChange={(v) => update("city", v)} />
            <Field label="State" value={form.state} onChange={(v) => update("state", v)} />
            <Field label="ZIP" value={form.zip} onChange={(v) => update("zip", v)} />
          </div>
        </div>

        {/* Payment (fake) */}
        <div className="border border-border p-3 space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Card vaulted by Vinoshipper / Stripe
          </div>
          <Field label="Card number" value={form.card} onChange={(v) => update("card", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Exp" value={form.exp} onChange={(v) => update("exp", v)} />
            <Field label="CVC" value={form.cvc} onChange={(v) => update("cvc", v)} />
          </div>
        </div>

        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={ageOk}
            onCheckedChange={(c) => setAgeOk(!!c)}
          />
          <span>
            I confirm I am 21 or older and an adult will be available to sign
            for delivery.
          </span>
        </label>

        <Button
          onClick={placeOrder}
          disabled={submitting || items.length === 0}
          size="lg"
          className="w-full"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            `Place order — $${total.toFixed(2)}`
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${accent ? "text-primary font-semibold" : ""}`}
    >
      <span>{label}</span>
      <span>
        {value < 0 ? "-" : ""}${Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}