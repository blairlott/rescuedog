import { Gift } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCheckoutIntentStore } from "@/stores/checkoutIntentStore";

export function CartGiftToggle() {
  const giftEnabled = useCheckoutIntentStore((s) => s.giftEnabled);
  const giftRecipientName = useCheckoutIntentStore((s) => s.giftRecipientName);
  const giftMessage = useCheckoutIntentStore((s) => s.giftMessage);
  const setGift = useCheckoutIntentStore((s) => s.setGift);

  return (
    <div className={`rounded border px-3 py-3 transition-colors ${giftEnabled ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}>
      <div className="flex items-center gap-3">
        <Gift className={`w-5 h-5 shrink-0 ${giftEnabled ? "text-primary" : "text-muted-foreground"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">Make this a gift</p>
          <p className="text-[11px] text-muted-foreground">
            Add a note · ship to recipient · prices hidden on packing slip
          </p>
        </div>
        <Switch
          checked={giftEnabled}
          onCheckedChange={(v) => setGift({ enabled: v })}
          className="scale-90 origin-right"
        />
      </div>

      {giftEnabled && (
        <div className="mt-3 pt-3 border-t border-primary/20 space-y-2">
          <Input
            placeholder="Recipient name"
            value={giftRecipientName}
            onChange={(e) => setGift({ recipientName: e.target.value })}
            className="h-8 text-xs"
          />
          <Textarea
            placeholder="Gift note (optional)"
            value={giftMessage}
            onChange={(e) => setGift({ message: e.target.value })}
            rows={2}
            maxLength={200}
            className="text-xs resize-none"
          />
          <p className="text-[10px] text-muted-foreground">
            {giftMessage.length}/200 · Recipient address collected at checkout
          </p>
        </div>
      )}
    </div>
  );
}
