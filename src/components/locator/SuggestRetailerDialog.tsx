import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function SuggestRetailerDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    store_name: "",
    street_address: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    contact_name: "",
    submitter_email: "",
    premise_type: "off",
    notes: "",
  });

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.store_name.trim()) {
      toast.error("Store name is required");
      return;
    }
    setSubmitting(true);
    const id = crypto.randomUUID();
    const { error } = await supabase
      .from("retailer_suggestions")
      .insert([{ ...form, id } as any]);
    setSubmitting(false);
    if (error) {
      toast.error("Could not submit. Please try again.");
      return;
    }

    // Fire-and-forget: admin notification + (optional) submitter confirmation.
    void supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "retailer-suggestion-admin-notification",
        recipientEmail: "info@rescuedogwines.com",
        idempotencyKey: `retailer-admin-${id}`,
        templateData: {
          storeName: form.store_name,
          streetAddress: form.street_address,
          city: form.city,
          state: form.state,
          zip: form.zip,
          phone: form.phone,
          premiseType: form.premise_type,
          contactName: form.contact_name,
          submitterEmail: form.submitter_email,
          notes: form.notes,
          submissionId: id,
        },
      },
    });
    if (form.submitter_email) {
      void supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "retailer-suggestion-confirmation",
          recipientEmail: form.submitter_email,
          idempotencyKey: `retailer-confirm-${id}`,
          templateData: { contactName: form.contact_name, storeName: form.store_name },
        },
      });
    }

    toast.success("Thanks! We'll reach out to your store.");
    setOpen(false);
    setForm({
      store_name: "",
      street_address: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      contact_name: "",
      submitter_email: "",
      premise_type: "off",
      notes: "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button variant="outline">Suggest a retailer</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Suggest a retailer</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="store_name">Store name *</Label>
            <Input id="store_name" value={form.store_name} onChange={(e) => update("store_name", e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" value={form.city} onChange={(e) => update("city", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input id="state" value={form.state} onChange={(e) => update("state", e.target.value)} maxLength={2} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="zip">ZIP</Label>
              <Input id="zip" value={form.zip} onChange={(e) => update("zip", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="street_address">Street address</Label>
            <Input id="street_address" value={form.street_address} onChange={(e) => update("street_address", e.target.value)} />
          </div>
          <div>
            <Label>Type</Label>
            <RadioGroup value={form.premise_type} onValueChange={(v) => update("premise_type", v)} className="flex gap-4 mt-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="off" id="off" />
                <Label htmlFor="off" className="font-normal">Retail (off-premise)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="on" id="on" />
                <Label htmlFor="on" className="font-normal">Restaurant/bar (on-premise)</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="contact_name">Your name</Label>
              <Input id="contact_name" value={form.contact_name} onChange={(e) => update("contact_name", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="submitter_email">Your email</Label>
              <Input id="submitter_email" type="email" value={form.submitter_email} onChange={(e) => update("submitter_email", e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={3} />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Submitting…" : "Submit suggestion"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}