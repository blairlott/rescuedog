import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  userId: string;
  value: string | null;
  onChange: (url: string | null) => void;
}

const MAX_BYTES = 5 * 1024 * 1024;

export function AvatarUploader({ userId, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be under 5 MB");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("ambassador-avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setUploading(false);
      toast.error(error.message);
      return;
    }
    const { data } = supabase.storage.from("ambassador-avatars").getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
    toast.success("Photo uploaded");
  };

  return (
    <div className="flex items-center gap-4">
      <div className="w-20 h-20 bg-muted border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
        {value ? (
          <img src={value} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <Upload className="w-6 h-6 text-muted-foreground" strokeWidth={1.5} />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
            {value ? "Replace photo" : "Upload photo"}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              disabled={uploading}
            >
              <X className="w-3 h-3 mr-1" /> Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">JPG or PNG, square works best. Max 5 MB.</p>
      </div>
    </div>
  );
}