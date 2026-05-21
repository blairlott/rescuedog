import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, Loader2, Trash2, Copy, Image as ImageIcon, Video, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type MediaItem = {
  id: string;
  title: string;
  description: string | null;
  kind: "image" | "video" | "copy";
  mime_type: string | null;
  file_path: string | null;
  file_url: string | null;
  file_size: number | null;
  copy_body: string | null;
  tags: string[];
  alt_text: string | null;
  status: string;
  created_at: string;
};

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const API_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/media-library-api`;

const kindIcon = (k: string) =>
  k === "image" ? <ImageIcon className="h-4 w-4" /> :
  k === "video" ? <Video className="h-4 w-4" /> :
  <FileText className="h-4 w-4" />;

export default function CmsMediaPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filterKind, setFilterKind] = useState<string>("all");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [altText, setAltText] = useState("");
  const [tags, setTags] = useState("");
  const [kind, setKind] = useState<"image" | "video" | "copy">("image");
  const [copyBody, setCopyBody] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: items, isFetching, refetch } = useQuery({
    queryKey: ["media-library", filterKind],
    queryFn: async () => {
      let q = supabase.from("media_library").select("*").order("created_at", { ascending: false }).limit(200);
      if (filterKind !== "all") q = q.eq("kind", filterKind);
      const { data, error } = await q;
      if (error) throw error;
      return data as MediaItem[];
    },
  });

  const reset = () => {
    setTitle(""); setDescription(""); setAltText(""); setTags(""); setCopyBody("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setBusy(true);
    try {
      const tagArr = tags.split(",").map((t) => t.trim()).filter(Boolean);
      let file_path: string | null = null;
      let file_url: string | null = null;
      let file_size: number | null = null;
      let mime_type: string | null = null;

      if (kind !== "copy") {
        const file = fileRef.current?.files?.[0];
        if (!file) { toast.error("Choose a file to upload"); setBusy(false); return; }
        const ext = file.name.split(".").pop() ?? "";
        const path = `${kind}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("media-library").upload(path, file, {
          cacheControl: "31536000",
          upsert: false,
          contentType: file.type,
        });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("media-library").getPublicUrl(path);
        file_path = path;
        file_url = pub.publicUrl;
        file_size = file.size;
        mime_type = file.type;
      }

      const { error } = await supabase.from("media_library").insert({
        title: title.trim(),
        description: description.trim() || null,
        alt_text: altText.trim() || null,
        tags: tagArr,
        kind,
        file_path,
        file_url,
        file_size,
        mime_type,
        copy_body: kind === "copy" ? copyBody : null,
      });
      if (error) throw error;
      toast.success("Media added");
      reset();
      qc.invalidateQueries({ queryKey: ["media-library"] });
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (item: MediaItem) => {
    if (!confirm(`Delete "${item.title}"?`)) return;
    if (item.file_path) {
      await supabase.storage.from("media-library").remove([item.file_path]);
    }
    const { error } = await supabase.from("media_library").delete().eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["media-library"] });
  };

  const copyApiUrl = (extra = "") => {
    navigator.clipboard.writeText(`${API_URL}${extra}`);
    toast.success("API URL copied");
  };

  return (
    <div className="min-h-dvh bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/cms">
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> CMS</Button>
            </Link>
            <h1 className="text-2xl font-bold">Media Library</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* API access panel */}
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">API Access (Lindy / external)</h2>
            <Badge variant="secondary">GET</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Send requests with header <code className="px-1 bg-muted rounded">Authorization: Bearer &lt;LINDY_PROXY_TOKEN&gt;</code> (or <code className="px-1 bg-muted rounded">x-api-key</code>). Signed-in CMS users may also use their own Supabase JWT.
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            <Button size="sm" variant="outline" onClick={() => copyApiUrl()}><Copy className="h-3 w-3 mr-1" /> Base URL</Button>
            <Button size="sm" variant="outline" onClick={() => copyApiUrl("?kind=image")}><Copy className="h-3 w-3 mr-1" /> ?kind=image</Button>
            <Button size="sm" variant="outline" onClick={() => copyApiUrl("?kind=video")}><Copy className="h-3 w-3 mr-1" /> ?kind=video</Button>
            <Button size="sm" variant="outline" onClick={() => copyApiUrl("?kind=copy")}><Copy className="h-3 w-3 mr-1" /> ?kind=copy</Button>
            <Button size="sm" variant="outline" onClick={() => copyApiUrl("?tag=hero")}><Copy className="h-3 w-3 mr-1" /> ?tag=hero</Button>
          </div>
          <div className="text-xs text-muted-foreground break-all"><code>{API_URL}</code></div>
        </div>

        {/* Upload form */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="font-semibold">Add new asset</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="copy">Copy (text)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Hero banner — fall 2026" />
            </div>
            <div className="md:col-span-3">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional context" />
            </div>
            <div className="md:col-span-2">
              <Label>Tags (comma separated)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hero, homepage, wine-club" />
            </div>
            {kind === "image" && (
              <div>
                <Label>Alt text</Label>
                <Input value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="Accessibility text" />
              </div>
            )}
            {kind !== "copy" ? (
              <div className="md:col-span-3">
                <Label>File</Label>
                <Input ref={fileRef} type="file" accept={kind === "image" ? "image/*" : "video/*"} />
              </div>
            ) : (
              <div className="md:col-span-3">
                <Label>Copy body</Label>
                <Textarea value={copyBody} onChange={(e) => setCopyBody(e.target.value)} rows={5} placeholder="Headline, subhead, body copy, captions…" />
              </div>
            )}
          </div>
          <Button onClick={handleUpload} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Add to library
          </Button>
        </div>

        {/* Filter + list */}
        <div className="flex items-center gap-3">
          <Label>Filter:</Label>
          <Select value={filterKind} onValueChange={setFilterKind}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="image">Images</SelectItem>
              <SelectItem value="video">Videos</SelectItem>
              <SelectItem value="copy">Copy</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{items?.length ?? 0} items</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items?.map((item) => (
            <div key={item.id} className="rounded-lg border bg-card overflow-hidden flex flex-col">
              <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                {item.kind === "image" && item.file_url ? (
                  <img src={item.file_url} alt={item.alt_text ?? item.title} className="w-full h-full object-cover" loading="lazy" />
                ) : item.kind === "video" && item.file_url ? (
                  <video src={item.file_url} controls className="w-full h-full object-cover" />
                ) : (
                  <FileText className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <div className="p-3 space-y-2 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {kindIcon(item.kind)} {item.kind}
                  </div>
                  <Badge variant={item.status === "published" ? "default" : "secondary"} className="text-xs">{item.status}</Badge>
                </div>
                <div className="font-medium text-sm line-clamp-2">{item.title}</div>
                {item.copy_body && (
                  <p className="text-xs text-muted-foreground line-clamp-3">{item.copy_body}</p>
                )}
                {item.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.slice(0, 4).map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  {item.file_url ? (
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(item.file_url!); toast.success("URL copied"); }}>
                      <Copy className="h-3 w-3 mr-1" /> URL
                    </Button>
                  ) : item.copy_body ? (
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(item.copy_body!); toast.success("Copy copied"); }}>
                      <Copy className="h-3 w-3 mr-1" /> Text
                    </Button>
                  ) : <span />}
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(item)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}