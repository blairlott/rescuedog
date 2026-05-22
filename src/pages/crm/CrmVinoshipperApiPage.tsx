import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw, PlayCircle, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type Change = {
  id: string;
  change_type: string;
  endpoint_path: string | null;
  endpoint_method: string | null;
  summary: string;
  details: any;
  acknowledged_at: string | null;
  email_sent_at: string | null;
  created_at: string;
};

type Snapshot = {
  id: string;
  source: string;
  source_url: string | null;
  spec_hash: string;
  fetched_at: string;
  probe_results: any;
};

export default function CrmVinoshipperApiPage() {
  const [changes, setChanges] = useState<Change[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [flagEnabled, setFlagEnabled] = useState(false);
  const [filter, setFilter] = useState<"all" | "unack">("unack");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: ch }, { data: snaps }, { data: flag }] = await Promise.all([
      supabase.from("vinoshipper_api_changelog")
        .select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("vinoshipper_api_snapshots")
        .select("id,source,source_url,spec_hash,fetched_at,probe_results")
        .order("fetched_at", { ascending: false }).limit(20),
      supabase.from("feature_flags").select("enabled")
        .eq("key", "vs_api_watcher_enabled").maybeSingle(),
    ]);
    setChanges((ch as any) ?? []);
    setSnapshots((snaps as any) ?? []);
    setFlagEnabled(!!flag?.enabled);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("vinoshipper-api-watcher", { body: {} });
      if (error) throw error;
      toast.success(`Watcher ran — ${data?.changes_recorded ?? 0} new change(s).`);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Watcher failed");
    } finally {
      setRunning(false);
    }
  };

  const toggleFlag = async (next: boolean) => {
    const { error } = await supabase.from("feature_flags")
      .update({ enabled: next }).eq("key", "vs_api_watcher_enabled");
    if (error) return toast.error(error.message);
    setFlagEnabled(next);
    toast.success(`Watcher ${next ? "enabled" : "paused"} — emails ${next ? "ON" : "OFF"}.`);
  };

  const ack = async (id: string) => {
    const { error } = await supabase.from("vinoshipper_api_changelog")
      .update({ acknowledged_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const filtered = useMemo(
    () => filter === "unack" ? changes.filter(c => !c.acknowledged_at) : changes,
    [changes, filter],
  );
  const unackCount = changes.filter(c => !c.acknowledged_at).length;
  const latest = snapshots[0];

  return (
    <div className="p-6 max-w-7xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold uppercase">Vinoshipper API Watcher</h1>
          <p className="text-sm text-muted-foreground">
            Daily diff of Vinoshipper's OpenAPI spec + endpoint probes. New capabilities surface here so we can ship as VS expands.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Switch checked={flagEnabled} onCheckedChange={toggleFlag} />
            <span>{flagEnabled ? "Watching + emailing admins" : "Paused (no emails)"}</span>
          </div>
          <Button size="sm" variant="outline" onClick={runNow} disabled={running}>
            {running ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <PlayCircle className="w-3 h-3 mr-1" />}
            Run now
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border border-border p-3">
          <div className="text-xs uppercase text-muted-foreground">Unacknowledged changes</div>
          <div className="text-2xl font-bold">{unackCount}</div>
        </div>
        <div className="border border-border p-3">
          <div className="text-xs uppercase text-muted-foreground">Last snapshot</div>
          <div className="text-sm">
            {latest ? new Date(latest.fetched_at).toLocaleString() : "never"}
          </div>
          {latest?.source_url && (
            <a href={latest.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-1">
              {latest.source} <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <div className="border border-border p-3">
          <div className="text-xs uppercase text-muted-foreground">Snapshots stored</div>
          <div className="text-2xl font-bold">{snapshots.length}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {(["unack", "all"] as const).map(f => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "unack" ? "Unacknowledged" : "All"}
          </Button>
        ))}
      </div>

      {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : filtered.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          {filter === "unack" ? "No new API changes. Click 'Run now' to check immediately." : "No changelog entries yet."}
        </div>
      ) : (
        <div className="border border-border divide-y divide-border">
          {filtered.map(c => {
            const Icon = c.acknowledged_at ? CheckCircle2 : AlertCircle;
            const tone = c.acknowledged_at ? "text-emerald-600" : "text-primary";
            return (
              <div key={c.id} className="p-3 flex items-start gap-3 flex-wrap">
                <Icon className={`w-4 h-4 mt-1 ${tone}`} />
                <div className="flex-1 min-w-[260px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{c.change_type}</Badge>
                    {c.endpoint_method && c.endpoint_path && (
                      <code className="text-xs bg-muted px-1.5">{c.endpoint_method} {c.endpoint_path}</code>
                    )}
                    {c.email_sent_at && <Badge variant="secondary" className="text-xs">emailed</Badge>}
                  </div>
                  <div className="text-sm mt-1">{c.summary}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(c.created_at).toLocaleString()}
                  </div>
                </div>
                {!c.acknowledged_at && (
                  <Button size="sm" variant="outline" onClick={() => ack(c.id)}>Mark reviewed</Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}