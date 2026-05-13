import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional: prefill email from the CRM account context. */
  defaultEmail?: string;
}

type Mode = "subtotal" | "delta";

export function AwardPointsDialog({ open, onOpenChange, defaultEmail = "" }: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [matched, setMatched] = useState<{ id: string; email: string | null; display_name: string | null } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const [mode, setMode] = useState<Mode>("subtotal");
  const [subtotal, setSubtotal] = useState("");
  const [delta, setDelta] = useState("");
  const [eventType, setEventType] = useState("manual_adjust");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setMatched(null);
    setSubtotal("");
    setDelta("");
    setReason("");
    setEventType("manual_adjust");
    setMode("subtotal");
  };

  const lookup = async () => {
    const e = email.trim().toLowerCase();
    if (!e) {
      toast.error("Enter an email to look up");
      return;
    }
    setLookingUp(true);
    setMatched(null);
    try {
      const { data, error } = await supabase
        .from("customer_profiles")
        .select("id, email, display_name")
        .ilike("email", e)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error("No customer found with that email");
        return;
      }
      setMatched(data);
    } catch (err: any) {
      toast.error(err.message || "Lookup failed");
    } finally {
      setLookingUp(false);
    }
  };

  const submit = async () => {
    if (!matched) {
      toast.error("Look up a customer first");
      return;
    }
    if (!reason.trim()) {
      toast.error("Add a reason for the audit log");
      return;
    }

    const body: Record<string, unknown> = {
      user_id: matched.id,
      event_type: eventType,
      reason: reason.trim().slice(0, 500),
      metadata: { source: "crm_manual" },
    };
    if (mode === "subtotal") {
      const dollars = parseFloat(subtotal);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        toast.error("Enter a positive dollar amount");
        return;
      }
      body.subtotal_cents = Math.round(dollars * 100);
    } else {
      const pts = parseInt(delta, 10);
      if (!Number.isFinite(pts) || pts === 0) {
        toast.error("Enter a non-zero point amount (negative to deduct)");
        return;
      }
      body.delta_points = pts;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("award-loyalty-points", { body });
      if (error) throw error;
      const result = data as { ok?: boolean; points_awarded?: number; idempotent_skip?: boolean; error?: string };
      if (result?.error) throw new Error(result.error);
      if (result?.idempotent_skip) {
        toast.info("Already awarded — no duplicate created");
      } else {
        toast.success(`Awarded ${result?.points_awarded ?? 0} points`);
      }
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to award points");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Award Rescue Rewards points</DialogTitle>
          <DialogDescription>
            Look up a customer by email, then grant points (or deduct with a negative number).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="award-email">Customer email</Label>
            <div className="flex gap-2">
              <Input
                id="award-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setMatched(null); }}
                placeholder="customer@example.com"
                maxLength={255}
              />
              <Button type="button" variant="outline" onClick={lookup} disabled={lookingUp || !email.trim()}>
                {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {matched && (
              <p className="text-xs text-muted-foreground">
                Matched: <strong>{matched.display_name || "(no name)"}</strong> · {matched.email}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Award basis</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="subtotal">Dollars spent (1 pt / $1)</SelectItem>
                <SelectItem value="delta">Direct points (+/-)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "subtotal" ? (
            <div className="space-y-2">
              <Label htmlFor="award-subtotal">Subtotal (USD, pre-tax & shipping)</Label>
              <Input
                id="award-subtotal"
                type="number"
                step="0.01"
                min="0"
                value={subtotal}
                onChange={(e) => setSubtotal(e.target.value)}
                placeholder="50.00"
              />
              {subtotal && Number.isFinite(parseFloat(subtotal)) && (
                <p className="text-xs text-muted-foreground">
                  Will award <strong>{Math.floor(parseFloat(subtotal))}</strong> points
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="award-delta">Points (use negative to deduct)</Label>
              <Input
                id="award-delta"
                type="number"
                step="1"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="100"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="award-event">Event type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger id="award-event"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual_adjust">Manual adjust</SelectItem>
                <SelectItem value="earn_referral">Referral bonus</SelectItem>
                <SelectItem value="earn_order">Order (manual entry)</SelectItem>
                <SelectItem value="earn_goodwill">Goodwill / make-good</SelectItem>
                <SelectItem value="earn_event">Event / experience</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="award-reason">Reason (required, audited)</Label>
            <Textarea
              id="award-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Referral from John D. — confirmed first order"
              maxLength={500}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !matched}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Award points
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}