// Best-effort carrier detection from a tracking number, returning a public
// tracking URL. Falls back to a Google search when no pattern matches.

export type Carrier = "UPS" | "FedEx" | "USPS" | "DHL" | "Unknown";

export function detectCarrier(tracking: string): Carrier {
  const t = tracking.replace(/\s+/g, "").toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(t)) return "UPS";
  if (/^(\d{12}|\d{15}|\d{20}|\d{22})$/.test(t)) return "FedEx";
  if (/^(94|93|92|94|95|82)\d{20,22}$/.test(t) || /^[A-Z]{2}\d{9}US$/.test(t)) return "USPS";
  if (/^\d{10,11}$/.test(t)) return "DHL";
  return "Unknown";
}

export function carrierTrackingUrl(tracking: string): { carrier: Carrier; url: string } {
  const t = tracking.replace(/\s+/g, "");
  const carrier = detectCarrier(t);
  switch (carrier) {
    case "UPS":
      return { carrier, url: `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}` };
    case "FedEx":
      return { carrier, url: `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}` };
    case "USPS":
      return { carrier, url: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}` };
    case "DHL":
      return { carrier, url: `https://www.dhl.com/us-en/home/tracking/tracking-parcel.html?tracking-id=${encodeURIComponent(t)}` };
    default:
      return { carrier, url: `https://www.google.com/search?q=${encodeURIComponent("track " + t)}` };
  }
}