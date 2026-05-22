import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Pin, Mail, Trash2, Eye } from "lucide-react";
import { useSavedViews, useSaveView, useDeleteView, type CfoSavedView } from "@/hooks/finance/useCfoDatasets";
import { toast } from "sonner";

export function SavedViewsPanel({ datasetId, onLoad }: {
  datasetId?: string;
  onLoad: (v: CfoSavedView) => void;
}) {
  const { data: views = [] } = useSavedViews(datasetId);
  const save = useSaveView();
  const del = useDeleteView();

  const togglePin = async (v: CfoSavedView) => {
    await save.mutateAsync({ ...v, pinned_to_dashboard: !v.pinned_to_dashboard });
    toast.success(v.pinned_to_dashboard ? "Unpinned" : "Pinned to dashboard");
  };
  const toggleEmail = async (v: CfoSavedView) => {
    await save.mutateAsync({ ...v, email_daily: !v.email_daily });
  };
  const remove = async (v: CfoSavedView) => {
    if (!confirm(`Delete view "${v.name}"?`)) return;
    await del.mutateAsync(v.id);
    toast.success("Deleted");
  };

  if (!views.length) {
    return <div className="text-sm text-muted-foreground p-4 border border-dashed border-border">No saved views yet.</div>;
  }
  return (
    <div className="space-y-2">
      {views.map((v) => (
        <div key={v.id} className="border border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => onLoad(v)} className="text-sm font-semibold text-left hover:text-primary truncate flex-1">
              {v.name}
            </button>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => onLoad(v)} title="Load"><Eye className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={() => togglePin(v)} title="Pin to dashboard">
                <Pin className={`h-3.5 w-3.5 ${v.pinned_to_dashboard ? "text-primary" : ""}`} />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(v)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{v.visibility === "shared" ? "Shared" : "Private"}</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Mail className="h-3 w-3" /> Daily email
              <Switch checked={v.email_daily} onCheckedChange={() => toggleEmail(v)} />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}