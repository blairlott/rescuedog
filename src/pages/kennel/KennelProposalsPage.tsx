import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { RefreshCw, Lightbulb, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { Seo } from "@/components/Seo";

const SHARP = { borderRadius: 0 } as const;
const BRAND_FONT = { fontFamily: '"Nunito Sans", system-ui, sans-serif' } as const;

type Row = {
  id: string;
  proposed_at: string;
  title: string;
  rationale: string;
  confidence: number | null;
  source_window_days: number;
  proposed_rule: any;
  evidence: any;
  status: string;
  review_notes: string | null;
  reviewed_at: string | null;
};

type Filter = "pending" | "approved" | "rejected" | "all";

function relTime(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-amber-500 text-black",
    approved: "bg-green-600 text-white",
    rejected: "bg-muted text-muted-foreground",
    implemented: "bg-primary text-primary-foreground",
  };
  return (
    <>
      <Seo noindex title="Kennel Proposals" />
    <Badge style={SHARP} className={`uppercase tracking-brand text-[10px] ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </Badge>
    </>
  );
}

export default function KennelProposalsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<Filter>("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("kennel_rule_suggestions" as any)
      .select("*")
      .order("proposed_at", { ascending: false })
      .limit(200);
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) { toast.error(error.message); setRows([]); }
    else setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const summary = useMemo(() => {
    const pending = rows.filter((r) => r.status === "pending").length;
    return { total: rows.length, pending };
  }, [rows]);

  const review = async (id: string, action: "approved" | "rejected") => {
    const { error } = await supabase
      .from("kennel_rule_suggestions" as any)
      .update({
        status: action,
        review_notes: notes[id] ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(action === "approved" ? "Approved" : "Rejected"); load(); }
  };

  const runNow = async () => {
    setRunning(true);
    const { error } = await supabase.functions.invoke("kennel-rule-suggestions", { body: {} });
    setRunning(false);
    if (error) toast.error(error.message);
    else { toast.success("Suggestion run triggered — may take 30s"); setTimeout(load, 3000); }
  };

  return (
    <>
      <Seo noindex title="Kennel Proposals" />
    <div className="p-4 md:p-6 space-y-4" style={BRAND_FONT}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold uppercase tracking-brand text-foreground flex items-center gap-2">
            <Lightbulb className="h-5 w-5" /> Rule Proposals
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            AI-generated auto-rule suggestions from 30-day pattern scans. Runs weekly Monday 09:00 UTC.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" style={SHARP} onClick={runNow} disabled={running} className="gap-2">
            <Lightbulb className={`h-4 w-4 ${running ? "animate-pulse" : ""}`} /> Generate now
          </Button>
          <Button variant="outline" size="sm" style={SHARP} onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Tile label="Showing" value={summary.total} />
        <Tile label="Pending" value={summary.pending} accent="text-amber-600" />
      </div>

      <div className="flex flex-wrap items-center gap-1 border border-border p-2 bg-card" style={SHARP}>
        {(["pending", "approved", "rejected", "all"] as Filter[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={SHARP}
            className={`px-2 py-1 text-[10px] uppercase tracking-brand border ${
              filter === s
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {loading && <div className="text-center text-muted-foreground py-6 text-xs">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="border border-border bg-card p-6 text-center text-xs text-muted-foreground" style={SHARP}>
            No proposals in this view. The weekly cron generates new ones from observed patterns.
          </div>
        )}
        {rows.map((r) => {
          const isOpen = expanded === r.id;
          return (
            <div key={r.id} className="border border-border bg-card" style={SHARP}>
              <button
                onClick={() => setExpanded(isOpen ? null : r.id)}
                className="w-full flex items-start gap-2 p-3 text-left hover:bg-muted/30"
              >
                <div className="mt-0.5">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {statusBadge(r.status)}
                    {r.confidence != null && (
                      <span className="text-[10px] uppercase tracking-brand text-muted-foreground">
                        confidence {(r.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">{relTime(r.proposed_at)}</span>
                  </div>
                  <div className="font-bold text-sm text-foreground mt-1">{r.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{r.rationale}</div>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-border p-3 space-y-3 bg-muted/20">
                  <div>
                    <div className="text-[10px] uppercase tracking-brand text-muted-foreground mb-1">Rationale</div>
                    <div className="text-xs whitespace-pre-wrap">{r.rationale}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-brand text-muted-foreground mb-1">Proposed rule</div>
                    <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-card border border-border p-2" style={SHARP}>
                      {JSON.stringify(r.proposed_rule, null, 2)}
                    </pre>
                  </div>
                  {r.evidence && (
                    <div>
                      <div className="text-[10px] uppercase tracking-brand text-muted-foreground mb-1">Evidence</div>
                      <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-card border border-border p-2 max-h-48 overflow-auto" style={SHARP}>
                        {JSON.stringify(r.evidence, null, 2)}
                      </pre>
                    </div>
                  )}
                  {r.status === "pending" ? (
                    <div className="space-y-2">
                      <Textarea
                        value={notes[r.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                        placeholder="Review notes (optional)"
                        className="text-xs"
                        style={SHARP}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" style={SHARP} className="gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => review(r.id, "approved")}>
                          <Check className="h-3 w-3" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" style={SHARP} className="gap-1" onClick={() => review(r.id, "rejected")}>
                          <X className="h-3 w-3" /> Reject
                        </Button>
                      </div>
                    </div>
                  ) : r.review_notes ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-brand text-muted-foreground mb-1">Review notes</div>
                      <div className="text-xs whitespace-pre-wrap">{r.review_notes}</div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}

function Tile({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <>
      <Seo noindex title="Kennel Proposals" />
    <div className="border border-border bg-card p-3" style={SHARP}>
      <div className="text-[10px] uppercase tracking-brand text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${accent ?? "text-foreground"}`}>{value}</div>
    </div>
    </>
  );
}