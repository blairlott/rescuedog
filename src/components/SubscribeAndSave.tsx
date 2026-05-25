import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Check, Sparkles, Lock } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { WineClubDisclaimer } from "@/components/WineClubDisclaimer";

const DISCOUNT_PERCENT = 15;

const frequencies = [
  { value: "monthly", label: "Every Month" },
  { value: "bimonthly", label: "Every 2 Months" },
  { value: "quarterly", label: "Every 3 Months" },
];

interface SubscribeAndSaveProps {
  price: number;
  onSubscriptionChange: (isSubscribed: boolean, frequency: string) => void;
}

export function SubscribeAndSave({ price, onSubscriptionChange }: SubscribeAndSaveProps) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [frequency, setFrequency] = useState("monthly");
  const { user } = useCustomerAuth();
  const location = useLocation();
  const next = encodeURIComponent(location.pathname + location.search);

  const discountedPrice = price * (1 - DISCOUNT_PERCENT / 100);
  const savings = price - discountedPrice;

  const handleToggle = (checked: boolean) => {
    if (checked && !user) return; // gated UI below
    setIsSubscribed(checked);
    onSubscriptionChange(checked, frequency);
  };

  const handleFrequencyChange = (value: string) => {
    setFrequency(value);
    onSubscriptionChange(isSubscribed, value);
  };

  return (
    <div className={`rounded-md border transition-all duration-200 ${isSubscribed ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'}`}>
      {/* Toggle Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <RefreshCw className={`w-5 h-5 transition-colors ${isSubscribed ? 'text-primary' : 'text-muted-foreground'}`} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Subscribe & Save {DISCOUNT_PERCENT}%</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-sm">
                <Sparkles className="w-3 h-3" />Best Value
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {user ? "Auto-deliver at your pace, cancel anytime" : "Account required to manage recurring shipments"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 italic">
              Auto-ship only — not a Wine Club membership and can't stack with member discounts.
            </p>
          </div>
        </div>
        {user ? (
          <Switch checked={isSubscribed} onCheckedChange={handleToggle} />
        ) : (
          <Lock className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      {!user && (
        <div className="px-4 pb-4 pt-0 space-y-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Subscribe & Save requires an account so we can securely store your payment method on Vinoshipper, verify age 21+, and let you manage shipments. Your account is created at checkout — sign in if you already have one.
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" className="flex-1"><Link to={`/login?next=${next}`}>Sign In</Link></Button>
          </div>
        </div>
      )}

      {/* Expanded Details */}
      {isSubscribed && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
          {/* Price comparison */}
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-primary">${discountedPrice.toFixed(2)}</span>
            <span className="text-sm text-muted-foreground line-through">${price.toFixed(2)}</span>
            <span className="text-xs font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 rounded-sm">
              Save ${savings.toFixed(2)}
            </span>
          </div>

          {/* Frequency selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Delivery Frequency</label>
            <Select value={frequency} onValueChange={handleFrequencyChange}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {frequencies.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Benefits list */}
          <ul className="space-y-1">
            {[
              "Shipping included on every delivery",
              "Skip or cancel anytime",
              "Priority access to new releases",
            ].map(benefit => (
              <li key={benefit} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="w-3 h-3 text-primary flex-shrink-0" />
                {benefit}
              </li>
            ))}
          </ul>

          <WineClubDisclaimer variant="subscription" />
        </div>
      )}

      {/* One-time purchase option */}
      {!isSubscribed && (
        <div className="px-4 pb-3 flex items-center gap-2 text-xs text-muted-foreground border-t border-border/50 pt-3">
          <Check className="w-3 h-3" />
          <span>One-time purchase (guest checkout OK): <strong className="text-foreground">${price.toFixed(2)}</strong></span>
        </div>
      )}
    </div>
  );
}

export { DISCOUNT_PERCENT };
