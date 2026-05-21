import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";

interface VinoshipperInlineSignupProps {
  joinUrl: string;
  tierName: string;
  onBack: () => void;
  backLabel?: string;
  showBack?: boolean;
}

/**
 * Renders Vinoshipper's hosted club enrollment form inline on /club. No
 * custom account/address capture — Vinoshipper owns the full signup,
 * card-on-file, and compliance flow. Their webhook backfills the local
 * membership row when enrollment completes.
 */
export function VinoshipperInlineSignup({
  joinUrl,
  tierName,
  onBack,
  backLabel = "Back to club selection",
  showBack = true,
}: VinoshipperInlineSignupProps) {
  const { user } = useCustomerAuth();

  const url = (() => {
    try {
      const match = joinUrl.match(/vinoshipper\.com\/shop\/(\d+)\/club\/(\d+)/i);
      const u = match
        ? new URL(
            `https://vinoshipper.com/ui/embed/clubs/${match[1]}?clubId=${match[2]}&theme=red`,
          )
        : new URL(joinUrl);
      if (user?.email) u.searchParams.set("email", user.email);
      return u.toString();
    } catch {
      return joinUrl;
    }
  })();

  return (
    <div className="max-w-3xl mx-auto">
      {showBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </button>
      )}

      <div className="border border-border bg-muted/30 p-4 mb-6 text-sm flex gap-3">
        <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-foreground mb-1">
            Joining {tierName} — secure signup
          </p>
          <p className="text-muted-foreground text-xs">
            Sign up below with our compliance &amp; shipping partner,
            Vinoshipper. You'll save a card on file — you're{" "}
            <strong>not charged today</strong>. Your card is only billed when
            a club shipment ships. To gift a membership instead, use the
            recipient's name and address when prompted.
          </p>
        </div>
      </div>

      <div className="border border-border bg-background">
        <iframe
          src={url}
          title={`Vinoshipper Signup — ${tierName}`}
          className="w-full h-[1600px] sm:h-[820px] border-0"
          allow="payment *"
          scrolling="no"
        />
      </div>
    </div>
  );
}