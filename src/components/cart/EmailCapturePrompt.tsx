import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useCartStore } from "@/stores/cartStore";
import { toast } from "sonner";

const KEY = "rdw_email_prompt_state";

/**
 * Shows once after the customer's first add-to-cart. Captures email into
 * `cart_abandonments` so Mailchimp can fire the abandonment series if they
 * leave without checking out. Logged-in customers are skipped.
 */
export function EmailCapturePrompt() {
  const { user } = useCustomerAuth();
  const items = useCartStore(s => s.items);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) return;
    if (items.length === 0) return;
    let state: { dismissed?: boolean; captured?: boolean } = {};
    try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
    if (state.dismissed || state.captured) return;
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [items.length, user]);

  const dismiss = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ dismissed: true, at: Date.now() })); } catch {}
    setOpen(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) { toast.error("Enter a valid email"); return; }
    setSubmitting(true);
    try {
      await supabase.from("cart_abandonments").insert({
        email,
        items: items.map(i => ({
          handle: i.product.node.handle,
          title: i.product.node.title,
          variant_id: i.variantId,
          quantity: i.quantity,
          unit_price: parseFloat(i.price.amount),
        })),
        subtotal_cents: Math.round(items.reduce((s, i) => s + parseFloat(i.price.amount) * i.quantity, 0) * 100),
        total_bottles: items.reduce((s, i) => s + i.quantity, 0),
        status: "email_captured",
        source: "soft_prompt",
      });
      supabase.functions.invoke("pack-subscribe", {
        body: { email, source: "cart_email_capture" },
      }).catch((err) => console.warn("[pack-subscribe] mailchimp sync failed", err));
      try { localStorage.setItem(KEY, JSON.stringify({ captured: true, email, at: Date.now() })); } catch {}
      toast.success("Saved! We'll hold your cart.");
      setOpen(false);
    } catch (err: any) {
      toast.error("Couldn't save", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-sm z-[60] bg-background border border-foreground shadow-lg p-4 pr-10 relative">
      <button type="button" onClick={dismiss} aria-label="Close" className="absolute top-2 right-2 p-2 text-muted-foreground hover:text-foreground z-20 cursor-pointer">
        <X className="h-4 w-4" />
      </button>
      <p className="text-xs uppercase tracking-brand font-bold text-primary mb-1">Hold my cart</p>
      <p className="text-sm text-foreground mb-3">
        Drop your email and we'll save your cart — plus send a code for your first order.
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          required
        />
        <button
          type="submit"
          disabled={submitting}
          className="bg-primary text-primary-foreground text-xs font-bold uppercase tracking-brand px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? "…" : "Save"}
        </button>
      </form>
      <button onClick={dismiss} className="mt-2 text-[10px] uppercase tracking-brand text-muted-foreground hover:text-foreground">
        No thanks
      </button>
    </div>
  );
}