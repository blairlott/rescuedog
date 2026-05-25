import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, X, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Proposal = {
  id: string;
  category: string;
  title: string;
  summary: string;
  rationale: string | null;
  risk_level: "low" | "medium" | "high";
  source: string;
  status: string;
  target_kind: string;
  target_payload: any;
  decision_notes: string | null;
  decided_at: string | null;
  executed_at: string | null;
  execution_result: any;
  created_at: string;
  expires_at: string;
};

const TABS = ["pending", "approved", "executed", "rejected", "expired", "failed"] as const;

export default function CrmRestructuresPage() {
  const [rows, setRows] = useState<Proposal[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>("pending");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("restructure_proposals")
      .select("*")
      .eq("status", tab)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setRows((data as Proposal[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("restructure_proposals_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "restructure_proposals" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const decide = async (id: string, decision: "approve" | "reject") => {
    setBusy(id);
    try {
      const { data, error } = await supabase.functions.invoke("restructure-decisions", {
        body: { id, decision, notes: notesById[id] || null },
      });
      if (error) throw error;
      toast.success(decision === "approve" ? "Approved — executing" : "Rejected");
      const exec = (data as any)?.executed;
      if (decision === "approve" && exec && exec.success === false) {
        toast.error("Auto-execute failed: " + (exec.result?.error ?? "unknown"));
      }
      load();
    } catch (e: any) {
      toast.error(e?.message || "Decision failed");
    } finally {
      setBusy(null);
    }
  };

  const riskClass = (r: string) =>
    r === "high" ? "bg-destructive/10 border-destructive/40 text-destructive"
      : r === "low" ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700"
      : "bg-amber-500/10 border-amber-500/40 text-amber-700";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-brand flex items-center gap-2">
          <ShieldCheck className="w-7 h-7" /> Restructure Go/No-Go
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Owner/admin approval required for A/B winners, layout swaps, commerce flow changes, and catalog/IA shifts. Approvals auto-execute.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs uppercase tracking-brand border-b-2 ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-border p-8 text-center text-muted-foreground">
          No proposals in <strong>{tab}</strong>.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((p) => (
            <article key={p.id} className="border border-border bg-card p-5">
              <header className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="outline" className="uppercase text-[10px]">{p.category.replace(/_/g, " ")}</Badge>
                    <Badge variant="outline" className={`uppercase text-[10px] ${riskClass(p.risk_level)}`}>{p.risk_level} risk</Badge>
                    <Badge variant="outline" className="uppercase text-[10px]">{p.source}</Badge>
                  </div>
                  <h2 className="text-lg font-bold">{p.title}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{p.summary}</p>
                  {p.rationale && <p className="text-xs text-muted-foreground mt-2"><strong>Why:</strong> {p.rationale}</p>}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>Opened {new Date(p.created_at).toLocaleString()}</div>
                  {p.status === "pending" && <div>Expires {new Date(p.expires_at).toLocaleDateString()}</div>}
                  {p.decided_at && <div>Decided {new Date(p.decided_at).toLocaleString()}</div>}
                  {p.executed_at && <div>Executed {new Date(p.executed_at).toLocaleString()}</div>}
                </div>
              </header>

              <details className="mt-3">
                <summary className="text-xs uppercase tracking-brand text-muted-foreground cursor-pointer">Execution target</summary>
                <pre className="mt-2 text-[11px] bg-muted/40 p-2 overflow-auto">{p.target_kind}{"\n"}{JSON.stringify(p.target_payload, null, 2)}</pre>
              </details>

              {p.execution_result && (
                <div className="mt-3 text-xs">
                  <div className="uppercase tracking-brand text-muted-foreground">Execution result</div>
                  <pre className="bg-muted/40 p-2 overflow-auto">{JSON.stringify(p.execution_result, null, 2)}</pre>
                </div>
              )}

              {tab === "pending" && (
                <div className="mt-4 space-y-2">
                  <Textarea
                    placeholder="Optional decision notes…"
                    value={notesById[p.id] || ""}
                    onChange={(e) => setNotesById((s) => ({ ...s, [p.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => decide(p.id, "approve")} disabled={busy === p.id} className="bg-emerald-600 hover:bg-emerald-700">
                      {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-1" />} Approve &amp; ship
                    </Button>
                    <Button onClick={() => decide(p.id, "reject")} disabled={busy === p.id} variant="outline">
                      <X className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </div>
                  {p.risk_level === "high" && (
                    <div className="flex items-center gap-2 text-xs text-destructive">
                      <AlertTriangle className="w-3.5 h-3.5" /> High-risk — double-check the execution target before approving.
                    </div>
                  )}
                </div>
              )}
              {p.decision_notes && (
                <div className="mt-3 text-xs text-muted-foreground"><strong>Notes:</strong> {p.decision_notes}</div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}