import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, ImageOff, Search } from "lucide-react";
import { toast } from "sonner";

type MerchRow = {
  id: string;
  title: string;
  handle: string;
  image_url: string | null;
  category: string | null;
  is_active: boolean;
};

export function MerchImagesPanel() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: products, isLoading } = useQuery({
    queryKey: ["cms-merch-images"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merch_products")
        .select("id,title,handle,image_url,category,is_active")
        .order("title", { ascending: true });
      if (error) throw error;
      return data as MerchRow[];
    },
  });

  const updateImage = useMutation({
    mutationFn: async ({ id, image_url }: { id: string; image_url: string }) => {
      const { error } = await supabase
        .from("merch_products")
        .update({ image_url, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cms-merch-images"] });
      qc.invalidateQueries({ queryKey: ["catalog-products"] });
      toast.success("Image updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = async (row: MerchRow, file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Max file size is 20MB");
      return;
    }
    setUploadingId(row.id);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `merch/${row.handle || row.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("blog-media")
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("blog-media").getPublicUrl(path);
      if (!pub?.publicUrl) throw new Error("Upload succeeded but no public URL");
      await updateImage.mutateAsync({ id: row.id, image_url: pub.publicUrl });
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploadingId(null);
    }
  };

  const isPlaceholder = (url: string | null) =>
    !url || url.includes("unsplash.com") || url.includes("placeholder");

  const filtered = (products || []).filter((p) => {
    if (onlyMissing && !isPlaceholder(p.image_url)) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const placeholderCount = (products || []).filter((p) => isPlaceholder(p.image_url)).length;

  return (
    <div className="bg-background border border-border">
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold uppercase tracking-brand">Merch Images</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {products?.length || 0} products · {placeholderCount} still using placeholder photos
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={onlyMissing ? "default" : "outline"}
            onClick={() => setOnlyMissing((v) => !v)}
            size="sm"
          >
            {onlyMissing ? "Showing placeholders only" : "Show only placeholders"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">No products match.</p>
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((row) => {
            const placeholder = isPlaceholder(row.image_url);
            return (
              <div key={row.id} className="px-6 py-4 flex items-center gap-4">
                <div className="w-20 h-20 flex-shrink-0 bg-secondary border border-border overflow-hidden flex items-center justify-center">
                  {row.image_url ? (
                    <img
                      src={row.image_url}
                      alt={row.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <ImageOff className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{row.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {row.category || "—"} · {row.handle}
                  </p>
                  {placeholder && (
                    <p className="text-[10px] uppercase tracking-brand text-primary font-bold mt-1">
                      Placeholder image
                    </p>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={(el) => {
                    fileRefs.current[row.id] = el;
                  }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(row, f);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingId === row.id}
                  onClick={() => fileRefs.current[row.id]?.click()}
                >
                  {uploadingId === row.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}