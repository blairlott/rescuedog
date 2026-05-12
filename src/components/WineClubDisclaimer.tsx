import { Info } from "lucide-react";

interface WineClubDisclaimerProps {
  variant?: "club" | "subscription" | "gift";
  className?: string;
}

/**
 * Industry-standard wine club / Subscribe & Save disclaimer.
 * Mirrors language used by Wine.com, Naked Wines, K&L, and DTC wineries
 * to satisfy 21+ verification, recurring-billing, and state shipping rules.
 */
export function WineClubDisclaimer({ variant = "club", className = "" }: WineClubDisclaimerProps) {
  const subscriptionLines = [
    "By enrolling, you authorize Rescue Dog Wines (via Vinoshipper) to charge your saved payment method for each shipment at the cadence you choose, plus applicable taxes and shipping, until you cancel.",
    "You may modify, skip, pause, or cancel any future shipment from your account at least 3 days before the next billing date. Charges already processed are non-refundable once a shipment is in transit.",
    "Wine purchases require an adult signature (21+) at delivery. Government-issued ID is required. We cannot ship to PO boxes or to states where direct-to-consumer wine shipments are restricted.",
    "Promotional pricing and discounts apply only while your subscription remains active.",
  ];

  const clubLines = [
    "Wine club membership enrolls you in recurring shipments billed automatically through Vinoshipper to your saved payment method, plus applicable taxes and shipping.",
    "You can fully customize each shipment in your account up to the cutoff date — swap, add, or remove bottles — as long as you stay at or above your tier's minimum bottle count.",
    "You can switch tiers, pause, or cancel anytime in your Account at least 3 days before your next ship date.",
    "All wine deliveries require an adult signature (21+) with valid government-issued ID. We do not ship to PO boxes or to states where direct-to-consumer wine shipments are prohibited.",
    "By joining you confirm you are at least 21 years of age and agree to the Wine Club Terms.",
  ];

  const giftLines = [
    "Gift recipients must be 21 or older and reside in a state where Rescue Dog Wines can legally ship.",
    "Adult signature (21+) and valid government-issued ID required at delivery.",
    "Gift certificates are non-refundable, non-transferable for cash, and expire 12 months from issue date.",
    "Recipient is responsible for redeeming the certificate and providing a valid shipping address.",
  ];

  const lines = variant === "subscription" ? subscriptionLines : variant === "gift" ? giftLines : clubLines;
  const heading = variant === "subscription" ? "Subscribe & Save Terms" : variant === "gift" ? "Gift Certificate Terms" : "Wine Club Terms";

  return (
    <div className={`border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground ${className}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Info className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="font-bold uppercase tracking-wider text-foreground">{heading}</span>
      </div>
      <ul className="space-y-1 list-disc pl-4">
        {lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </div>
  );
}