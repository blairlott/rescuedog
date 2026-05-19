import { useState } from "react";
import { Gift, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useGiftWrapSettings, GIFT_WRAP_DEFAULTS } from "@/hooks/useGiftWrapSettings";

const STORAGE_KEY = "rdw_gift_mode";

export interface GiftModeState {
  enabled: boolean;
  wrap: boolean;
  message: string;
  recipientEmail: string;
}

export function readGiftMode(): GiftModeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: false, wrap: false, message: "", recipientEmail: "" };
    return JSON.parse(raw);
  } catch {
    return { enabled: false, wrap: false, message: "", recipientEmail: "" };
  }
}

export function CartGiftMode({ onChange }: { onChange?: (s: GiftModeState) => void }) {
  const [state, setState] = useState<GiftModeState>(() => readGiftMode());
  const [open, setOpen] = useState(state.enabled);
  const { enabled: wrapAvailable, feeCents } = useGiftWrapSettings();

  const update = (next: Partial<GiftModeState>) => {
    const merged = { ...state, ...next };
    setState(merged);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    onChange?.(merged);
  };

  return (
    <div className="border border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-xs uppercase tracking-brand font-bold">
          <Gift className="h-3.5 w-3.5 text-primary" /> Gift mode
          {state.enabled && (
            <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5">ON</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          <label className="flex items-center justify-between gap-3 text-xs">
            <span>Send as a gift</span>
            <Switch
              checked={state.enabled}
              onCheckedChange={(v) => update({ enabled: v })}
            />
          </label>
          {state.enabled && (
            <>
              {wrapAvailable && (
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span>Add gift wrap (+${(feeCents / 100).toFixed(2)})</span>
                  <Switch
                    checked={state.wrap}
                    onCheckedChange={(v) => update({ wrap: v })}
                  />
                </label>
              )}
              <Textarea
                placeholder="Gift message (optional, 250 chars)"
                maxLength={250}
                value={state.message}
                onChange={(e) => update({ message: e.target.value })}
                className="text-xs resize-none h-16"
              />
              <Input
                type="email"
                placeholder="Recipient email (optional — we'll send shipping updates)"
                value={state.recipientEmail}
                onChange={(e) => update({ recipientEmail: e.target.value })}
                className="text-xs h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                Wines are shipped via our compliance partner Vinoshipper and may
                require an adult signature at delivery.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export const GIFT_WRAP_FEE_CENTS = GIFT_WRAP_DEFAULTS.feeCents;
