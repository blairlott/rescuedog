import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const REASONS = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "too_much_wine", label: "Receiving more wine than I can drink" },
  { value: "moving", label: "Moving / address change" },
  { value: "selection", label: "Not loving the wine selection" },
  { value: "pause", label: "Taking a break — may rejoin later" },
  { value: "other", label: "Other" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  membershipId: string;
  tierName: string;
}

export function CancelMembershipDialog({ open, onOpenChange, membershipId, tierName }: Props) {
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const handleCancel = async () => {
    setSubmitting(true);
    try {
      const reasonLabel = REASONS.find((r) => r.value === reason)?.label ?? reason;
      const fullReason = [reasonLabel, notes].filter(Boolean).join(" — ");
      const { data, error } = await supabase.functions.invoke("cancel-wine-club-membership", {
        body: { membership_id: membershipId, reason: fullReason },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Your membership has been cancelled.", {
        description: (data as any)?.test_mode
          ? "Recorded locally. Vinoshipper sync will run when live mode is enabled."
          : "We've notified Vinoshipper and updated your account.",
      });
      qc.invalidateQueries({ queryKey: ["my-membership"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Cancellation failed", { description: e?.message ?? "Please try again or contact us." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Cancel {tierName}?
          </DialogTitle>
          <DialogDescription>
            You'll lose your member pricing and won't receive future shipments. You can rejoin anytime.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm font-bold">Why are you cancelling? (optional)</Label>
            <RadioGroup value={reason} onValueChange={setReason} className="mt-2 space-y-2">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  <RadioGroupItem value={r.value} />
                  <span>{r.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="notes" className="text-sm font-bold">Anything else? (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Help us improve the club..."
              rows={3}
              className="mt-2"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Keep My Membership
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Cancellation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}