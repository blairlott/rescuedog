import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Save, Pencil, X } from "lucide-react";

type Recipe = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_html: string | null;
  cover_image: string | null;
  recommended_product_handle: string | null;
  pairing_notes: string | null;
  published: boolean;
};

const empty: Recipe = {
  id: "", slug: "", title: "", excerpt: "", body_html: "", cover_image: "",
  recommended_product_handle: "", pairing_notes: "", published: false,
};

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export function PairingsPanel() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("recipes").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message); else setRecipes((data as Recipe[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim()) { toast.error("Title required"); return; }
    const slug = editing.slug.trim() || slugify(editing.title);
    setSaving(true);
    const payload = { ...editing, slug, excerpt: editing.excerpt || null, body_html: editing.body_html || null,
      cover_image: editing.cover_image || null, recommended_product_handle: editing.recommended_product_handle || null,
      pairing_notes: editing.pairing_notes || null };
    const { error } = editing.id
      ? await supabase.from("recipes").update({ ...payload, id: undefined }).eq("id", editing.id)
      : await supabase.from("recipes").insert({ ...payload, id: undefined });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this pairing?")) return;
    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  return (
    <div className="bg-background border border-border">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-bold text-foreground">Recipes & Wine Pairings</h2>
          <p className="text-xs text-muted-foreground">Public at <code>/pairings</code></p>
        </div>
        <Button size="sm" onClick={() => setEditing({ ...empty })}><Plus className="h-3.5 w-3.5 mr-1" /> New pairing</Button>
      </div>

      {editing && (
        <div className="p-6 border-b border-border bg-secondary/30 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">{editing.id ? "Edit pairing" : "New pairing"}</h3>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>Title</Label><Input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} /></div>
            <div><Label>Slug (URL)</Label><Input value={editing.slug} onChange={e => setEditing({ ...editing, slug: slugify(e.target.value) })} placeholder="auto from title" /></div>
            <div className="md:col-span-2"><Label>Excerpt</Label><Textarea rows={2} value={editing.excerpt || ""} onChange={e => setEditing({ ...editing, excerpt: e.target.value })} /></div>
            <div><Label>Cover image URL</Label><Input value={editing.cover_image || ""} onChange={e => setEditing({ ...editing, cover_image: e.target.value })} /></div>
            <div><Label>Recommended product handle</Label><Input value={editing.recommended_product_handle || ""} onChange={e => setEditing({ ...editing, recommended_product_handle: e.target.value })} placeholder="e.g. red-blend-2021" /></div>
            <div className="md:col-span-2"><Label>Pairing notes</Label><Textarea rows={2} value={editing.pairing_notes || ""} onChange={e => setEditing({ ...editing, pairing_notes: e.target.value })} placeholder="Why this wine works with this dish" /></div>
            <div className="md:col-span-2"><Label>Body HTML</Label><Textarea rows={8} value={editing.body_html || ""} onChange={e => setEditing({ ...editing, body_html: e.target.value })} placeholder="<p>Recipe instructions...</p>" /></div>
            <div className="md:col-span-2 flex items-center gap-2"><Switch checked={editing.published} onCheckedChange={v => setEditing({ ...editing, published: v })} /><Label>Published</Label></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" />Save</>}</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
      ) : recipes.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">No pairings yet — click "New pairing" to add one.</div>
      ) : (
        <ul className="divide-y divide-border">
          {recipes.map(r => (
            <li key={r.id} className="px-6 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.title} {!r.published && <span className="text-xs text-muted-foreground">(draft)</span>}</p>
                <p className="text-xs text-muted-foreground truncate">/pairings/{r.slug}{r.recommended_product_handle ? ` · ↔ ${r.recommended_product_handle}` : ""}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}