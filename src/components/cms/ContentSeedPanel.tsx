import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { Upload, Trash2, Loader2, ImagePlus, Copy, ImageIcon, Wand2, Instagram } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type SeedRow = {
  id: string;
  storage_path: string;
  public_url: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  label: string | null;
  tags: string[] | null;
  brand_lockup: string | null;
  uploaded_by: string | null;
  created_at: string;
  refined?: boolean;
  parent_seed_id?: string | null;
};

const BUCKET = "creative-seeds";
const MAX_FILE_MB = 15;

export function ContentSeedPanel() {
  const { toast } = useToast();
  const { data: roleInfo } = useUserRole();
  const canDelete = !!roleInfo?.isAdminOrOwner;

  const [rows, setRows] = useState<SeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [brand, setBrand] = useState<"wine" | "merch" | "shared">("shared");
  const [labelHint, setLabelHint] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [filter, setFilter] = useState<"all" | "wine" | "merch" | "shared">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [importingIG, setImportingIG] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("creative_seed_assets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast({ title: "Failed to load seeds", description: error.message, variant: "destructive" });
    setRows((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }

    setUploading(true);
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    let okCount = 0;
    let failCount = 0;

    for (const file of Array.from(files)) {
      try {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          toast({ title: `Skipped ${file.name}`, description: `Over ${MAX_FILE_MB}MB`, variant: "destructive" });
          failCount++;
          continue;
        }
        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

        const { error: insErr } = await supabase.from("creative_seed_assets").insert({
          storage_path: path,
          public_url: pub.publicUrl,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          label: labelHint.trim() || null,
          tags,
          brand_lockup: brand,
          uploaded_by: userId,
        });
        if (insErr) throw insErr;
        okCount++;
      } catch (e: any) {
        failCount++;
        toast({ title: `Upload failed: ${file.name}`, description: e.message, variant: "destructive" });
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (okCount) toast({ title: `Uploaded ${okCount} seed${okCount > 1 ? "s" : ""}` });
    setLabelHint("");
    setTagsInput("");
    load();
  }

  async function remove(row: SeedRow) {
    if (!confirm(`Delete "${row.file_name}"?`)) return;
    await supabase.storage.from(BUCKET).remove([row.storage_path]);
    const { error } = await supabase.from("creative_seed_assets").delete().eq("id", row.id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else toast({ title: "Deleted" });
    load();
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    toast({ title: "URL copied", description: "Paste into a generation brief as reference." });
  }

  async function refine(row: SeedRow, mode: string) {
    setRefiningId(row.id);
    try {
      const { error } = await supabase.functions.invoke("capi-creative-refine", {
        body: { seed_id: row.id, mode },
      });
      if (error) throw error;
      toast({ title: "Refined", description: "New variant added to the library." });
      load();
    } catch (e: any) {
      toast({ title: "Refine failed", description: e.message, variant: "destructive" });
    } finally {
      setRefiningId(null);
    }
  }

  async function importInstagram() {
    const handle = window.prompt("Instagram handle to import (without @):", "rescuedogwines");
    if (!handle) return;
    setImportingIG(true);
    try {
      const { data, error } = await supabase.functions.invoke("capi-instagram-import", {
        body: { handle: handle.trim(), limit: 12, brand_lockup: brand },
      });
      if (error) throw error;
      toast({
        title: `Imported ${data?.imported ?? 0} from @${handle}`,
        description: data?.skipped ? `${data.skipped} skipped (already imported or failed).` : "Ready to refine.",
      });
      load();
    } catch (e: any) {
      toast({ title: "Instagram import failed", description: e.message, variant: "destructive" });
    } finally {
      setImportingIG(false);
    }
  }

  const filtered = rows.filter((r) => filter === "all" ? true : r.brand_lockup === filter);

  return (
    <Card className="p-6 border border-border rounded-none">
      <div className="flex items-center gap-2 mb-4">
        <ImagePlus className="h-4 w-4 text-primary" />
        <h3 className="font-bold">Content Seed Library</h3>
        <span className="text-xs text-muted-foreground">
          — reference images for generation briefs ({rows.length})
        </span>
        <Button
          variant="outline"
          size="sm"
          className="rounded-none ml-auto"
          onClick={importInstagram}
          disabled={importingIG}
        >
          {importingIG ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Instagram className="h-3 w-3 mr-2" />}
          Import from Instagram
        </Button>
      </div>

      {/* Upload row */}
      <div className="grid md:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground">Brand</label>
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value as any)}
            className="w-full border border-border bg-background px-3 py-2 text-sm rounded-none"
          >
            <option value="shared">Shared</option>
            <option value="wine">Wine</option>
            <option value="merch">Merch</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Label (optional)</label>
          <Input value={labelHint} onChange={(e) => setLabelHint(e.target.value)} placeholder="e.g. Vineyard at golden hour" className="rounded-none" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Tags (comma separated)</label>
          <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="dog, mission, lifestyle" className="rounded-none" />
        </div>
        <div className="flex items-end">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full rounded-none"
          >
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload images
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-4">
        {(["all", "wine", "merch", "shared"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2 py-1 border rounded-none ${filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Gallery */}
      {loading ? (
        <div className="text-center text-muted-foreground py-12">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 border border-dashed border-border">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No seed images yet. Upload multiple at once — they'll show here.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {filtered.map((r) => (
            <div key={r.id} className="group border border-border rounded-none overflow-hidden bg-muted">
              <a href={r.public_url} target="_blank" rel="noreferrer">
                <img src={r.public_url} alt={r.label || r.file_name} className="w-full aspect-square object-cover" />
              </a>
              <div className="p-2 space-y-1">
                <p className="text-[11px] truncate" title={r.file_name}>{r.label || r.file_name}</p>
                <div className="flex items-center gap-1 flex-wrap">
                  {r.brand_lockup && <Badge variant="outline" className="rounded-none text-[10px]">{r.brand_lockup}</Badge>}
                  {(r.tags ?? []).slice(0, 2).map((t) => (
                    <Badge key={t} variant="outline" className="rounded-none text-[10px]">{t}</Badge>
                  ))}
                </div>
                <div className="flex gap-1 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 rounded-none h-7 px-2" onClick={() => copyUrl(r.public_url)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-none h-7 px-2"
                        disabled={refiningId === r.id}
                        title="AI refine / reframe"
                      >
                        {refiningId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-none">
                      <DropdownMenuItem onClick={() => refine(r, "enhance")}>Enhance for impact</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => refine(r, "cinematic")}>Cinematic recolor</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => refine(r, "reframe_hero")}>Reframe → Hero 16:9</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => refine(r, "reframe_pdp")}>Reframe → PDP 4:5</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => refine(r, "reframe_square")}>Reframe → Square 1:1</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {canDelete && (
                    <Button size="sm" variant="outline" className="rounded-none h-7 px-2" onClick={() => remove(r)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}