import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Truck } from "lucide-react";

const FREQUENCIES = [
  { value: "monthly", label: "Monthly", discount: 15 },
  { value: "bimonthly", label: "Every 2 Months", discount: 10 },
  { value: "quarterly", label: "Every 3 Months", discount: 5 },
] as const;

interface CartSubscribeToggleProps {
  price: number;
  quantity: number;
}

export function CartSubscribeToggle({ price, quantity }: CartSubscribeToggleProps) {
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState("monthly");

  const freq = FREQUENCIES.find((f) => f.value === frequency) ?? FREQUENCIES[0];
  const lineTotal = price * quantity;
  const savings = lineTotal * (freq.discount / 100);

  return (
    <div className={`mt-2 rounded border text-xs transition-colors ${enabled ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"}`}>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
          <span className="font-medium">Subscribe & Save</span>
          {!enabled && <span className="text-muted-foreground">up to 15%</span>}
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} className="scale-75 origin-right" />
      </div>

      {enabled && (
        <div className="px-2.5 pb-2.5 pt-0 space-y-2 border-t border-border/50">
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger className="h-7 text-xs mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">
                  {f.label} — {f.discount}% off
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-primary font-semibold">
            Save ${savings.toFixed(2)} per delivery
          </p>
          <p className="flex items-center gap-1 text-primary font-medium">
            <Truck className="w-3.5 h-3.5" />
            {quantity >= 6
              ? "Shipping now included with future Ship & Save Shipments"
              : "Shipping included with Ship & Save Shipments of 6 bottles or more"}
          </p>
        </div>
      )}
    </div>
  );
}
