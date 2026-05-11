import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState, useEffect, useRef } from "react";
import { Upload, Loader2, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface CmsField {
  key: string;
  label: string;
  type: "text" | "textarea" | "url";
  value: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: CmsField[];
  onSave: (values: Record<string, string>) => void;
  isSaving: boolean;
}

export const CmsEditDialog = ({ open, onOpenChange, title, fields, onSave, isSaving }: Props) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const { toast } = useToast();

  useEffect(() => {
    const initial: Record<string, string> = {};
    fields.forEach((f) => { initial[f.key] = f.value; });
    setValues(initial);
  }, [fields, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(values);
  };

  const handleFileUpload = async (fieldKey: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max file size is 20MB.", variant: "destructive" });
      return;
    }

    setUploading((u) => ({ ...u, [fieldKey]: true }));
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `cms/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('blog-media').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('blog-media').getPublicUrl(path);
      if (!pub?.publicUrl) throw new Error('No public URL returned from upload');
      setValues((v) => ({ ...v, [fieldKey]: pub.publicUrl }));
      toast({ title: "Image uploaded", description: "Image uploaded successfully." });
    } catch (err: any) {
      console.error('Upload error:', err);
      toast({ title: "Upload failed", description: err.message || "Could not upload image.", variant: "destructive" });
    } finally {
      setUploading((u) => ({ ...u, [fieldKey]: false }));
    }
  };

  const isImageUrl = (url: string) => {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp|svg)/i.test(url) || url.includes('shopify') || url.includes('unsplash') || url.includes('rescuedogwines');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit: {title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field) => (
            <div key={field.key}>
              <Label htmlFor={`cms-${field.key}`}>{field.label}</Label>
              {field.type === "textarea" ? (
                <Textarea
                  id={`cms-${field.key}`}
                  value={values[field.key] || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  rows={4}
                />
              ) : field.type === "url" ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      id={`cms-${field.key}`}
                      type="url"
                      value={values[field.key] || ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                      className="flex-1"
                      placeholder="Enter URL or upload image"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={(el) => { fileInputRefs.current[field.key] = el; }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(field.key, file);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={!!uploading[field.key]}
                      onClick={() => fileInputRefs.current[field.key]?.click()}
                      title="Upload image"
                    >
                      {uploading[field.key] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {/* Preview */}
                  {values[field.key] && isImageUrl(values[field.key]) && (
                    <div className="relative w-full h-24 bg-muted rounded overflow-hidden border border-border">
                      <img
                        src={values[field.key]}
                        alt="Preview"
                        className="w-full h-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <Input
                  id={`cms-${field.key}`}
                  type="text"
                  value={values[field.key] || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSaving || Object.values(uploading).some(Boolean)}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
