import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PawPrint } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";

const SHOWN_KEY = "rdw_pack_popup_seen";
const SHARED_DISMISS_KEY = "rdw_email_capture_dismissed"; // shared w/ exit intent
const DELAY_MS = 10_000;

/**
 * Homepage-only "Join The Pack" signup popup. Fires once per browser, 10s
 * after landing on "/". Access-framed (early releases + rescue stories),
 * never a discount — that lane belongs to ExitIntentOffer.
 *
 * Suppressed for: logged-in customers, anyone who already saw it, anyone
 * who already dismissed the exit-intent offer, returning customers, and
 * users on non-homepage routes.
 */
export function PackSignupPopup() {
  const { user } = useCustomerAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/") return;

    // Preview override: ?_previewPackPopup=1
    if (new URLSearchParams(location.search).get("_previewPackPopup") === "1") {
      setOpen(true);
      return;
    }

    if (user) return;
    try {
      if (localStorage.getItem(SHOWN_KEY) === "true") return;
      if (localStorage.getItem(SHARED_DISMISS_KEY) === "true") return;
      if (localStorage.getItem("rdw_signup_promo")) return;
      if (localStorage.getItem("rdw_returning_customer") === "true") return;
    } catch {}

    const t = window.setTimeout(() => {
      try { localStorage.setItem(SHOWN_KEY, "true"); } catch {}
      setOpen(true);
    }, DELAY_MS);

    return () => clearTimeout(t);
  }, [location.pathname, location.search, user]);

  const dismiss = () => {
    try { localStorage.setItem(SHARED_DISMISS_KEY, "true"); } catch {}
    setOpen(false);
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
        source: "pack_signup_popup",
      });
      // Push to Mailchimp (best-effort; failure shouldn't block UX)
      supabase.functions.invoke("pack-subscribe", {
        body: { email, source: "pack_signup_popup" },
      }).catch((err) => console.warn("[pack-subscribe] mailchimp sync failed", err));
      try { localStorage.setItem(SHARED_DISMISS_KEY, "true"); } catch {}
      setDone(true);
      toast.success("Welcome to The Pack");
    } catch (err: any) {
      toast.error("Couldn't sign you up", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
      <DialogContent className="max-w-md">
        <div className="text-center space-y-4 pt-2">
          <PawPrint className="h-10 w-10 text-primary mx-auto" />
          <h2 className="font-display text-2xl font-bold uppercase tracking-brand">
            Join The Pack
          </h2>
          {!done ? (
            <>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Early access to new releases, allocation drops, and stories from the rescues we support. No spam — just the good stuff.
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
                  {submitting ? "Joining…" : "Join The Pack"}
                </Button>
              </form>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Unsubscribe anytime.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You're in. Keep an eye on your inbox for the next release.
              </p>
              <Button
                onClick={() => setOpen(false)}
                size="lg"
                className="w-full uppercase tracking-brand text-sm font-bold"
              >
                Keep browsing
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            No thanks
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}