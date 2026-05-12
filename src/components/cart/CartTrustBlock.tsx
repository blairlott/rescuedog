import { useEffect, useMemo, useState } from "react";
import { Truck, Thermometer, Heart, Users } from "lucide-react";
import { Input } from "@/components/ui/input";

interface CartTrustBlockProps {
  totalBottles: number;
}

const SOCIAL_PROOF = [
  "327 cases shipped this week",
  "Sarah in Austin just joined the Wine Club",
  "12 bottles delivered to a member in Denver this morning",
  "Last week we donated $4,820 to rescue partners",
  "Mike in Portland reordered his favorite Cabernet",
];

function addBusinessDays(date: Date, days: number) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

export function CartTrustBlock({ totalBottles }: CartTrustBlockProps) {
  const [zip, setZip] = useState<string>(() => localStorage.getItem("cart_eta_zip") || "");
  const [proofIdx, setProofIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setProofIdx((i) => (i + 1) % SOCIAL_PROOF.length), 4500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (zip.length === 5) localStorage.setItem("cart_eta_zip", zip);
  }, [zip]);

  const eta = useMemo(() => {
    if (zip.length !== 5) return null;
    // Crude bucket: West-coast ZIPs (8-9) ship in 3 biz days, Mid (5-7) in 4, East (0-4) in 6
    const bucket = parseInt(zip[0] ?? "5", 10);
    const days = bucket >= 8 ? 3 : bucket >= 5 ? 4 : 6;
    const arrive = addBusinessDays(new Date(), days);
    return arrive.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }, [zip]);

  // Donation impact: ~$1 per bottle goes to rescue partners
  const dollarsToRescue = totalBottles;
  const dogsHelped = Math.max(1, Math.round(totalBottles / 4));

  return (
    <div className="space-y-2 border border-border rounded-md p-3 bg-card text-xs">
      {/* Donation impact */}
      {totalBottles > 0 && (
        <div className="flex items-center gap-2 text-foreground">
          <Heart className="w-3.5 h-3.5 text-primary shrink-0" fill="currentColor" />
          <span>
            This order rescues <strong>~{dogsHelped}</strong> {dogsHelped === 1 ? "dog" : "dogs"} ·{" "}
            <strong>${dollarsToRescue}</strong> to our rescue partners
          </span>
        </div>
      )}

      {/* ETA by ZIP */}
      <div className="flex items-center gap-2">
        <Truck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <Input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={5}
          placeholder="ZIP"
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
          className="h-7 text-xs w-20"
        />
        <span className="text-muted-foreground">
          {eta ? <>Arrives <strong className="text-foreground">{eta}</strong></> : "Estimated arrival"}
        </span>
      </div>

      {/* Temperature-hold reassurance */}
      <div className="flex items-start gap-2 text-muted-foreground">
        <Thermometer className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          <strong className="text-foreground">Hot weather?</strong> We hold your shipment free until it's safe to ship.
        </span>
      </div>

      {/* Recent-buyer social proof */}
      <div className="flex items-center gap-2 text-muted-foreground border-t border-border pt-2">
        <Users className="w-3.5 h-3.5 shrink-0" />
        <span key={proofIdx} className="animate-fade-in italic">{SOCIAL_PROOF[proofIdx]}</span>
      </div>
    </div>
  );
}
