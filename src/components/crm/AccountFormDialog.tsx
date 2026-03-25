import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { US_STATES } from "@/lib/usStates";
import { useUpsertAccount, type SalesAccount } from "@/hooks/useSalesAccounts";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: SalesAccount | null;
}

export function AccountFormDialog({ open, onOpenChange, account }: Props) {
  const upsert = useUpsertAccount();
  const [form, setForm] = useState({
    account_name: "", buyer_name: "", buyer_title: "", rep_name: "",
    premise_type: "off", status: "prospect", distributor: "", distributor_rep: "",
    distributor_rep_email: "", distributor_rep_phone: "",
    street_address: "", city: "", state: "GA", zip: "", phone: "", email: "",
    website: "", sales_order: "", notes: "", priority_rank: 0,
  });

  useEffect(() => {
    if (account) {
      setForm({
        account_name: account.account_name || "",
        buyer_name: account.buyer_name || "",
        buyer_title: account.buyer_title || "",
        rep_name: account.rep_name || "",
        premise_type: account.premise_type || "off",
        status: account.status || "prospect",
        distributor: account.distributor || "",
        distributor_rep: account.distributor_rep || "",
        distributor_rep_email: (account as any).distributor_rep_email || "",
        distributor_rep_phone: (account as any).distributor_rep_phone || "",
        street_address: account.street_address || "",
        city: account.city || "",
        state: account.state || "GA",
        zip: account.zip || "",
        phone: account.phone || "",
        email: account.email || "",
        website: account.website || "",
        sales_order: account.sales_order || "",
        notes: account.notes || "",
        priority_rank: account.priority_rank || 0,
      });
    } else {
      setForm({
        account_name: "", buyer_name: "", buyer_title: "", rep_name: "",
        premise_type: "off", status: "prospect", distributor: "", distributor_rep: "",
        distributor_rep_email: "", distributor_rep_phone: "",
        street_address: "", city: "", state: "GA", zip: "", phone: "", email: "",
        website: "", sales_order: "", notes: "", priority_rank: 0,
      });
    }
  }, [account, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsert.mutateAsync({ ...form, ...(account ? { id: account.id } : {}) });
      toast.success(account ? "Account updated" : "Account created");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const set = (key: string, value: string | number) => setForm((p) => ({ ...p, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{account ? "Edit Account" : "New Account"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account Name *</Label>
              <Input value={form.account_name} onChange={(e) => set("account_name", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Rep Name</Label>
              <Input value={form.rep_name} onChange={(e) => set("rep_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Buyer Name</Label>
              <Input value={form.buyer_name} onChange={(e) => set("buyer_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Buyer Title</Label>
              <Input value={form.buyer_title} onChange={(e) => set("buyer_title", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Premise Type</Label>
              <Select value={form.premise_type} onValueChange={(v) => set("premise_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">On Premise</SelectItem>
                  <SelectItem value="off">Off Premise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Distributor</Label>
              <Input value={form.distributor} onChange={(e) => set("distributor", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Distributor Rep</Label>
              <Input value={form.distributor_rep} onChange={(e) => set("distributor_rep", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Dist. Rep Email</Label>
              <Input type="email" value={form.distributor_rep_email} onChange={(e) => set("distributor_rep_email", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Dist. Rep Phone</Label>
              <Input type="tel" value={form.distributor_rep_phone} onChange={(e) => set("distributor_rep_phone", e.target.value)} />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Location</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Street Address</Label>
                <Input value={form.street_address} onChange={(e) => set("street_address", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Select value={form.state} onValueChange={(v) => set("state", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ZIP</Label>
                <Input value={form.zip} onChange={(e) => set("zip", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input value={form.website} onChange={(e) => set("website", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sales Order</Label>
            <Input value={form.sales_order} onChange={(e) => set("sales_order", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={upsert.isPending}>{account ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
