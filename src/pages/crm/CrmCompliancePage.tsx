import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, ShieldCheck, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";

type Audit = {
  id: string; status: string; source: string; triggered_by: string;
  started_at: string; finished_at: string | null;
  ok_count: number; warn_count: number; fail_count: number; topic_count: number;
};
type Finding = {
  id: string; audit_id: string; topic: string; status: string; summary: string;
  findings: string[]; recommendations: string[]; citations: string[];
};

const statusIcon = (s: string) => s === "ok" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : s === "warn" ? <AlertTriangle className="h-4 w-4 text-yellow-600" /> : <XCircle className="h-4 w-4 text-red-600" />;

export default function CrmCompliancePage() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: a } = await supabase.from("compliance_audits").select("*").order("started_at", { ascending: false }).limit(20);
    setAudits((a as Audit[]) ?? []);
    if (a && a.length && !selected) setSelected(a[0].id);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selected) { setFindings([]); return; }
    supabase.from("compliance_findings").select("*").eq("audit_id", selected)
      .then(({ data }) => setFindings((data as Finding[]) ?? []));
  }, [selected]);

  const runNow = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("compliance-audit", { body: { triggered_by: "manual" } });
      if (error) throw error;
      toast.success("Audit complete");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Audit failed");
    } finally { setRunning(false); }
  };

  return (
    <>
      <Seo noindex title="Crm Compliance" />
    <div className="p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="h-6 w-6" /> Compliance Audit</h1>
          <p className="text-sm text-muted-foreground">Weekly automated review of legal & regulatory compliance. Source: Lovable AI.</p>
        </div>
        <Button onClick={runNow} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          Run now
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-4 p-3 space-y-2 max-h-[70vh] overflow-auto">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent runs</h2>
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && audits.length === 0 && <p className="text-sm text-muted-foreground">No audits yet. Click "Run now".</p>}
          {audits.map(a => (
            <button key={a.id} onClick={() => setSelected(a.id)}
              className={`w-full text-left p-2 border ${selected === a.id ? "border-primary bg-accent" : "border-border"}`}>
              <div className="text-xs text-muted-foreground">{new Date(a.started_at).toLocaleString()}</div>
              <div className="text-sm font-medium capitalize">{a.status} · {a.triggered_by}</div>
              <div className="flex gap-2 text-xs mt-1">
                <span className="text-green-600">{a.ok_count} ok</span>
                <span className="text-yellow-600">{a.warn_count} warn</span>
                <span className="text-red-600">{a.fail_count} fail</span>
              </div>
            </button>
          ))}
        </Card>

        <div className="col-span-8 space-y-3 max-h-[70vh] overflow-auto">
          {findings.length === 0 && <p className="text-sm text-muted-foreground">Select a run to view findings.</p>}
          {findings.map(f => (
            <Card key={f.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {statusIcon(f.status)}
                  <h3 className="font-semibold">{f.topic}</h3>
                </div>
                <Badge variant={f.status === "ok" ? "secondary" : f.status === "warn" ? "outline" : "destructive"}>
                  {f.status.toUpperCase()}
                </Badge>
              </div>
              {f.summary && <p className="text-sm">{f.summary}</p>}
              {f.findings?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mt-2">Findings</div>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {f.findings.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              )}
              {f.recommendations?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mt-2">Recommendations</div>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {f.recommendations.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              )}
              {f.citations?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mt-2">Sources</div>
                  <ul className="list-disc pl-5 text-xs space-y-0.5 text-muted-foreground">
                    {f.citations.map((x, i) => <li key={i}>{x.startsWith("http") ? <a href={x} target="_blank" rel="noreferrer" className="underline">{x}</a> : x}</li>)}
                  </ul>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}