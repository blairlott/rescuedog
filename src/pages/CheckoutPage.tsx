import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useCartStore, type CartItem } from "@/stores/cartStore";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";

const STRIPE_PK = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null;
const STRIPE_ENV: "sandbox" | "live" = STRIPE_PK?.startsWith("pk_live_") ? "live" : "sandbox";

type CustomerForm = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  date_of_birth: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
};

const EMPTY_FORM: CustomerForm = {
  email: "", first_name: "", last_name: "", phone: "", date_of_birth: "",
  address1: "", address2: "", city: "", state: "", zip: "",
};

function lineUnitCents(it: CartItem): number {
  return Math.round(parseFloat(it.price.amount) * 100);
}

function CheckoutInner({
  clientSecret,
  orderId,
  orderNumber,
  totalCents,
  onSuccess,
}: {
  clientSecret: string;
  orderId: string;
  orderNumber: string;
  totalCents: number;
  onSuccess: (orderNumber: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: { return_url: `${window.location.origin}/checkout?order=${orderId}` },
      });
      if (error) {
        toast.error(error.message ?? "Payment failed");
        setSubmitting(false);
        return;
      }
      // No redirect → call finalize directly.
      const { data, error: fnErr } = await supabase.functions.invoke("unified-checkout", {
        body: { action: "finalize", order_id: orderId, environment: STRIPE_ENV },
      });
      if (fnErr || !data?.ok) {
        toast.error("Payment captured but order finalization failed. Support has been notified.");
        setSubmitting(false);
        return;
      }
      onSuccess(orderNumber);
    } catch (err) {
      console.error(err);
      toast.error("Unexpected error during payment");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <Button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full h-12 text-base"
      >
        {submitting ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing…</>
        ) : (
          <>Pay ${(totalCents / 100).toFixed(2)}</>
        )}
      </Button>
      <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center">
        <ShieldCheck className="h-3.5 w-3.5" />
        Secure payment. Wine ships from our compliance partner Vinoshipper; merch ships from our US fulfillment partners.
      </p>
    </form>
  );
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { items, clearCart } = useCartStore();
  const { user } = useCustomerAuth();

  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [intent, setIntent] = useState<{
    clientSecret: string;
    orderId: string;
    orderNumber: string;
    totalCents: number;
  } | null>(null);

  useEffect(() => {
    if (user?.email && !form.email) setForm((f) => ({ ...f, email: user.email ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const wineItems = items.filter((i) => i.product.node.productKind === "wine");
  const merchItems = items.filter((i) => i.product.node.productKind !== "wine");
  const wineCents = wineItems.reduce((s, i) => s + lineUnitCents(i) * i.quantity, 0);
  const merchCents = merchItems.reduce((s, i) => s + lineUnitCents(i) * i.quantity, 0);
  // Tax + shipping calc deferred to backend (keeping client display simple).
  const subtotalCents = wineCents + merchCents;

  const canSubmit = useMemo(() => {
    return (
      form.email && form.first_name && form.last_name &&
      form.address1 && form.city && form.state.length === 2 && form.zip &&
      items.length > 0
    );
  }, [form, items.length]);

  if (items.length === 0 && !intent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-2xl font-bold">Your cart is empty</h1>
          <p className="text-muted-foreground">Add some wine or merch before checking out.</p>
          <Button onClick={() => navigate("/shop")}>Shop wine</Button>
        </div>
      </div>
    );
  }

  const handleStartIntent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setCreating(true);
    try {
      const ageVerified = (() => {
        try { return localStorage.getItem("rdw_age_verified") === "true"; } catch { return false; }
      })();

      const { data, error } = await supabase.functions.invoke("unified-checkout", {
        body: {
          action: "create-intent",
          environment: STRIPE_ENV,
          customer: {
            email: form.email,
            first_name: form.first_name,
            last_name: form.last_name,
            phone: form.phone || null,
            date_of_birth: form.date_of_birth || null,
          },
          shipping: {
            address1: form.address1,
            address2: form.address2 || null,
            city: form.city,
            state: form.state.toUpperCase(),
            zip: form.zip,
            country: "US",
          },
          items: items.map((i) => ({
            product_kind: i.product.node.productKind === "wine" ? "wine" : "merch",
            product_id: null, // wine_products / merch_products UUID lookup TODO
            vinoshipper_product_id: (i.product.node as any).vinoshipperProductId ?? null,
            product_name: i.product.node.title,
            product_sku: i.variantId,
            variant_name: i.variantTitle,
            quantity: i.quantity,
            unit_price_cents: lineUnitCents(i),
          })),
          shipping_cents: 0,
          tax_cents: 0,
          age_verified: ageVerified || wineItems.length === 0,
          user_id: user?.id ?? null,
        },
      });

      if (error || !data?.client_secret) {
        console.error("create-intent failed", error, data);
        toast.error(data?.error ?? "Could not start checkout. Please try again.");
        setCreating(false);
        return;
      }
      setIntent({
        clientSecret: data.client_secret,
        orderId: data.order_id,
        orderNumber: data.order_number,
        totalCents: data.amount_cents,
      });
    } catch (err) {
      console.error(err);
      toast.error("Unexpected error. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const onSuccess = (orderNumber: string) => {
    const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
    const wineBottles = wineItems.reduce((s, i) => s + i.quantity, 0);
    const merchUnits = merchItems.reduce((s, i) => s + i.quantity, 0);
    const totalDollars = (subtotalCents / 100).toFixed(2);
    clearCart();
    navigate(`/thank-you?order=${encodeURIComponent(orderNumber)}&total=${totalDollars}&bottles=${wineBottles}&units=${merchUnits - wineBottles}`);
  };

  if (!stripePromise) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-destructive">Payments are not configured. Please contact support.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8">
        {/* LEFT: form / payment */}
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">Checkout</h1>

          {!intent && (
            <form onSubmit={handleStartIntent} className="space-y-6">
              <section className="space-y-3">
                <h2 className="font-semibold text-lg">Contact</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" required value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="first">First name</Label>
                    <Input id="first" required value={form.first_name}
                      onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="last">Last name</Label>
                    <Input id="last" required value={form.last_name}
                      onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" type="tel" value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  {wineItems.length > 0 && (
                    <div>
                      <Label htmlFor="dob">Date of birth (21+)</Label>
                      <Input id="dob" type="date" required value={form.date_of_birth}
                        onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="font-semibold text-lg">Shipping address</h2>
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                  <div className="sm:col-span-6">
                    <Label htmlFor="addr1">Address</Label>
                    <Input id="addr1" required value={form.address1}
                      onChange={(e) => setForm({ ...form, address1: e.target.value })} />
                  </div>
                  <div className="sm:col-span-6">
                    <Label htmlFor="addr2">Apt, suite, etc. (optional)</Label>
                    <Input id="addr2" value={form.address2}
                      onChange={(e) => setForm({ ...form, address2: e.target.value })} />
                  </div>
                  <div className="sm:col-span-3">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" required value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </div>
                  <div className="sm:col-span-1">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" required maxLength={2} placeholder="CA" value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="zip">ZIP</Label>
                    <Input id="zip" required value={form.zip}
                      onChange={(e) => setForm({ ...form, zip: e.target.value })} />
                  </div>
                </div>
              </section>

              <Button type="submit" className="w-full h-12 text-base" disabled={!canSubmit || creating}>
                {creating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparing checkout…</>
                ) : (
                  <>Continue to payment</>
                )}
              </Button>
            </form>
          )}

          {intent && (
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">Payment</h2>
              <p className="text-sm text-muted-foreground">
                Order <span className="font-mono">{intent.orderNumber}</span> — one charge, single confirmation.
              </p>
              <Elements
                stripe={stripePromise}
                options={{ clientSecret: intent.clientSecret, appearance: { theme: "stripe" } }}
              >
                <CheckoutInner
                  clientSecret={intent.clientSecret}
                  orderId={intent.orderId}
                  orderNumber={intent.orderNumber}
                  totalCents={intent.totalCents}
                  onSuccess={onSuccess}
                />
              </Elements>
            </section>
          )}
        </div>

        {/* RIGHT: order summary */}
        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start border bg-card p-6">
          <h2 className="font-semibold text-lg">Order summary</h2>
          <ul className="space-y-3">
            {items.map((it) => (
              <li key={it.variantId} className="flex justify-between gap-3 text-sm">
                <div className="flex-1">
                  <p className="font-medium">{it.product.node.title}</p>
                  {it.variantTitle && it.variantTitle !== "Default Title" && (
                    <p className="text-xs text-muted-foreground">{it.variantTitle}</p>
                  )}
                  <p className="text-xs text-muted-foreground">Qty {it.quantity}</p>
                </div>
                <span className="font-mono">${(lineUnitCents(it) * it.quantity / 100).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <Separator />
          {wineCents > 0 && (
            <div className="flex justify-between text-sm">
              <span>Wine subtotal</span>
              <span className="font-mono">${(wineCents / 100).toFixed(2)}</span>
            </div>
          )}
          {merchCents > 0 && (
            <div className="flex justify-between text-sm">
              <span>Merch subtotal</span>
              <span className="font-mono">${(merchCents / 100).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Shipping &amp; tax</span>
            <span>Calculated at next step</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold text-lg">
            <span>Total</span>
            <span className="font-mono">${(subtotalCents / 100).toFixed(2)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            One card. One charge. Wine ships via our compliance partner Vinoshipper; merch ships from our US fulfillment partners.
          </p>
        </aside>
      </div>
    </div>
  );
}