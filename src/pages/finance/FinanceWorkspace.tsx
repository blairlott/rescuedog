import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Save, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import {
  useCfoDatasets, useCfoDatasetRows, useDeleteDataset, useSaveView, type CfoSavedView,
} from "@/hooks/finance/useCfoDatasets";
import { UploadDatasetDialog } from "@/components/finance/UploadDatasetDialog";
import { PivotBuilder, type PivotConfig } from "@/components/finance/PivotBuilder";
import { ChartBuilder, type ChartConfig } from "@/components/finance/ChartBuilder";
import { SavedViewsPanel } from "@/components/finance/SavedViewsPanel";

const defaultPivot: PivotConfig = { rowField: null, colField: null, valueField: null, agg: "sum" };
const defaultChart: ChartConfig = { type: "bar", xField: null, yField: null, groupField: null, agg: "sum" };

export default function FinanceWorkspace() {
  const { datasetId } = useParams<{ datasetId?: string }>();
  const navigate = useNavigate();
  const { data: datasets = [] } = useCfoDatasets();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveVisibility, setSaveVisibility] = useState<"private" | "shared">("private");
  const [pivot, setPivot] = useState<PivotConfig>(defaultPivot);
  const [chart, setChart] = useState<ChartConfig>(defaultChart);
  const saveView = useSaveView();
  const delDs = useDeleteDataset();

  const activeId = datasetId || datasets[0]?.id;
  const active = datasets.find((d) => d.id === activeId);
  const { data: rows = [] } = useCfoDatasetRows(activeId ?? null);

  useEffect(() => {
    // Reset config when dataset changes
    setPivot(defaultPivot); setChart(defaultChart);
  }, [activeId]);

  const onSaveView = async () => {
    if (!saveName.trim() || !active) return;
    await saveView.mutateAsync({
      name: saveName.trim(),
      visibility: saveVisibility,
      dataset_id: active.id,
      config: { pivot, chart },
      pinned_to_dashboard: false,
      email_daily: false,
    });
    toast.success("View saved");
    setSaveOpen(false); setSaveName("");
  };

  const loadView = (v: CfoSavedView) => {
    if (v.config?.pivot) setPivot(v.config.pivot);
    if (v.config?.chart) setChart(v.config.chart);
    if (v.dataset_id && v.dataset_id !== activeId) navigate(`/finance/workspace/${v.dataset_id}`);
    toast.success(`Loaded "${v.name}"`);
  };

  const handleDeleteDataset = async () => {
    if (!active) return;
    if (!confirm(`Delete dataset "${active.name}" and all its rows?`)) return;
    await delDs.mutateAsync(active.id);
    toast.success("Deleted");
    navigate("/finance/workspace");
  };

  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold leading-tight">Workspace</h1>
        <p className="text-sm text-muted-foreground">Upload financial data, pivot it, and save views you can pin or schedule.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_260px] gap-4">
        {/* Left: datasets */}
        <aside className="border border-border bg-card p-3 space-y-2 h-fit sticky top-[72px]">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-brand font-semibold">Datasets</h2>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setUploadOpen(true)}><Plus className="h-4 w-4" /></Button>
          </div>
          {!datasets.length && (
            <div className="text-xs text-muted-foreground p-3 border border-dashed border-border">
              Upload a CSV, XLSX, or PDF to get started.
            </div>
          )}
          <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
            {datasets.map((d) => (
              <button
                key={d.id}
                onClick={() => navigate(`/finance/workspace/${d.id}`)}
                className={`w-full text-left p-2 border transition-colors ${activeId === d.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"}`}
              >
                <div className="flex items-center gap-1.5 text-sm font-semibold truncate">
                  <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{d.name}
                </div>
                <div className="text-[10px] uppercase tracking-brand text-muted-foreground mt-0.5">
                  {d.row_count} rows · {d.visibility}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Center: workspace */}
        <main className="space-y-4 min-w-0">
          {active ? (
            <div className="border border-border bg-card">
              <div className="flex items-center justify-between gap-2 p-4 border-b border-border">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold truncate">{active.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {active.row_count.toLocaleString()} rows · {active.column_meta.length} cols ·
                    <span className={`ml-1 px-1.5 py-0.5 text-[10px] uppercase tracking-brand ${active.visibility === "shared" ? "bg-primary/10 text-primary" : "bg-foreground/10"}`}>
                      {active.visibility}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setSaveOpen(true)}><Save className="h-4 w-4 mr-1" />Save view</Button>
                  <Button size="sm" variant="ghost" onClick={handleDeleteDataset} title="Delete dataset"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <Tabs defaultValue="pivot" className="p-4">
                <TabsList>
                  <TabsTrigger value="pivot">Pivot table</TabsTrigger>
                  <TabsTrigger value="chart">Chart</TabsTrigger>
                </TabsList>
                <TabsContent value="pivot" className="mt-4">
                  <PivotBuilder rows={rows} columns={active.column_meta} config={pivot} onChange={setPivot} />
                </TabsContent>
                <TabsContent value="chart" className="mt-4">
                  <ChartBuilder rows={rows} columns={active.column_meta} config={chart} onChange={setChart} />
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
              <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-semibold">No dataset selected</p>
              <p className="text-sm">Upload financial data to start building pivots and charts.</p>
              <Button className="mt-4" onClick={() => setUploadOpen(true)}><Plus className="h-4 w-4 mr-1" />Upload file</Button>
            </div>
          )}
        </main>

        {/* Right: saved views */}
        <aside className="border border-border bg-card p-3 space-y-2 h-fit sticky top-[72px]">
          <h2 className="text-xs uppercase tracking-brand font-semibold">Saved views</h2>
          <SavedViewsPanel datasetId={activeId} onLoad={loadView} />
        </aside>
      </div>

      <UploadDatasetDialog
        open={uploadOpen} onOpenChange={setUploadOpen}
        onUploaded={(id) => navigate(`/finance/workspace/${id}`)}
      />

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Save view</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="vname">Name</Label>
              <Input id="vname" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Revenue by channel — Q3" />
            </div>
            <div>
              <Label>Visibility</Label>
              <RadioGroup value={saveVisibility} onValueChange={(v) => setSaveVisibility(v as any)} className="mt-2">
                <div className="flex items-center gap-2"><RadioGroupItem value="private" id="sv-priv" /><Label htmlFor="sv-priv" className="font-normal">Private</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="shared" id="sv-shar" /><Label htmlFor="sv-shar" className="font-normal">Shared</Label></div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={onSaveView} disabled={saveView.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}