import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2, ExternalLink } from "lucide-react";

type Row = {
  id: string;
  type: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_html: string | null;
  cover_image_url: string | null;
  author: string | null;
  tags: string[] | null;
  published_at: string | null;
  is_public: boolean;
  source: string;
};

const TYPES = ["post", "event", "page"] as const;

function pathFor(type: string, slug: string) {
  if (type === "post") return `/blog/${slug}`;
  if (type === "event") return `/events/${slug}`;
  return `/${slug}`;
}

export function ContentLibraryPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("post");
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["content-library", filter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_index")
        .select("*")
        .eq("type", filter)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return data as Row[];
    },
  });

  const save = useMutation({
    mutationFn: async (row: Partial<Row>) => {
      const payload: any = {
        type: row.type || "post",
        slug: (row.slug || "").trim(),
        title: (row.title || "").trim(),
        excerpt: row.excerpt || null,
        body_html: row.body_html || null,
        cover_image_url: row.cover_image_url || null,
        author: row.author || null,
        tags: row.tags || null,
        published_at: row.published_at || new Date().toISOString(),
        is_public: row.is_public ?? true,
        source: row.source || "lovable",
      };
      if (!payload.slug || !payload.title) throw new Error("Title and slug are required.");
      if (row.id) {
        const { error } = await supabase.from("content_index").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("content_index").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-library"] });
      toast({ title: "Saved" });
      setEditing(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_index").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-library"] });
      toast({ title: "Deleted" });
      setConfirmDel(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="bg-background border border-border">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-foreground">Content Library</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage blog posts, events, and pages. URLs match the slug — keep slugs identical to legacy WordPress posts to preserve links.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES.map(t => <SelectItem key={t} value={t}>{t === "post" ? "Blog posts" : t === "event" ? "Events" : "Pages"}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-1" onClick={() => setEditing({ type: filter, is_public: true })}>
            <Plus className="h-4 w-4" /> New
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">No entries. Click "New" or use the Import tab.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-secondary text-left">
                <th className="py-3 px-4 text-sm font-bold">Title</th>
                <th className="py-3 px-4 text-sm font-bold hidden md:table-cell">Slug</th>
                <th className="py-3 px-4 text-sm font-bold hidden lg:table-cell">Published</th>
                <th className="py-3 px-4 text-sm font-bold">Status</th>
                <th className="py-3 px-4 text-sm font-bold w-32">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={i % 2 === 0 ? "bg-background" : "bg-secondary/50"}>
                  <td className="py-3 px-4 text-sm font-medium">{r.title}</td>
                  <td className="py-3 px-4 text-sm text-muted-foreground hidden md:table-cell font-mono">{r.slug}</td>
                  <td className="py-3 px-4 text-sm text-muted-foreground hidden lg:table-cell">
                    {r.published_at ? new Date(r.published_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <span className={`text-xs px-2 py-0.5 ${r.is_public ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {r.is_public ? "Live" : "Draft"}
                    </span>
                  </td>
                  <td className="py-3 px-4 flex items-center gap-1">
                    <a href={pathFor(r.type, r.slug)} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-secondary" title="View">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setConfirmDel(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit" : "New"} {editing?.type || "entry"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select value={editing.type || "post"} onValueChange={(v) => setEditing({ ...editing, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Published date</Label>
                  <Input
                    type="date"
                    value={editing.published_at ? editing.published_at.slice(0, 10) : ""}
                    onChange={(e) => setEditing({ ...editing, published_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                </div>
              </div>
              <div>
                <Label>Title *</Label>
                <Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <Label>Slug * <span className="text-xs text-muted-foreground">(URL: {pathFor(editing.type || "post", editing.slug || "your-slug")})</span></Label>
                <Input value={editing.slug || ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") })} />
              </div>
              <div>
                <Label>Cover image URL</Label>
                <Input value={editing.cover_image_url || ""} onChange={(e) => setEditing({ ...editing, cover_image_url: e.target.value })} />
              </div>
              <div>
                <Label>Author</Label>
                <Input value={editing.author || ""} onChange={(e) => setEditing({ ...editing, author: e.target.value })} />
              </div>
              <div>
                <Label>Excerpt</Label>
                <Textarea rows={2} value={editing.excerpt || ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} />
              </div>
              <div>
                <Label>Body (HTML)</Label>
                <Textarea rows={12} className="font-mono text-xs" value={editing.body_html || ""} onChange={(e) => setEditing({ ...editing, body_html: e.target.value })} />
              </div>
              <div>
                <Label>Tags (comma separated)</Label>
                <Input
                  value={(editing.tags || []).join(", ")}
                  onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editing.is_public ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_public: v })} />
                <Label>Published (publicly visible)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending}>
              {save.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this entry?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone. Consider unpublishing instead.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDel && remove.mutate(confirmDel)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
