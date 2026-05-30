import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentUserRoles } from "@/hooks/useCurrentUserRoles";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PRESS_LOGO_MAP } from "@/lib/pressLogoMap";
import { ArrowUp, ArrowDown, Pencil, ArchiveRestore, Archive, Plus, Newspaper, AlertTriangle } from "lucide-react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const LA_TZ = "America/Los_Angeles";
const isoToLocal = (iso: string | null | undefined) =>
  iso ? formatInTimeZone(new Date(iso), LA_TZ, "yyyy-MM-dd'T'HH:mm") : "";
const localToIso = (local: string) =>
  local ? fromZonedTime(local, LA_TZ).toISOString() : null;

type PressMention = {
  id: string;
  outlet_name: string;
  outlet_slug: string;
  logo_asset_slug: string;
  article_url: string | null;
  article_title: string | null;
  display_order: number;
  status: "active" | "paused" | "retired";
  start_at: string | null;
  end_at: string | null;
  // Added in PART 2.7 — read defensively until then.
  show_on_homepage?: boolean;
  show_in_press_section?: boolean;
  pull_quote?: string | null;
  pull_quote_attribution?: string | null;
  pull_quote_show_on_homepage?: boolean;
};

const emptyForm = (): Partial<PressMention> => ({
  outlet_name: "",
  outlet_slug: "",
  logo_asset_slug: "",
  article_url: "",
  article_title: "",
  display_order: 100,
  status: "active",
  start_at: null,
  end_at: null,
  show_on_homepage: true,
  show_in_press_section: true,
  pull_quote: "",
  pull_quote_attribution: "",
  pull_quote_show_on_homepage: true,
});

export default function AdminPressMentionsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: role, isLoading: roleLoading } = useUserRole();
  const { data: roles } = useCurrentUserRoles();
  const canEdit = !!(roles && (roles.has("owner") || roles.has("brand_owner")));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Partial<PressMention>>(emptyForm());
  const [confirmRetire, setConfirmRetire] = useState<PressMention | null>(null);

  const list = useQuery({
    queryKey: ["admin-press-mentions"],
    queryFn: async (): Promise<PressMention[]> => {
      const { data, error } = await (supabase as any)
        .from("press_mentions")
        .select("*")
        .neq("status", "retired")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as PressMention[];
    },
    enabled: canEdit,
  });

  const retired = useQuery({
    queryKey: ["admin-press-mentions-retired"],
    queryFn: async (): Promise<PressMention[]> => {
      const { data, error } = await (supabase as any)
        .from("press_mentions")
        .select("*")
        .eq("status", "retired")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PressMention[];
    },
    enabled: canEdit,
  });

  const save = useMutation({
    mutationFn: async (payload: Partial<PressMention>) => {
      const writePayload: Record<string, any> = {
        outlet_name: payload.outlet_name?.trim(),
        outlet_slug: payload.outlet_slug?.trim(),
        logo_asset_slug: payload.logo_asset_slug?.trim(),
        article_url: payload.article_url?.trim() || null,
        article_title: payload.article_title?.trim() || null,
        display_order: Number(payload.display_order ?? 100),
        status: payload.status || "active",
        start_at: payload.start_at || null,
        end_at: payload.end_at || null,
        show_on_homepage: payload.show_on_homepage ?? true,
        show_in_press_section: payload.show_in_press_section ?? true,
        pull_quote: (payload.pull_quote || "").trim() || null,
        pull_quote_attribution: (payload.pull_quote_attribution || "").trim() || null,
        pull_quote_show_on_homepage: payload.pull_quote_show_on_homepage ?? true,
      };
      if (editingId) {
        const { error } = await (supabase as any)
          .from("press_mentions")
          .update(writePayload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("press_mentions")
          .insert(writePayload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-press-mentions"] });
      qc.invalidateQueries({ queryKey: ["admin-press-mentions-retired"] });
      setEditingId(null);
      setCreating(false);
      setForm(emptyForm());
      toast({ title: "Saved" });
    },
    onError: (e: any) => {
      toast({
        title: "Save failed",
        description: e?.message || "Could not save press mention. (Visibility columns ship in PART 2.7 — if the error mentions show_on_homepage / show_in_press_section, that's expected until 2.7 runs.)",
        variant: "destructive",
      });
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PressMention["status"] }) => {
      const { error } = await (supabase as any).from("press_mentions").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-press-mentions"] });
      qc.invalidateQueries({ queryKey: ["admin-press-mentions-retired"] });
      setConfirmRetire(null);
      toast({ title: "Status updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const reorder = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) => {
      const rows = (list.data || []).slice().sort((a, b) => a.display_order - b.display_order);
      const idx = rows.findIndex((r) => r.id === id);
      const swapWith = direction === "up" ? rows[idx - 1] : rows[idx + 1];
      if (!swapWith) return;
      const a = rows[idx];
      // Swap display_order values; if equal, bump by 1 to avoid no-op.
      const aNew = swapWith.display_order;
      const bNew = a.display_order === swapWith.display_order ? a.display_order + 1 : a.display_order;
      const { error: e1 } = await (supabase as any).from("press_mentions").update({ display_order: aNew }).eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await (supabase as any).from("press_mentions").update({ display_order: bNew }).eq("id", swapWith.id);
      if (e2) throw e2;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-press-mentions"] }),
    onError: (e: any) => toast({ title: "Reorder failed", description: e?.message, variant: "destructive" }),
  });

  if (roleLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!canEdit) {
    return (
      <div className="p-6 max-w-md mx-auto text-center space-y-3">
        <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-bold">Press Mentions — Restricted</h1>
        <p className="text-sm text-muted-foreground">
          Only owners and brand owners can manage press mentions. This action will be logged.
        </p>
        <Button variant="outline" onClick={() => navigate("/crm")}>Back to CRM</Button>
      </div>
    );
  }

  const rows = list.data || [];

  const openEdit = (row: PressMention) => {
    setForm({ ...row });
    setEditingId(row.id);
    setCreating(false);
  };
  const openCreate = () => {
    setForm(emptyForm());
    setEditingId(null);
    setCreating(true);
  };
  const closeDialog = () => {
    setEditingId(null);
    setCreating(false);
    setForm(emptyForm());
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-brand flex items-center gap-2">
            <Newspaper className="h-5 w-5" /> Press Mentions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Edits here update the homepage strip and the press section. Retired rows are kept for audit, not shown publicly.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Mention
        </Button>
      </div>

      <div className="border border-border rounded">
        <div className="grid grid-cols-[60px_70px_1fr_1fr_90px_160px_160px_140px] gap-2 px-3 py-2 text-[11px] uppercase tracking-brand text-muted-foreground border-b border-border bg-muted/30">
          <div>Order</div>
          <div>Logo</div>
          <div>Outlet</div>
          <div>Article</div>
          <div>Status</div>
          <div>Visibility</div>
          <div>Schedule</div>
          <div>Actions</div>
        </div>
        {list.isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
        {!list.isLoading && rows.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No active press mentions. Click <em>New Mention</em> to add one.
          </div>
        )}
        {rows.map((row, i) => {
          const logo = PRESS_LOGO_MAP[row.logo_asset_slug];
          return (
            <div key={row.id} className="grid grid-cols-[60px_70px_1fr_1fr_90px_160px_160px_140px] gap-2 px-3 py-3 items-center border-b border-border last:border-0 text-sm">
              <div className="flex flex-col gap-0.5">
                <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0 || reorder.isPending} onClick={() => reorder.mutate({ id: row.id, direction: "up" })}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === rows.length - 1 || reorder.isPending} onClick={() => reorder.mutate({ id: row.id, direction: "down" })}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="h-10 w-14 flex items-center">
                {logo ? (
                  <img src={logo.src} alt={logo.alt} className="h-full w-auto object-contain" />
                ) : (
                  <span className="text-[10px] text-destructive">no logo</span>
                )}
              </div>
              <div>
                <div className="font-medium">{row.outlet_name}</div>
                <div className="text-[11px] text-muted-foreground">{row.outlet_slug}</div>
              </div>
              <div className="truncate">
                {row.article_url ? (
                  <a href={row.article_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                    {row.article_title || row.article_url}
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground italic">{row.article_title || "(no link)"}</span>
                )}
              </div>
              <div>
                <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-brand rounded ${
                  row.status === "active" ? "bg-emerald-100 text-emerald-800" :
                  row.status === "paused" ? "bg-amber-100 text-amber-800" :
                  "bg-muted text-muted-foreground"
                }`}>{row.status}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {row.show_on_homepage !== false && (
                  <span className="inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-brand rounded bg-primary/10 text-primary">Home</span>
                )}
                {row.show_in_press_section !== false && (
                  <span className="inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-brand rounded bg-accent text-accent-foreground">Press</span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {row.start_at && <div>From {formatInTimeZone(new Date(row.start_at), LA_TZ, "MMM d, yyyy HH:mm")} PT</div>}
                {row.end_at && <div>Until {formatInTimeZone(new Date(row.end_at), LA_TZ, "MMM d, yyyy HH:mm")} PT</div>}
                {!row.start_at && !row.end_at && <span>Always</span>}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmRetire(row)} title="Retire (no hard delete)">
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {(retired.data?.length || 0) > 0 && (
        <details className="border border-border rounded">
          <summary className="px-3 py-2 text-sm cursor-pointer text-muted-foreground">
            Retired ({retired.data?.length}) — kept for audit, not shown publicly
          </summary>
          <div className="divide-y divide-border">
            {(retired.data || []).map((row) => (
              <div key={row.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                <div>
                  <span className="font-medium">{row.outlet_name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{row.outlet_slug}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: row.id, status: "active" })}>
                  <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}

      <Dialog open={creating || !!editingId} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Press Mention" : "New Press Mention"}</DialogTitle>
            <DialogDescription>
              Visibility toggles control where this mention appears. Schedule fields use America/Los_Angeles.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="outlet_name">Outlet name</Label>
                <Input id="outlet_name" required value={form.outlet_name || ""} onChange={(e) => setForm((f) => ({ ...f, outlet_name: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="outlet_slug">Outlet slug</Label>
                <Input id="outlet_slug" required value={form.outlet_slug || ""} onChange={(e) => setForm((f) => ({ ...f, outlet_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} placeholder="e.g. forbes" />
              </div>
            </div>
            <div>
              <Label htmlFor="logo_asset_slug">Logo asset slug</Label>
              <Input id="logo_asset_slug" required value={form.logo_asset_slug || ""} onChange={(e) => setForm((f) => ({ ...f, logo_asset_slug: e.target.value }))} placeholder="key in PRESS_LOGO_MAP (often same as outlet_slug)" />
              {form.logo_asset_slug && PRESS_LOGO_MAP[form.logo_asset_slug] ? (
                <div className="mt-2 h-12 w-32 bg-muted/30 rounded flex items-center justify-center">
                  <img src={PRESS_LOGO_MAP[form.logo_asset_slug].src} alt="" className="h-10 w-auto object-contain" />
                </div>
              ) : form.logo_asset_slug ? (
                <p className="mt-1 text-[11px] text-destructive">No logo registered for this slug in pressLogoMap.ts</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="article_url">Article URL</Label>
              <Input id="article_url" type="url" value={form.article_url || ""} onChange={(e) => setForm((f) => ({ ...f, article_url: e.target.value }))} placeholder="https://..." />
            </div>
            <div>
              <Label htmlFor="article_title">Article title / recognition</Label>
              <Input id="article_title" value={form.article_title || ""} onChange={(e) => setForm((f) => ({ ...f, article_title: e.target.value }))} />
            </div>

            <div className="rounded border border-border bg-muted/20 p-3 space-y-3">
              <p className="text-xs uppercase tracking-brand text-muted-foreground font-bold">Pull Quote</p>
              <div>
                <Label htmlFor="pull_quote">Pull quote</Label>
                <textarea
                  id="pull_quote"
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.pull_quote || ""}
                  onChange={(e) => setForm((f) => ({ ...f, pull_quote: e.target.value }))}
                  placeholder="Short excerpt (5–15 words)…"
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                  <span>
                    Short excerpt from the article (5–15 words). Renders below the press strip on the homepage. Use direct quotes — brand integrity matters here.
                  </span>
                  <span className={(form.pull_quote?.length || 0) > 120 ? "text-amber-600" : ""}>
                    {form.pull_quote?.length || 0} chars{(form.pull_quote?.length || 0) > 120 ? " — visual impact drops" : ""}
                  </span>
                </div>
              </div>
              <div>
                <Label htmlFor="pull_quote_attribution">Attribution (optional)</Label>
                <Input
                  id="pull_quote_attribution"
                  value={form.pull_quote_attribution || ""}
                  onChange={(e) => setForm((f) => ({ ...f, pull_quote_attribution: e.target.value }))}
                  placeholder="e.g. Hudson Lindenberger, Forbes"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Override for byline. If blank, falls back to outlet name.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="pull_quote_show_on_homepage">Show this quote on the homepage</Label>
                <Switch
                  id="pull_quote_show_on_homepage"
                  checked={form.pull_quote_show_on_homepage ?? true}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, pull_quote_show_on_homepage: v }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="display_order">Display order</Label>
                <Input id="display_order" type="number" value={form.display_order ?? 100} onChange={(e) => setForm((f) => ({ ...f, display_order: Number(e.target.value) }))} />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.status || "active"}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PressMention["status"] }))}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            </div>

            <div className="rounded border border-border bg-muted/20 p-3 space-y-3">
              <p className="text-xs uppercase tracking-brand text-muted-foreground font-bold">Visibility</p>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="show_on_homepage">Display in homepage "As Recognized By" strip</Label>
                </div>
                <Switch id="show_on_homepage" checked={form.show_on_homepage ?? true} onCheckedChange={(v) => setForm((f) => ({ ...f, show_on_homepage: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="show_in_press_section">Display in full press section at /press</Label>
                </div>
                <Switch id="show_in_press_section" checked={form.show_in_press_section ?? true} onCheckedChange={(v) => setForm((f) => ({ ...f, show_in_press_section: v }))} />
              </div>
            </div>

            <div className="rounded border border-border bg-muted/20 p-3 space-y-2">
              <div>
                <p className="text-xs uppercase tracking-brand text-muted-foreground font-bold">Schedule (optional)</p>
                <p className="text-[11px] text-muted-foreground">Pacific time (America/Los_Angeles).</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="start_at" className="text-xs">Start at</Label>
                  <Input id="start_at" type="datetime-local" value={isoToLocal(form.start_at)} onChange={(e) => setForm((f) => ({ ...f, start_at: localToIso(e.target.value) }))} />
                </div>
                <div>
                  <Label htmlFor="end_at" className="text-xs">End at</Label>
                  <Input id="end_at" type="datetime-local" value={isoToLocal(form.end_at)} onChange={(e) => setForm((f) => ({ ...f, end_at: localToIso(e.target.value) }))} />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmRetire} onOpenChange={(o) => { if (!o) setConfirmRetire(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire this press mention?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRetire?.outlet_name} will be hidden from the homepage strip and the press section.
              The row is kept for audit and can be restored from the Retired section below.
              No hard delete will be performed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRetire && setStatus.mutate({ id: confirmRetire.id, status: "retired" })}>
              Retire
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}