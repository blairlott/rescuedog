import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Partner = {
  id: string;
  name: string;
  slug: string;
  contact_email: string | null;
  api_base_url: string | null;
  payout_terms: string | null;
  status: string;
  notify_on_new_order: boolean;
};

const empty: Partial<Partner> = { name: "", slug: "", contact_email: "", api_base_url: "", payout_terms: "Net 30", status: "active", notify_on_new_order: true };

export function PartnersTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Partner>>(empty);

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["dropship_partners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dropship_partners" as any).select("*").order("name");
      if (error) throw error;
      return (data || []) as unknown as Partner[];
    },
  });

  const save = useMutation({
    mutationFn: async (p: Partial<Partner>) => {
      if (p.id) {
        const { error } = await supabase.from("dropship_partners" as any).update(p).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dropship_partners" as any).insert(p as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dropship_partners"] });
      setOpen(false);
      setDraft(empty);
      toast.success("Partner saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dropship_partners" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dropship_partners"] });
      toast.success("Partner deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{partners.length} partner{partners.length !== 1 && "s"}</p>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDraft(empty); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setDraft(empty)}><Plus className="h-4 w-4 mr-1" /> New Partner</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{draft.id ? "Edit" : "New"} Partner</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <Input placeholder="Name (e.g. Printful)" value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <Input placeholder="Slug (e.g. printful)" value={draft.slug || ""} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
              <Input placeholder="Contact email" value={draft.contact_email || ""} onChange={(e) => setDraft({ ...draft, contact_email: e.target.value })} />
              <Input placeholder="API base URL" value={draft.api_base_url || ""} onChange={(e) => setDraft({ ...draft, api_base_url: e.target.value })} />
              <Input placeholder="Payout terms (e.g. Net 30)" value={draft.payout_terms || ""} onChange={(e) => setDraft({ ...draft, payout_terms: e.target.value })} />
            </div>
            <DialogFooter>
              <Button onClick={() => save.mutate(draft)} disabled={!draft.name || !draft.slug || save.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : partners.length === 0 ? (
        <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No drop-ship partners yet. Add one to start routing merch orders.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Payout</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}<div className="text-xs text-muted-foreground">{p.slug}</div></TableCell>
                <TableCell className="text-sm">{p.contact_email || "—"}</TableCell>
                <TableCell className="text-sm">{p.payout_terms || "—"}</TableCell>
                <TableCell><Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => { setDraft(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete ${p.name}?`)) del.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}