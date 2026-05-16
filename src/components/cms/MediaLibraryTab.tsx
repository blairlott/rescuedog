import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, X, RefreshCw, Image as ImageIcon } from "lucide-react";

type MediaAsset = {
  id: string;
  source: string;
  image_url: string;
  source_url: string | null;
  alt_text: string | null;
  ai_score: number | null;
  ai_tags: string[];
  ai_subject: string | null;
  status: "pending" | "approved" | "rejected" | "archived";
  created_at: string;
};

type HarvestJob = {
  id: string;
  source: string;
  status: string;
  items_found: number;
  items_new: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export default function MediaLibraryTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [scanning, setScanning] = useState<string | null>(null);

  const assetsQuery = useQuery({
    queryKey: ["cms-media-assets", filter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_assets")
        .select("*")
        .eq("status", filter)
        .order("ai_score", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as MediaAsset[];
    },
  });

  const jobsQuery = useQuery({
    queryKey: ["cms-harvest-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("harvest_jobs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as HarvestJob[];
    },
    refetchInterval: scanning ? 3000 : false,
  });

  async function runScan(source: "legacy" | "instagram" | "all") {
    setScanning(source);
    try {
      const { error } = await supabase.functions.invoke("harvest-images", { body: { source } });
      if (error) throw error;
      toast({ title: "Scan started", description: `Harvesting ${source}. Refresh in a minute.` });
      qc.invalidateQueries({ queryKey: ["cms-harvest-jobs"] });
      qc.invalidateQueries({ queryKey: ["cms-media-assets"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Scan failed", description: msg, variant: "destructive" });
    } finally {
      setTimeout(() => setScanning(null), 4000);
    }
  }

  async function setStatus(id: string, status: "approved" | "rejected" | "archived") {
    const { error } = await supabase
      .from("media_assets")
      .update({ status, approved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["cms-media-assets"] });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => runScan("legacy")} disabled={!!scanning} size="sm">
              {scanning === "legacy" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Scan rescuedogwines.com
            </Button>
            <Button onClick={() => runScan("instagram")} disabled={!!scanning} size="sm" variant="outline">
              {scanning === "instagram" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Scan Instagram (public)
            </Button>
            <Button onClick={() => runScan("all")} disabled={!!scanning} size="sm" variant="secondary">
              {scanning === "all" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Scan all sources
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Recent harvest jobs:
            <ul className="mt-1 space-y-1">
              {(jobsQuery.data ?? []).map((j) => (
                <li key={j.id}>
                  <span className="font-mono">{new Date(j.started_at).toLocaleString()}</span>
                  {" — "}
                  <span>{j.source}</span>
                  {" — "}
                  <Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">{j.status}</Badge>
                  {" "}found {j.items_found}, new {j.items_new}
                  {j.error && <span className="text-destructive ml-2">{j.error.slice(0, 100)}</span>}
                </li>
              ))}
              {(jobsQuery.data ?? []).length === 0 && <li className="italic">No runs yet.</li>}
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {assetsQuery.isLoading ? (
        <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
      ) : (assetsQuery.data ?? []).length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No {filter} images. {filter === "pending" && "Run a scan above."}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(assetsQuery.data ?? []).map((a) => (
            <Card key={a.id} className="overflow-hidden">
              <div className="aspect-square bg-muted overflow-hidden">
                <img src={a.image_url} alt={a.alt_text ?? ""} loading="lazy"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }}
                />
              </div>
              <CardContent className="p-3 space-y-2">
                <div className="flex flex-wrap gap-1 text-[10px]">
                  <Badge variant="outline">{a.source}</Badge>
                  {a.ai_subject && <Badge variant="secondary">{a.ai_subject}</Badge>}
                  {a.ai_score !== null && <Badge>{Math.round(a.ai_score)}</Badge>}
                </div>
                {a.alt_text && <p className="text-xs line-clamp-2 text-muted-foreground">{a.alt_text}</p>}
                {filter === "pending" && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="default" className="flex-1" onClick={() => setStatus(a.id, "approved")}>
                      <Check className="h-3 w-3 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setStatus(a.id, "rejected")}>
                      <X className="h-3 w-3 mr-1" /> Reject
                    </Button>
                  </div>
                )}
                {filter === "approved" && (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setStatus(a.id, "archived")}>
                    Archive
                  </Button>
                )}
                {filter === "rejected" && (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setStatus(a.id, "pending")}>
                    Restore to pending
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}