import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Sparkles, Check, X, RefreshCw, AlertTriangle, Tag, PackageX, Lightbulb } from "lucide-react";

type Action = {
  id: string;
  sku_id: string | null;
  action_type: string;
  status: string;
  reason: string | null;
  ai_confidence: number | null;
  current_snapshot: any;
  proposed_change: any;
  proposed_replacement: any;
  source: string;
  created_at: string;
  review_note: string | null;
  reviewed_at: string | null;
};

const TYPE_META: Record<string, { label: string; icon: any; tone: string }> = {
  remove_unavailable: { label: "Remove unavailable", icon: PackageX, tone: "destructive" },
  replace_sku: { label: "Replace SKU", icon: RefreshCw, tone: "default" },
  adjust_price: { label: "Adjust price", icon: Tag, tone: "secondary" },
  add_recommendation: { label: "New product idea", icon: Lightbulb, tone: "default" },
  restock_alert: { label: "Restock alert", icon: AlertTriangle, tone: "secondary" },
  margin_warning: { label: "Margin warning", icon: AlertTriangle, tone: "destructive" },
};

export function CurationTab() {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("merch_curation_actions")
      .select("*")
      .eq("status", filter)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setActions((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const runScan = async () => {
    setScanning(true);
    const { data, error } = await supabase.functions.invoke("merch-curation-scan", { body: { simulate: true } });
    setScanning(false);
    if (error) return toast.error(error.message);
    toast.success(`Scanned ${data?.scanned ?? 0} SKUs · ${data?.proposed ?? 0} new proposals`);
    setFilter("pending");
    load();
  };

  const decide = async (id: string, decision: "approve" | "reject") => {
    const { error } = await supabase.functions.invoke("merch-curation-apply", { body: { action_id: id, decision } });
    if (error) return toast.error(error.message);
    toast.success(decision === "approve" ? "Approved & applied" : "Rejected");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">AI Curation Queue</h2>
          <span className="text-xs text-muted-foreground">Self-managing storefront · admin approval required</span>
        </div>
        <div className="flex items-center gap-2">
          {(["pending","approved","rejected"] as const).map((s) => (
            <Button key={s} size="sm" variant={filter===s?"default":"outline"} onClick={() => setFilter(s)} className="capitalize">{s}</Button>
          ))}
          <Button size="sm" onClick={runScan} disabled={scanning}>
            <RefreshCw className={`h-4 w-4 mr-1 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Scanning…" : "Run AI scan"}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : actions.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No {filter} actions. Click <strong>Run AI scan</strong> to look for stale SKUs, margin issues, and new product ideas.
        </Card>
      ) : (
        <div className="grid gap-3">
          {actions.map((a) => {
            const meta = TYPE_META[a.action_type] ?? { label: a.action_type, icon: Sparkles, tone: "secondary" };
            const Icon = meta.icon;
            return (
              <Card key={a.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="rounded-md bg-muted p-2"><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={meta.tone as any}>{meta.label}</Badge>
                        <Badge variant="outline" className="text-xs">{a.source}</Badge>
                        {a.ai_confidence != null && (
                          <span className="text-xs text-muted-foreground">{Math.round(a.ai_confidence * 100)}% confidence</span>
                        )}
                      </div>
                      <p className="text-sm mt-1">{a.reason}</p>
                      <div className="grid sm:grid-cols-2 gap-3 mt-3 text-xs">
                        {a.current_snapshot && Object.keys(a.current_snapshot).length > 0 && (
                          <div className="rounded border p-2">
                            <div className="font-semibold text-muted-foreground mb-1">Current</div>
                            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(a.current_snapshot, null, 2)}</pre>
                          </div>
                        )}
                        {a.proposed_change && Object.keys(a.proposed_change).length > 0 && (
                          <div className="rounded border p-2 bg-primary/5">
                            <div className="font-semibold text-primary mb-1">Proposed</div>
                            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(a.proposed_change, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                      {a.proposed_replacement && (
                        <div className="mt-2 text-xs rounded border p-2 bg-muted/40">
                          <span className="font-semibold">Suggested replacement: </span>
                          {a.proposed_replacement.product_title} · ${(a.proposed_replacement.retail_cents/100).toFixed(2)}
                        </div>
                      )}
                      {a.review_note && (
                        <p className="text-xs text-muted-foreground mt-2">Note: {a.review_note}</p>
                      )}
                    </div>
                  </div>
                  {filter === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => decide(a.id, "reject")}><X className="h-4 w-4 mr-1" />Reject</Button>
                      <Button size="sm" onClick={() => decide(a.id, "approve")}><Check className="h-4 w-4 mr-1" />Approve</Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}