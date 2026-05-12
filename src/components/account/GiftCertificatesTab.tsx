import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Gift, Loader2, Printer, Mail } from "lucide-react";
import { toast } from "sonner";

const TIER_PRICES: Record<string, { label: string; cents: number }> = {
  pup: { label: "Pup Pack — 3 bottles", cents: 9900 },
  rescue: { label: "Rescue Pack — 6 bottles", cents: 17900 },
  pack: { label: "Full Pack — 12 bottles", cents: 32900 },
};

export const GiftCertificatesTab = ({ userId }: { userId: string }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ tier: "rescue", shipments_count: 1, recipient_name: "", recipient_email: "", personal_note: "", deliver_on: "" });

  const { data: gifts = [], isLoading } = useQuery({
    queryKey: ["gift-certificates", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("gift_certificates").select("*").eq("purchaser_user_id", userId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const tier = TIER_PRICES[form.tier];
      const { data, error } = await supabase.functions.invoke("create-gift-certificate", {
        body: {
          ...form,
          total_cents: tier.cents * form.shipments_count,
          send_email_now: !form.deliver_on,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(data.email_sent ? "Gift sent!" : "Gift certificate created");
      setOpen(false);
      setForm({ tier: "rescue", shipments_count: 1, recipient_name: "", recipient_email: "", personal_note: "", deliver_on: "" });
      queryClient.invalidateQueries({ queryKey: ["gift-certificates"] });
    },
    onError: (e: any) => toast.error(e.message || "Could not create gift"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-foreground">Gift Wine Club Certificates</h3>
          <p className="text-sm text-muted-foreground">Give a friend a Rescue Dog Wines club shipment.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Gift className="w-4 h-4" />Send a Gift</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : gifts.length === 0 ? (
        <div className="text-center py-12 border border-border">
          <Gift className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No gifts sent yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {gifts.map((g: any) => (
            <div key={g.id} className="border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-foreground">{TIER_PRICES[g.tier]?.label || g.tier} × {g.shipments_count}</p>
                  <p className="text-sm text-muted-foreground">For {g.recipient_name} ({g.recipient_email})</p>
                  <p className="text-xs text-muted-foreground mt-1">Code: <strong className="font-mono">{g.code}</strong> · {g.status}</p>
                </div>
                <div className="flex gap-1">
                  <Button asChild size="sm" variant="outline" className="gap-1"><a href={`/account/gifts/${g.id}/print`} target="_blank" rel="noreferrer"><Printer className="w-3 h-3" />Print</a></Button>
                </div>
              </div>
              {g.deliver_on && !g.sent_at && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1"><Mail className="w-3 h-3" />Will be emailed on {new Date(g.deliver_on).toLocaleDateString()}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Send a Wine Club Gift</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Club Tier</Label>
              <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIER_PRICES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label} — ${(v.cents / 100).toFixed(2)}/shipment</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Number of Shipments</Label>
              <Select value={String(form.shipments_count)} onValueChange={(v) => setForm({ ...form, shipments_count: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[1, 2, 3, 4, 6, 12].map((n) => <SelectItem key={n} value={String(n)}>{n} shipment{n > 1 ? "s" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Recipient Name</Label>
              <Input value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Recipient Email</Label>
              <Input type="email" value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Personal Note (optional)</Label>
              <Textarea value={form.personal_note} onChange={(e) => setForm({ ...form, personal_note: e.target.value })} placeholder="Cheers!" />
            </div>
            <div className="space-y-1.5">
              <Label>Deliver On (optional — leave blank to send now)</Label>
              <Input type="date" value={form.deliver_on} onChange={(e) => setForm({ ...form, deliver_on: e.target.value })} />
            </div>
            <p className="text-sm text-muted-foreground">
              Total: <strong className="text-foreground">${((TIER_PRICES[form.tier]?.cents || 0) * form.shipments_count / 100).toFixed(2)}</strong>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !form.recipient_name || !form.recipient_email}>
              {create.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Create Gift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};