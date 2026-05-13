import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Heart, Copy } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";

const KEY = "rdw_exit_intent_seen";
const CODE = "RDW10";

/**
 * Exit-intent recovery offer. Fires once per session when the user moves
 * the cursor toward the browser chrome (desktop) or after 30s of inactivity
 * with intent-to-leave signals on mobile (rough proxy: visibilitychange to
 * hidden after they've been on a wine route 20s+).
 */
export function ExitIntentOffer() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Only on consumer-facing routes (skip CRM/CMS/checkout).
    const path = location.pathname.toLowerCase();
    if (path.startsWith("/crm") || path.startsWith("/cms")) return;
    if (path.startsWith("/checkout") || path.startsWith("/thank-you")) return;

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
  }, [location.pathname]);

  const copyCode = () => {
    navigator.clipboard?.writeText(CODE);
    toast.success(`Code ${CODE} copied`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <div className="text-center space-y-4 pt-2">
          <Heart className="h-10 w-10 text-primary mx-auto" />
          <h2 className="font-display text-2xl font-bold uppercase tracking-brand">
            Wait — before you go
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Take <strong>10% off your first order</strong>. Every bottle and tee helps rescue dogs find their forever home.
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