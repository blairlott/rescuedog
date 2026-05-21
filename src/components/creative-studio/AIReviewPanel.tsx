import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Check, X, Loader2, Sparkles, Wand2, RefreshCw } from "lucide-react";

type DerivativeAsset = {
  id: string;
  image_url: string;
  source_url: string | null;
  ai_tags: string[];
  created_at: string;
  metadata: {
    parent_asset_id?: string;
    derivative_kind?: "enhancement" | "scene_variant";
    preset?: string | null;
    auto?: boolean;
    prompt?: string;
  } | null;
};

const SCENE_PRESETS: { id: string; label: string }[] = [
  { id: "hd_authentic", label: "HD Authentic enhance" },
  { id: "scene_vineyard", label: "Vineyard scene" },
  { id: "scene_picnic", label: "Picnic scene" },
  { id: "scene_kitchen", label: "Kitchen scene" },
  { id: "scene_fireside", label: "Fireside scene" },
  { id: "scene_beach", label: "Beach scene" },
];

export function AIReviewPanel() {
  const qc = useQueryClient();
  const [kindFilter, setKindFilter] = useState<"all" | "enhancement" | "scene_variant">("all");
  const [running, setRunning] = useState(false);

  const pendingQuery = useQuery({
    queryKey: ["ai-review-pending", kindFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_assets")
        .select("id, image_url, source_url, ai_tags, created_at, metadata")
        .eq("source", "ai_enhanced")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      const rows = (data ?? []) as DerivativeAsset[];
      if (kindFilter === "all") return rows;
      return rows.filter((r) => r.metadata?.derivative_kind === kindFilter);
    },
  });

  async function setStatus(id: string, status: "approved" | "rejected") {
    const { error } = await supabase.from("media_assets").update({ status }).eq("id", id);
    if (error) return toast.error(`Update failed: ${error.message}`);
    toast.success(status === "approved" ? "Approved" : "Rejected");
    qc.invalidateQueries({ queryKey: ["ai-review-pending"] });
    qc.invalidateQueries({ queryKey: ["cms-media-assets"] });
  }

  async function runAutoCurate() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-curate-media", {
        body: { limit: 5, scene: true },
      });
      if (error) throw error;
      toast.success(`Curated ${data?.processed ?? 0} originals. New variants in review.`);
      qc.invalidateQueries({ queryKey: ["ai-review-pending"] });
    } catch (e) {
      toast.error(`Auto-curate failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  async function spawnVariant(parentId: string | undefined, preset: string) {
    if (!parentId) return toast.error("This derivative has no parent reference.");
    try {
      const { error } = await supabase.functions.invoke("enhance-image", {
        body: { asset_id: parentId, preset, variants: 1, auto: false },
      });
      if (error) throw error;
      toast.success("Variant queued in review.");
      qc.invalidateQueries({ queryKey: ["ai-review-pending"] });
    } catch (e) {
      toast.error(`Variant failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const rows = pendingQuery.data ?? [];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="font-medium flex items-center gap-2">
            <Wand2 className="h-4 w-4" /> AI Review Queue
            <Badge variant="outline">{rows.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Autonomous HD enhancements and creative scene variants. Originals are always preserved. Approve or reject before they go live.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["all", "enhancement", "scene_variant"] as const).map((k) => (
            <Badge
              key={k}
              variant={kindFilter === k ? "default" : "outline"}
              className="cursor-pointer capitalize"
              onClick={() => setKindFilter(k)}
            >
              {k === "scene_variant" ? "Scene" : k}
            </Badge>
          ))}
          <Button size="sm" variant="outline" onClick={() => pendingQuery.refetch()} disabled={pendingQuery.isFetching}>
            <RefreshCw className={`h-3 w-3 mr-1 ${pendingQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={runAutoCurate} disabled={running}>
            {running ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Run curation now
          </Button>
        </div>
      </div>

      {pendingQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded">
          Nothing waiting. Click "Run curation now" or upload new seeds and the autopilot will queue HD + scene variants every 6 hours.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((r) => {
            const kind = r.metadata?.derivative_kind ?? "enhancement";
            const preset = r.metadata?.preset ?? "custom";
            return (
              <div key={r.id} className="border rounded p-2 space-y-2">
                <div className="grid grid-cols-2 gap-1">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase text-muted-foreground">Original</div>
                    {r.source_url ? (
                      <img src={r.source_url} alt="" className="w-full aspect-square object-cover bg-muted" />
                    ) : (
                      <div className="w-full aspect-square bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                        n/a
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase text-muted-foreground">AI version</div>
                    <img src={r.image_url} alt="" className="w-full aspect-square object-cover bg-muted" />
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <Badge variant={kind === "scene_variant" ? "default" : "secondary"} className="text-[10px]">
                    {kind === "scene_variant" ? "Scene" : "HD enhance"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{preset}</Badge>
                  {r.metadata?.auto && <Badge variant="outline" className="text-[10px]">auto</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => setStatus(r.id, "approved")}>
                    <Check className="h-3 w-3 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-7 text-xs"
                    onClick={() => setStatus(r.id, "rejected")}
                  >
                    <X className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </div>
                <details className="text-[11px]">
                  <summary className="cursor-pointer text-muted-foreground">More scene ideas</summary>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {SCENE_PRESETS.filter((s) => s.id !== preset).map((s) => (
                      <Button
                        key={s.id}
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2"
                        onClick={() => spawnVariant(r.metadata?.parent_asset_id, s.id)}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}