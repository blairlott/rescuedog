import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";

type Partner = { id?: string; name: string; city: string; state: string; url: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner?: Partner | null;
  onSave: (data: Partner) => void;
  isSaving: boolean;
}

export const RescuePartnerDialog = ({ open, onOpenChange, partner, onSave, isSaving }: Props) => {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (partner) {
      setName(partner.name);
      setCity(partner.city);
      setState(partner.state);
      setUrl(partner.url);
    } else {
      setName(""); setCity(""); setState(""); setUrl("");
    }
  }, [partner, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ id: partner?.id, name, city, state, url });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{partner?.id ? "Edit" : "Add"} Rescue Partner</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="rp-name">Organization Name *</Label>
            <Input id="rp-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rp-city">City</Label>
              <Input id="rp-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="rp-state">State</Label>
              <Input id="rp-state" value={state} onChange={(e) => setState(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="rp-url">Website URL</Label>
            <Input id="rp-url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving ? "Saving..." : partner?.id ? "Update" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
