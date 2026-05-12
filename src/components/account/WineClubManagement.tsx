import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RefreshCw, PauseCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type Tier = "pup" | "rescue" | "pack";
type DialogKind = "switch" | "pause" | "cancel" | null;

export const WineClubManagement = ({ currentTier }: { currentTier?: string }) => {
  const [open, setOpen] = useState<DialogKind>(null);
  const [busy, setBusy] = useState(false);
  const [toTier, setToTier] = useState<Tier>("rescue");
  const [pauseCycles, setPauseCycles] = useState(1);
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const submit = async (action: "switch" | "pause" | "resume" | "cancel") => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("wine-club-membership-action", {
        body: { action, to_tier: action === "switch" ? toTier : undefined, pause_cycles: action === "pause" ? pauseCycles : undefined, reason },
      });
      if (error) throw error;
      const result = data as { vinoshipper_synced: boolean; vinoshipper_error: string | null };
      if (result.vinoshipper_synced) toast.success("Membership updated. Changes effective next billing cycle.");
      else toast.success("Request recorded. Our team will sync this with Vinoshipper shortly.");
      setOpen(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["wine-club-membership"] });
    } catch (err: any) {
      toast.error(err.message || "Could not complete request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="border border-border p-5 mt-4">
        <h3 className="font-bold text-foreground mb-3">Manage Membership</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Changes take effect on your next billing cycle and are synced to Vinoshipper for shipment and billing.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button variant="outline" className="gap-2" onClick={() => setOpen("switch")}>
            <RefreshCw className="w-4 h-4" /> Switch Club
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setOpen("pause")}>
            <PauseCircle className="w-4 h-4" /> Pause Shipments
          </Button>
          <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => setOpen("cancel")}>
            <XCircle className="w-4 h-4" /> Cancel Membership
          </Button>
        </div>
      </div>

      <Dialog open={open === "switch"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch Wine Club Tier</DialogTitle>
            <DialogDescription>
              You're currently on the <strong>{currentTier || "—"}</strong> tier. Pick the new tier you'd like to switch to. Effective next shipment.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={toTier} onValueChange={(v) => setToTier(v as Tier)} className="space-y-2">
            <div className="flex items-start gap-3 border border-border p-3"><RadioGroupItem value="pup" id="t-pup" /><Label htmlFor="t-pup" className="flex-1 cursor-pointer"><div className="font-bold">Pup Pack</div><div className="text-xs text-muted-foreground">3 bottles per shipment</div></Label></div>
            <div className="flex items-start gap-3 border border-border p-3"><RadioGroupItem value="rescue" id="t-rescue" /><Label htmlFor="t-rescue" className="flex-1 cursor-pointer"><div className="font-bold">Rescue Pack</div><div className="text-xs text-muted-foreground">6 bottles per shipment</div></Label></div>
            <div className="flex items-start gap-3 border border-border p-3"><RadioGroupItem value="pack" id="t-pack" /><Label htmlFor="t-pack" className="flex-1 cursor-pointer"><div className="font-bold">Full Pack</div><div className="text-xs text-muted-foreground">12 bottles per shipment</div></Label></div>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)} disabled={busy}>Cancel</Button>
            <Button onClick={() => submit("switch")} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Confirm Switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "pause"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause Shipments</DialogTitle>
            <DialogDescription>Skip your next 1, 2, or 3 shipments. Your membership stays active and resumes automatically.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={String(pauseCycles)} onValueChange={(v) => setPauseCycles(Number(v))} className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="border border-border p-3 text-center"><RadioGroupItem value={String(n)} id={`p-${n}`} className="sr-only" /><Label htmlFor={`p-${n}`} className="cursor-pointer block"><div className="font-bold">{n}</div><div className="text-xs text-muted-foreground">cycle{n > 1 ? "s" : ""}</div></Label></div>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)} disabled={busy}>Back</Button>
            <Button onClick={() => submit("pause")} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Pause</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "cancel"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Wine Club Membership</DialogTitle>
            <DialogDescription>
              Sorry to see you go. Cancelling stops all future shipments. You'll keep access to past purchases and can rejoin anytime.
              Consider <button onClick={() => setOpen("pause")} className="text-primary underline">pausing</button> instead?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Tell us why (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What could we have done better?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)} disabled={busy}>Keep Membership</Button>
            <Button variant="destructive" onClick={() => submit("cancel")} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Cancel Membership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};