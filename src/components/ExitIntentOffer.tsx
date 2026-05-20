import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Heart, Copy } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { saveSignupPromo, SIGNUP_PROMO_CODE } from "@/lib/signupPromo";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";

const KEY = "rdw_exit_intent_seen";
const CODE = SIGNUP_PROMO_CODE;

/**
 * Exit-intent recovery offer. Fires once per session when the user moves
 * the cursor toward the browser chrome (desktop) or after 30s of inactivity
 * with intent-to-leave signals on mobile (rough proxy: visibilitychange to
 * hidden after they've been on a wine route 20s+).
 */
export function ExitIntentOffer() {
  const { user } = useCustomerAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Only on consumer-facing routes (skip CRM/CMS/checkout).
    const path = location.pathname.toLowerCase();
    if (path.startsWith("/crm") || path.startsWith("/cms")) return;
    if (path.startsWith("/checkout") || path.startsWith("/thank-you")) return;

    // QA / preview trigger — append ?_previewExitOffer=1 to any consumer URL.
    if (new URLSearchParams(location.search).get("_previewExitOffer") === "1") {
      setOpen(true);
      return;
    }

    // Don't show to returning customers — logged-in users, anyone who's
    // already signed up for the newsletter (code stored), or anyone with
    // a prior order recorded in this browser.
    if (user) return;
    try {
      if (localStorage.getItem("rdw_signup_promo")) return;
      if (localStorage.getItem("rdw_returning_customer") === "true") return;
    } catch {}

    if (sessionStorage.getItem(KEY) === "true") return;

    let armed = false;
    const armTimer = window.setTimeout(() => { armed = true; }, 8000);

    const handleMouseLeave = (e: MouseEvent) => {
      if (!armed) return;
      if (e.clientY <= 0 && sessionStorage.getItem(KEY) !== "true") {
        sessionStorage.setItem(KEY, "true");
        setOpen(true);
      }
    };

    let hiddenTimer: number | undefined;
    const handleVisibility = () => {
      if (!armed) return;
      if (document.visibilityState === "hidden") {
        hiddenTimer = window.setTimeout(() => {
          if (sessionStorage.getItem(KEY) !== "true") {
            sessionStorage.setItem(KEY, "true");
            setOpen(true);
          }
        }, 200);
      } else if (hiddenTimer) {
        clearTimeout(hiddenTimer);
      }
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearTimeout(armTimer);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [location.pathname, location.search, user]);

  const copyCode = () => {
    navigator.clipboard?.writeText(CODE);
    toast.success(`Code ${CODE} copied`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    setSubmitting(true);
    try {
      await supabase.from("cart_abandonments").insert({
        email,
        items: [],
        subtotal_cents: 0,
        total_bottles: 0,
        status: "email_captured",
        source: "exit_intent_newsletter",
      });
      supabase.functions.invoke("pack-subscribe", {
        body: { email, source: "exit_intent_offer" },
      }).catch((err) => console.warn("[pack-subscribe] mailchimp sync failed", err));
      saveSignupPromo(email);
      setRevealed(true);
      copyCode();
      toast.success("You're on the list — code copied & saved for checkout!");
    } catch (err: any) {
      toast.error("Couldn't sign you up", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <div className="text-center space-y-4 pt-2">
          <Heart className="h-10 w-10 text-primary mx-auto" />
          <h2 className="font-display text-2xl font-bold uppercase tracking-brand">
            Wait — before you go
          </h2>
          {!revealed ? (
            <>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Join our email list for <strong>10% off your first order</strong>, new releases, and stories from the rescues we support.
              </p>
              <p className="text-xs text-primary font-bold uppercase tracking-brand leading-snug">
                Every order helps fund a rescue partner.
              </p>
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-foreground bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={submitting}
                  className="w-full uppercase tracking-brand text-sm font-bold"
                >
                  {submitting ? "Signing up…" : "Sign up & reveal code"}
                </Button>
              </form>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                One-time 10% off code for new customers. Unsubscribe anytime.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You're on the list. Use this code at checkout for <strong>10% off your first order</strong>.
              </p>
              <button
                onClick={copyCode}
                className="w-full border-2 border-dashed border-primary bg-primary/5 py-3 px-4 flex items-center justify-center gap-2 hover:bg-primary/10 transition"
                type="button"
              >
                <span className="font-mono font-bold text-lg text-primary">{CODE}</span>
                <Copy className="h-4 w-4 text-primary" />
              </button>
              <Button
                onClick={() => { copyCode(); setOpen(false); }}
                size="lg"
                className="w-full uppercase tracking-brand text-sm font-bold"
              >
                Apply at checkout
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            No thanks
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}