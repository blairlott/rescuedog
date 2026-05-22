import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUploadDataset } from "@/hooks/finance/useCfoDatasets";

export function UploadDatasetDialog({ open, onOpenChange, onUploaded }: {
  open: boolean; onOpenChange: (v: boolean) => void; onUploaded?: (id: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"private" | "shared">("private");
  const upload = useUploadDataset();

  const submit = async () => {
    if (!file) return toast.error("Pick a file");
    if (!name.trim()) return toast.error("Name the dataset");
    try {
      const id = await upload.mutateAsync({ file, name: name.trim(), visibility });
      toast.success("Dataset uploaded");
      onOpenChange(false);
      setFile(null); setName("");
      onUploaded?.(id);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload financial data</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="file">File (CSV, XLSX, or PDF)</Label>
            <Input
              id="file" type="file" accept=".csv,.xlsx,.xls,.pdf"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !name) setName(f.name.replace(/\.[^.]+$/, ""));
              }}
            />
          </div>
          <div>
            <Label htmlFor="name">Dataset name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 2026 P&L" />
          </div>
          <div>
            <Label>Visibility</Label>
            <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as any)} className="mt-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="private" id="vis-private" />
                <Label htmlFor="vis-private" className="font-normal">Private — only me</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="shared" id="vis-shared" />
                <Label htmlFor="vis-shared" className="font-normal">Shared — all finance users</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={upload.isPending}>
            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}