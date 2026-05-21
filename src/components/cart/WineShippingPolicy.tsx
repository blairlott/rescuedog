import { Link } from "react-router-dom";
import { ShieldCheck, MapPin, AlertTriangle, CloudSnow, Mail } from "lucide-react";

interface WineShippingPolicyProps {
  /** "compact" = short bullet summary for cart drawer.
   *  "full"    = detailed copy for checkout / PDP / policies page. */
  variant?: "compact" | "full";
  className?: string;
}

/**
 * Required wine shipping disclosures shown during shopping & checkout.
 * Source of truth — do not paraphrase the legal/operational language
 * without product sign-off.
 */
export function WineShippingPolicy({ variant = "full", className = "" }: WineShippingPolicyProps) {
  if (variant === "compact") {
    return (
      <div
        className={`border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground space-y-1.5 ${className}`}
      >
        <p className="flex items-start gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <span>
            <strong className="text-foreground">Adult signature (21+) required</strong> with valid ID on every wine delivery.
          </span>
        </p>
        <p className="flex items-start gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <span>
            Not home? Pick a nearby <strong className="text-foreground">UPS Access Point</strong> at checkout for pickup on your schedule.
          </span>
        </p>
        <p>
          See full{" "}
          <Link to="/policies#shipping" className="underline hover:text-foreground">
            wine shipping policy & state rules
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div
      className={`border border-border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground space-y-3 ${className}`}
    >
      <h4 className="text-xs font-bold uppercase tracking-brand text-foreground">
        Wine Shipping Policy
      </h4>

      <p className="flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span>
          All wine shipments require an{" "}
          <strong className="text-foreground">adult signature (21+) with valid ID</strong>.
        </span>
      </p>

      <p className="flex items-start gap-2">
        <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span>
          Won't be home? No problem — simply select a nearby{" "}
          <strong className="text-foreground">UPS Access Point</strong> at checkout for
          convenient pickup on your schedule.
        </span>
      </p>

      <p className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span>
          <strong className="text-foreground">Please note:</strong> If a shipment is
          returned due to failed delivery, we can only refund the cost of the wine —
          shipping charges are non-refundable. If the order has already shipped, you
          will be charged a <strong className="text-foreground">UPS Rerouting Fee</strong>{" "}
          to change the destination.
        </span>
      </p>

      <p className="flex items-start gap-2">
        <Mail className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span>
          For shipping changes please contact:{" "}
          <a
            href="mailto:customerservice@vinoshipper.com?cc=info@rescuedogwines.com"
            className="underline hover:text-foreground"
          >
            customerservice@vinoshipper.com
          </a>{" "}
          and cc{" "}
          <a
            href="mailto:info@rescuedogwines.com"
            className="underline hover:text-foreground"
          >
            info@rescuedogwines.com
          </a>
          .
        </span>
      </p>

      <p className="flex items-start gap-2">
        <CloudSnow className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span>
          In instances of <strong className="text-foreground">extreme weather</strong>,
          shipments may be delayed. This is to protect your order. For more information
          you can{" "}
          <Link to="/contact" className="underline hover:text-foreground">
            contact us
          </Link>
          .
        </span>
      </p>

      <p>
        The rules and regulations for shipping wine vary by state —{" "}
        <Link to="/policies#shipping" className="underline hover:text-foreground">
          see the state list here
        </Link>
        .
      </p>
    </div>
  );
}