import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";

type Evt = {
  id: string;
  subject: string;
  event: string;
  identifier: string | null;
  processed: boolean;
  processing_error: string | null;
  received_at: string;
  processed_at: string | null;
  payload: any;
};

export default function CrmWebhooksPage() {
  const [rows, setRows] = useState<Evt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "errors" | "unprocessed">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("vinoshipper_webhook_events")
      .select("id,subject,event,identifier,processed,processing_error,received_at,processed_at,payload")
      .order("received_at", { ascending: false }).limit(200);
    if (filter === "errors") q = q.not("processing_error", "is", null);
    if (filter === "unprocessed") q = q.eq("processed", false);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as any) ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const reprocess = async (id: string) => {
    const { error } = await supabase
      .from("vinoshipper_webhook_events")
      .update({ processed: false, processing_error: null, processed_at: null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Queued for reprocessing on next sweep");
    load();
  };

  const counts = useMemo(() => ({
    total: rows.length,
    errors: rows.filter(r => r.processing_error).length,
    unprocessed: rows.filter(r => !r.processed).length,
  }), [rows]);

  return (
    <>
      <Seo noindex title="Crm Webhooks" />
    <div className="p-6 max-w-7xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold uppercase">Webhook Activity</h1>
          <p className="text-sm text-muted-foreground">Vinoshipper webhook deliveries — last 200 events.</p>
        </div>
        <div className="flex items-center gap-2">
          {(["all", "unprocessed", "errors"] as const).map(f => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="border border-border p-3"><div className="text-xs uppercase text-muted-foreground">Loaded</div><div className="text-2xl font-bold">{counts.total}</div></div>
        <div className="border border-border p-3"><div className="text-xs uppercase text-muted-foreground">Unprocessed</div><div className="text-2xl font-bold">{counts.unprocessed}</div></div>
        <div className="border border-destructive/40 bg-destructive/5 p-3"><div className="text-xs uppercase text-muted-foreground">With errors</div><div className="text-2xl font-bold">{counts.errors}</div></div>
      </div>

      {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : rows.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No webhook events in this view.
        </div>
      ) : (
        <div className="border border-border divide-y divide-border">
          {rows.map(r => {
            const isOpen = expanded === r.id;
            const Icon = r.processing_error ? AlertTriangle : r.processed ? CheckCircle2 : Clock;
            const tone = r.processing_error ? "text-destructive" : r.processed ? "text-emerald-600" : "text-muted-foreground";
            return (
              <div key={r.id} className="p-3">
                <div className="flex items-start gap-3 flex-wrap">
                  <Icon className={`w-4 h-4 mt-0.5 ${tone}`} />
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-xs bg-muted px-1.5">{r.subject}.{r.event}</code>
                      {r.identifier && <span className="text-xs text-muted-foreground">#{r.identifier}</span>}
                      <Badge variant={r.processing_error ? "destructive" : r.processed ? "default" : "secondary"}>
                        {r.processing_error ? "error" : r.processed ? "processed" : "pending"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      received {new Date(r.received_at).toLocaleString()}
                      {r.processed_at && ` · processed ${new Date(r.processed_at).toLocaleString()}`}
                    </div>
                    {r.processing_error && <div className="text-xs text-destructive mt-1 font-mono">{r.processing_error}</div>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setExpanded(isOpen ? null : r.id)}>
                      {isOpen ? "Hide" : "Payload"}
                    </Button>
                    {(r.processing_error || !r.processed) && (
                      <Button size="sm" onClick={() => reprocess(r.id)}>Re-queue</Button>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <pre className="text-xs bg-muted p-3 mt-3 overflow-x-auto max-h-80">
                    {JSON.stringify(r.payload, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
}