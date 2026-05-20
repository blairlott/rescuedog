import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wine, ShoppingBag, ArrowRight, Mail, CreditCard, User, LogIn } from "lucide-react";
import { Link } from "react-router-dom";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";

interface DualCheckoutConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  wineCount: number;
  merchCount: number;
  wineTotal: number;
  merchTotal: number;
}

/**
 * Walks the customer through the dual-checkout sequence before launch
 * so they understand: 2 tabs, 2 charges, 2 confirmation emails — and
 * WHY (federal wine compliance).
 */
export function DualCheckoutConfirm({
  open,
  onOpenChange,
  onConfirm,
  wineCount,
  merchCount,
  wineTotal,
  merchTotal,
}: DualCheckoutConfirmProps) {
  const { user, signOut } = useCustomerAuth();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Wine first, then a one-click merch handoff
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Federal law requires wine to ship through a licensed partner, so
            wine and merch are billed separately. We'll handle wine right here
            in this window — when it's placed, you'll get a single button to
            finish merch. No popups to fight with.
          </DialogDescription>
        </DialogHeader>

        {/* Auth row */}
        <div className="flex items-center justify-between gap-2 border border-border bg-muted/40 px-3 py-2 text-[11px]">
          {user ? (
            <>
              <span className="flex items-center gap-1.5 min-w-0 text-muted-foreground truncate">
                <User className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">Signed in as <strong className="text-foreground">{user.email}</strong></span>
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                className="text-muted-foreground hover:text-primary underline underline-offset-2 flex-shrink-0"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <LogIn className="h-3 w-3" />
                Sign in for member pricing &amp; faster checkout
              </span>
              <Link
                to="/login"
                onClick={() => onOpenChange(false)}
                className="font-bold uppercase tracking-brand text-primary hover:underline flex-shrink-0"
              >
                Sign in
              </Link>
            </>
          )}
        </div>

        <div className="space-y-3 py-2">
          {/* Wine step — in-app */}
          <div className="flex gap-3 border border-primary/40 bg-primary/[0.04] p-3">
            <div className="flex-shrink-0 w-7 h-7 bg-primary text-primary-foreground flex items-center justify-center">
              <Wine className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-bold uppercase tracking-brand">
                  Step 1 · Wine — checks out here
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {wineCount} bottle{wineCount !== 1 ? "s" : ""} · ${wineTotal.toFixed(2)} ·
                charged by Vinoshipper. 21+ ID required at delivery.
              </p>
            </div>
          </div>

          {/* Merch step — one-click handoff after wine */}
          <div className="flex gap-3 border border-border p-3">
            <div className="flex-shrink-0 w-7 h-7 bg-foreground text-background flex items-center justify-center">
              <ShoppingBag className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-bold uppercase tracking-brand">
                  Step 2 · Merch — one-click after wine
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {merchCount} item{merchCount !== 1 ? "s" : ""} · ${merchTotal.toFixed(2)} ·
                charged by Rescue Dog
              </p>
            </div>
          </div>

          {/* What to expect */}
          <div className="border-t border-dashed border-border pt-3 space-y-1.5">
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <ArrowRight className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span><strong className="text-foreground">Stays in this window</strong> — wine first, then a handoff button for merch.</span>
            </div>
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <CreditCard className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span><strong className="text-foreground">2 charges</strong> on your statement — one from Rescue Dog, one from Vinoshipper.</span>
            </div>
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Mail className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span><strong className="text-foreground">2 confirmation emails</strong> — one per shipment.</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="sm:flex-1"
          >
            Back to cart
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            className="sm:flex-1 bg-primary hover:bg-primary/90"
          >
            Start wine checkout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}