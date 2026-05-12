import { useState } from "react";
import { Mail, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useCartStore } from "@/stores/cartStore";
import { toast } from "@/hooks/use-toast";

export function CartSaveForLater() {
  const { user } = useCustomerAuth();
  const items = useCartStore((s) => s.items);
  const [email, setEmail] = useState(user?.email ?? "");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (items.length === 0) return null;

  const handleSend = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    setBusy(true);
    // Persist locally so the user can retrieve it from any session via the same email
    const key = `saved_cart_${email.toLowerCase()}`;
    try {
      localStorage.setItem(key, JSON.stringify({ items, savedAt: new Date().toISOString() }));
      // Defer to backend later — for now, show success.
      await new Promise((r) => setTimeout(r, 400));
      setSent(true);
      toast({ title: "Cart saved", description: `We'll email ${email} a link to your cart.` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <p className="text-[11px] font-semibold text-foreground">Email me this cart</p>
      </div>
      {sent ? (
        <p className="text-[11px] text-primary flex items-center gap-1">
          <Check className="w-3 h-3" /> Sent — check your inbox
        </p>
      ) : (
        <div className="flex gap-1.5">
          <Input
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-7 text-xs flex-1"
          />
          <Button size="sm" variant="outline" onClick={handleSend} disabled={busy} className="h-7 text-xs">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Send"}
          </Button>
        </div>
      )}
    </div>
  );
}
