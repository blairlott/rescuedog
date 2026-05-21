import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";

interface VinoshipperClubHandoffProps {
  open: boolean;
  onClose: () => void;
  joinUrl: string;
  tierName: string;
  prefill?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  /**
   * Called when the customer confirms (or we detect) that Vinoshipper card
   * capture is complete. Parent persists the local membership row only after
   * this fires — so we never end up with a membership in our DB that has no
   * card on file in Vinoshipper.
   */
  onCompleted?: () => void;
}

/**
 * Renders Vinoshipper's hosted club enrollment page inside an iframe so the
 * entire experience stays on /club. VS captures the card on their own
 * PCI-compliant page; their webhook backfills our membership row when
 * enrollment completes. We poll the membership row every 4s as a
 * belt-and-suspenders confirmation in case the user closes the dialog before
 * we see the webhook.
 */
export function VinoshipperClubHandoff({
  open,
  onClose,
  joinUrl,
  tierName,
  prefill,
  onCompleted,
}: VinoshipperClubHandoffProps) {
  const { user } = useCustomerAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [completedFired, setCompletedFired] = useState(false);

  // Build an iframe-friendly embed URL. Vinoshipper's marketing /shop/...
  // page is NOT iframe-safe (sets X-Frame-Options and renders the full
  // store chrome). Their official embed endpoint at
  //   https://vinoshipper.com/ui/embed/clubs/{producerId}?clubId={clubId}
  // is purpose-built for iframe usage and renders the actual card-capture
  // form. We derive producerId + clubId from the stored joinUrl
  // (`/shop/{producerId}/club/{clubId}`) and fall back to the raw joinUrl
  // if it doesn't match.
  const url = (() => {
    try {
      let u: URL;
      const match = joinUrl.match(/vinoshipper\.com\/shop\/(\d+)\/club\/(\d+)/i);
      if (match) {
        u = new URL(
          `https://vinoshipper.com/ui/embed/clubs/${match[1]}?clubId=${match[2]}&theme=red`,
        );
      } else {
        u = new URL(joinUrl);
      }
      if (prefill?.email) u.searchParams.set("email", prefill.email);
      if (prefill?.firstName) u.searchParams.set("firstName", prefill.firstName);
      if (prefill?.lastName) u.searchParams.set("lastName", prefill.lastName);
      if (prefill?.address1) u.searchParams.set("address1", prefill.address1);
      if (prefill?.address2) u.searchParams.set("address2", prefill.address2);
      if (prefill?.city) u.searchParams.set("city", prefill.city);
      if (prefill?.state) u.searchParams.set("state", prefill.state);
      if (prefill?.zip) u.searchParams.set("zip", prefill.zip);
      return u.toString();
    } catch {
      return joinUrl;
    }
  })();

  // Poll for membership confirmation while open.
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    const t = setInterval(async () => {
      const { data } = await supabase
        .from("wine_club_memberships")
        .select("vinoshipper_customer_id, vinoshipper_membership_id, status")
        .eq("user_id", user.id)
        .neq("status", "cancelled")
        .maybeSingle();
      if (cancelled) return;
      if (data?.vinoshipper_membership_id || data?.status === "active") {
        setConfirmed(true);
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [open, user]);

  // Reset confirmation state each time the dialog opens.
  useEffect(() => {
    if (open) {
      setConfirmed(false);
      setCompletedFired(false);
    }
  }, [open]);

  // Fire onCompleted exactly once when we detect confirmation via polling.
  useEffect(() => {
    if (confirmed && !completedFired) {
      setCompletedFired(true);
      onCompleted?.();
    }
  }, [confirmed, completedFired, onCompleted]);

  const handleManualConfirm = () => {
    setConfirmed(true);
    if (!completedFired) {
      setCompletedFired(true);
      onCompleted?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Save Card On File — {tierName}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            You are <strong>not being charged today</strong>. We're saving a
            card on file with Vinoshipper, our compliance & shipping partner,
            so future club shipments can ship and bill automatically. You stay
            on rescuedogwines.com.
          </p>
        </DialogHeader>

        {confirmed ? (
          <div className="px-6 py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">
              Welcome to The Pack
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Your {tierName} membership is active. We'll email you before your first shipment.
            </p>
            <Button onClick={onClose} className="uppercase tracking-brand text-sm font-bold">
              Done
            </Button>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
            <iframe
              src={url}
              title="Vinoshipper Club Signup"
              className="relative w-full h-[640px] border-0 bg-background"
              allow="payment *"
            />
            <div className="px-6 py-4 border-t border-border bg-muted/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Finished adding your card on file with Vinoshipper? Confirm
                below to activate your membership. No charge is made today —
                you'll only be billed when a club shipment goes out. Closing
                this window without saving a card will <strong>not</strong>{" "}
                enroll you.
              </p>
              <Button
                type="button"
                onClick={handleManualConfirm}
                className="uppercase tracking-brand text-xs font-bold whitespace-nowrap"
              >
                I've Added My Card On File
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}