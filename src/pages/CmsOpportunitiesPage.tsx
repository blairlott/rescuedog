import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCmsAuth } from "@/hooks/useCmsAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Check, X, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { Seo } from "@/components/Seo";

const CATEGORY_LABELS: Record<string, string> = {
  hero_copy: "Hero copy",
  hero_image: "Hero image",
  cart_upsell: "Cart upsell",
  pricing: "Pricing",
  bundle: "Bundle",
  merch_copy: "Merch copy",
  other: "Other",
};

export default function CmsOpportunitiesPage() {
  const { canEdit, loading: authLoading } = useCmsAuth();
  const allowed = canEdit();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);

  const { data: opps, isLoading } = useQuery({
    queryKey: ["opt-opportunities"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("optimization_opportunities" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["opt-settings"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("optimization_settings" as any)
        .select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "approve" | "reject" }) => {
      const { error } = await supabase.rpc("apply_opportunity_decision" as any, {
        _id: id,
        _decision: decision,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast({ title: v.decision === "approve" ? "Approved" : "Rejected" });
      qc.invalidateQueries({ queryKey: ["opt-opportunities"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const toggleAuto = useMutation({
    mutationFn: async ({ category, autonomous }: { category: string; autonomous: boolean }) => {
      const { error } = await supabase.rpc("set_autonomous_mode" as any, {
        _category: category,
        _autonomous: autonomous,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["opt-settings"] }),
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const runScan = async () => {
    setScanning(true);
    try {
      const { error } = await supabase.functions.invoke("optimization-scanner");
      if (error) throw error;
      toast({ title: "Scan complete", description: "New opportunities loaded." });
      qc.invalidateQueries({ queryKey: ["opt-opportunities"] });
    } catch (e: any) {
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  if (authLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!allowed) return <div className="p-8">Owner or admin access required.</div>;

  const pending = (opps ?? []).filter((o: any) => o.status === "pending");
  const recent = (opps ?? []).filter((o: any) => o.status !== "pending").slice(0, 50);

  return (
    <>
      <Seo noindex title="Cms Opportunities" />
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/cms" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Optimization Opportunities</h1>
              <p className="text-xs text-muted-foreground">
                Conversion + AOV proposals. Approve, reject, or flip a category to autonomous.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={runScan} disabled={scanning} className="gap-1.5">
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Run scan now
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Autonomy toggles */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Autonomous mode by category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              When ON, the system applies high-confidence proposals in that category without waiting for approval.
              The change is still logged here for review.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(settings ?? []).map((s: any) => (
                <div key={s.category} className="flex items-center justify-between border border-border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{CATEGORY_LABELS[s.category] ?? s.category}</div>
                    <div className="text-xs text-muted-foreground">
                      Min confidence {Math.round(Number(s.min_confidence) * 100)}%
                    </div>
                  </div>
                  <Switch
                    checked={!!s.autonomous}
                    onCheckedChange={(v) => toggleAuto.mutate({ category: s.category, autonomous: v })}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending queue */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Pending approval ({pending.length})
          </h2>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : pending.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-dashed border-border p-6 text-center">
              No pending opportunities. The scanner runs daily.
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((o: any) => (
                <OpportunityRow key={o.id} opp={o} onDecide={(d) => decide.mutate({ id: o.id, decision: d })} />
              ))}
            </div>
          )}
        </section>

        {/* History */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Recent decisions
          </h2>
          {recent.length === 0 ? (
            <div className="text-sm text-muted-foreground">No history yet.</div>
          ) : (
            <div className="space-y-2">
              {recent.map((o: any) => (
                <div key={o.id} className="border border-border px-3 py-2 flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{o.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[o.category] ?? o.category} · {o.goal}
                      {o.auto_applied ? " · auto-applied" : ""}
                    </div>
                  </div>
                  <Badge variant={o.status === "applied" ? "default" : o.status === "approved" ? "secondary" : "outline"}>
                    {o.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
    </>
  );
}

function OpportunityRow({ opp, onDecide }: { opp: any; onDecide: (d: "approve" | "reject") => void }) {
  return (
    <>
      <Seo noindex title="Cms Opportunities" />
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant="outline">{CATEGORY_LABELS[opp.category] ?? opp.category}</Badge>
              <Badge variant="secondary">{opp.goal}</Badge>
              {opp.surface && <Badge variant="outline">{opp.surface}</Badge>}
              <span className="text-xs text-muted-foreground">
                Confidence {Math.round(Number(opp.confidence) * 100)}%
                {opp.est_lift_pct ? ` · est. +${Number(opp.est_lift_pct).toFixed(1)}%` : ""}
              </span>
            </div>
            <div className="font-medium text-sm">{opp.title}</div>
            <p className="text-xs text-muted-foreground mt-1">{opp.rationale}</p>
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer">Proposed change</summary>
              <pre className="text-xs bg-muted p-2 mt-1 overflow-x-auto">
                {JSON.stringify(opp.proposed_change, null, 2)}
              </pre>
            </details>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button size="sm" onClick={() => onDecide("approve")} className="gap-1">
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDecide("reject")} className="gap-1">
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    </>
  );
}