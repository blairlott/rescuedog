import { useState } from "react";
import { Gift, ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGiftWrapSettings, GIFT_WRAP_DEFAULTS } from "@/hooks/useGiftWrapSettings";

const STORAGE_KEY = "rdw_gift_mode";

export interface GiftModeState {
  enabled: boolean;
  wrap: boolean;
  message: string;
  recipientEmail: string;
  recipientName: string;
}

const EMPTY_STATE: GiftModeState = {
  enabled: false,
  wrap: false,
  message: "",
  recipientEmail: "",
  recipientName: "",
};

export function readGiftMode(): GiftModeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_STATE };
    return { ...EMPTY_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function clearGiftMode() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function isGiftModeReady(s: GiftModeState): boolean {
  if (!s.enabled) return false;
  const email = s.recipientEmail?.trim() ?? "";
  return email.length > 3 && /.+@.+\..+/.test(email);
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
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-brand font-bold">
                  Recipient name
                </label>
                <Input
                  value={state.recipientName}
                  onChange={(e) => update({ recipientName: e.target.value })}
                  placeholder="Who is this gift for?"
                  className="text-xs h-9 rounded-none"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-brand font-bold">
                  Recipient email
                  <span className="text-primary"> *</span>
                </label>
                <Input
                  type="email"
                  value={state.recipientEmail}
                  onChange={(e) => update({ recipientEmail: e.target.value })}
                  placeholder="recipient@email.com"
                  className="text-xs h-9 rounded-none"
                />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  We'll send the recipient a "gift is on the way" note plus a
                  shipped notification with tracking. Vinoshipper does not
                  email recipients — we handle that for you.
                </p>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-brand font-bold">
                  Gift message
                </label>
                <Textarea
                  value={state.message}
                  onChange={(e) => update({ message: e.target.value.slice(0, 280) })}
                  placeholder="Optional — included in the recipient email."
                  rows={3}
                  className="text-xs rounded-none"
                />
                <p className="text-[10px] text-muted-foreground text-right">
                  {state.message.length}/280
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                You'll enter the recipient's shipping address on the next step
                at our compliance partner Vinoshipper. Adult signature
                required at delivery.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export const GIFT_WRAP_FEE_CENTS = GIFT_WRAP_DEFAULTS.feeCents;
