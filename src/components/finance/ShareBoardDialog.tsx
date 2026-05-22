import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useCreateShare, useOutgoingShares, useRevokeShare, type CfoBoard } from "@/hooks/finance/useCfoBoards";
import { Trash2, ExternalLink, Eye } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  board: CfoBoard | null;
  userId: string;
}

export function ShareBoardDialog({ open, onOpenChange, board, userId }: Props) {
  const [email, setEmail] = useState("");
  const [type, setType] = useState<"live" | "snapshot">("live");
  const [message, setMessage] = useState("");
  const create = useCreateShare();
  const revoke = useRevokeShare();
  const { data: outgoing = [] } = useOutgoingShares(board?.id ?? null);

  if (!board) return null;

  const onShare = async () => {
    if (!email.trim()) { toast.error("Enter recipient email"); return; }
    const snapshot = type === "snapshot"
      ? { tiles: board.tiles, date_range_days: board.date_range_days, frozen_at: new Date().toISOString(), name: board.name }
      : null;
    try {
      await create.mutateAsync({
        board_id: board.id,
        created_by: userId,
        recipient_email: email.trim(),
        share_type: type,
        message: message.trim() || undefined,
        snapshot,
      });
      toast.success(`${type === "live" ? "Live link" : "Snapshot"} sent to ${email}`);
      setEmail(""); setMessage("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to share");
    }
  };

  const shareUrl = (id: string) => `${window.location.origin}/finance/shared/${id}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Push “{board.name}” to someone</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-brand">Recipient email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jana@rescuedogwines.com" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-brand">Type</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as any)} className="mt-2 space-y-1">
              <div className="flex items-start gap-2 border border-border p-2">
                <RadioGroupItem value="live" id="t-live" className="mt-0.5" />
                <label htmlFor="t-live" className="flex-1 cursor-pointer text-sm">
                  <div className="font-semibold">Live link</div>
                  <div className="text-xs text-muted-foreground">Always shows current data. Recipient sees changes you make.</div>
                </label>
              </div>
              <div className="flex items-start gap-2 border border-border p-2">
                <RadioGroupItem value="snapshot" id="t-snap" className="mt-0.5" />
                <label htmlFor="t-snap" className="flex-1 cursor-pointer text-sm">
                  <div className="font-semibold">Snapshot</div>
                  <div className="text-xs text-muted-foreground">Frozen at this moment — tiles + date range locked in time.</div>
                </label>
              </div>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-brand">Note (optional)</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Heads up on ROAS dip in last 14d…" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onShare} disabled={create.isPending}>Push view</Button>
        </DialogFooter>

        {outgoing.length > 0 && (
          <div className="border-t border-border pt-3 mt-2">
            <div className="text-[10px] uppercase tracking-brand font-semibold mb-2">Active shares</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {outgoing.filter(s => !s.revoked_at).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs gap-2 border border-border p-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{s.recipient_email}</div>
                    <div className="text-muted-foreground flex items-center gap-2">
                      <span className="uppercase">{s.share_type}</span>
                      {s.viewed_at ? <span className="inline-flex items-center gap-0.5"><Eye className="h-3 w-3" /> viewed</span> : <span>unseen</span>}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(shareUrl(s.id)); toast.success("Link copied"); }}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => revoke.mutate(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
