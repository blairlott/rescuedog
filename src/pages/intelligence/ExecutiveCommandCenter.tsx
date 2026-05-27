import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
import { Seo } from "@/components/Seo";
  AlertTriangle, Brain, CheckCircle2, ChevronDown, ChevronRight,
  Mail, RefreshCw, Sparkles, TrendingDown, TrendingUp, XCircle, MapPin,
} from "lucide-react";

const SHARP = { borderRadius: 0 } as const;

type Decision = {
  id: string; priority: number; category: string; scope: string; scope_id: string | null;
  title: string; narrative: string | null; recommended_action: string;
  action_kind: string; action_payload: any; estimated_impact_cents: number | null;
  confidence: number | null; status: string; source_engine: string | null; created_at: string;
};

type Anomaly = { id: string; platform: string; scope_label: string | null; metric: string;
  observed: number; expected: number; severity: string; kind: string; narrative: string | null; detected_at: string };

type KPI = { label: string; value: string; delta?: string; tone?: "up" | "down" | "flat" };

function money(n: number) { return `$${Math.round(n).toLocaleString()}`; }

export default function ExecutiveCommandCenter() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [windowDays, setWindowDays] = useState<7 | 30 | 90 | 180 | 365>(7);

  const { data, isLoading } = useQuery({
    queryKey: ["intelligence-cmd", windowDays],
    queryFn: async () => {
      // Pull 2x the window so we can compare current period vs prior period.
      const lookback = new Date(Date.now() - windowDays * 2 * 86400000).toISOString().slice(0, 10);
      const [decRes, anomRes, bizRes, adRes, cohortRes] = await Promise.all([
        supabase.from("executive_decisions" as any).select("*").eq("status", "pending")
          .order("priority", { ascending: false }).order("created_at", { ascending: false }).limit(50),
        supabase.from("ad_anomalies" as any).select("*").is("resolved_at", null)
          .order("detected_at", { ascending: false }).limit(15),
        supabase.from("business_revenue_facts" as any).select("date,channel,gross_revenue_cents,orders").gte("date", lookback).limit(50000),
        supabase.from("ad_performance_daily" as any).select("date,spend,revenue,conversions").gte("date", lookback).limit(50000),
        supabase.from("customer_cohorts" as any).select("segment,churn_probability,lifetime_revenue_cents,orders_count").limit(20000),
      ]);
      return {
        decisions: (decRes.data as any as Decision[]) ?? [],
        anomalies: (anomRes.data as any as Anomaly[]) ?? [],
        biz: (bizRes.data as any[]) ?? [],
        ad: (adRes.data as any[]) ?? [],
        cohorts: (cohortRes.data as any[]) ?? [],
      };
    },
  });

  const kpis: KPI[] = useMemo(() => {
    if (!data) return [];
    const today = new Date().toISOString().slice(0, 10);
    const dCur = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
    const dPrev = new Date(Date.now() - windowDays * 2 * 86400000).toISOString().slice(0, 10);
    const sumBiz = (f: string, from: string, to: string) =>
      data.biz.filter(r => r.date >= from && r.date < to).reduce((s, r) => s + Number(r[f] ?? 0), 0);
    const sumAd = (f: string, from: string, to: string) =>
      data.ad.filter(r => r.date >= from && r.date < to).reduce((s, r) => s + Number(r[f] ?? 0), 0);
    const rev7 = sumBiz("gross_revenue_cents", dCur, today) / 100;
    const revP = sumBiz("gross_revenue_cents", dPrev, dCur) / 100;
    const spend7 = sumAd("spend", dCur, today);
    const spendP = sumAd("spend", dPrev, dCur);
    const orders7 = sumBiz("orders", dCur, today);
    const attrRev7 = sumAd("revenue", dCur, today);
    const dPct = (a: number, b: number) => b > 0 ? ((a - b) / b) * 100 : 0;
    const periodLabel = windowDays === 7 ? "WoW" : windowDays === 30 ? "MoM" : `vs prior ${windowDays}d`;
    const dStr = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}% ${periodLabel}`;
    const tone = (n: number) => n > 1 ? "up" : n < -1 ? "down" : "flat";
    const atRisk = data.cohorts.filter(c => Number(c.churn_probability ?? 0) > 0.6).length;
    const wLabel = `${windowDays}d`;
    return [
      { label: `Revenue (${wLabel})`, value: money(rev7), delta: dStr(dPct(rev7, revP)), tone: tone(dPct(rev7, revP)) },
      { label: `Ad spend (${wLabel})`, value: money(spend7), delta: dStr(dPct(spend7, spendP)), tone: tone(-dPct(spend7, spendP)) },
      { label: "Blended ROAS", value: spend7 > 0 ? `${(rev7 / spend7).toFixed(2)}x` : "—", delta: spend7 > 0 ? `Attr ${(attrRev7 / spend7).toFixed(2)}x` : "" },
      { label: `Orders (${wLabel})`, value: orders7.toLocaleString(), delta: orders7 > 0 ? `${money(rev7 / orders7)} AOV` : "" },
      { label: "Customers at risk", value: atRisk.toLocaleString(), delta: atRisk > 0 ? "Churn p > 0.6" : "", tone: atRisk > 0 ? "down" : "flat" },
    ];
  }, [data, windowDays]);

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  const act = async (decisionId: string, action: "approve" | "reject" | "snooze") => {
    setBusy(decisionId + action);
    try {
      const { error } = await supabase.rpc("approve_executive_decision" as any, { _decision_id: decisionId, _action: action });
      if (error) throw error;
      toast.success(`Decision ${action}d`);
      await qc.invalidateQueries({ queryKey: ["intelligence-cmd"] });
    } catch (e: any) {
      toast.error(`Failed: ${e?.message ?? String(e)}`);
    } finally { setBusy(null); }
  };

  const runAutopilot = async (sendBrief: boolean) => {
    setBusy(sendBrief ? "brief" : "autopilot");
    try {
      toast.message(sendBrief ? "Running full autopilot…" : "Running engines…", { description: "Ingest · attribution · margin · geo · anomalies" });
      const { data: res, error } = await supabase.functions.invoke("intelligence-autopilot", {
        body: { skip_ingest: false, send_brief: sendBrief },
      });
      if (error) throw error;
      toast.success("Autopilot complete", { description: sendBrief ? "Brief sent" : "" });
      await qc.invalidateQueries({ queryKey: ["intelligence-cmd"] });
      console.log("autopilot result", res);
    } catch (e: any) {
      toast.error("Autopilot failed", { description: e?.message ?? String(e) });
    } finally { setBusy(null); }
  };

  const grouped = useMemo(() => {
    if (!data) return {} as Record<string, Decision[]>;
    const g: Record<string, Decision[]> = { ads: [], club: [], geo: [], other: [] };
    for (const d of data.decisions) {
      if (d.category === "ads" && d.scope.startsWith("geo")) g.geo.push(d);
      else if (d.category === "ads") g.ads.push(d);
      else if (d.category === "club") g.club.push(d);
      else g.other.push(d);
    }
    return g;
  }, [data]);

  return (
    <>
      <Seo noindex title="Executive Command Center" />
    <div className="min-h-dvh bg-background text-foreground">
      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3 border-b border-border pb-4">
          <div>
            <div className="text-xs uppercase tracking-brand text-muted-foreground flex items-center gap-2">
              <Brain className="h-3 w-3" /> Executive Intelligence
            </div>
            <h1 className="text-4xl font-bold uppercase tracking-brand" style={{ fontFamily: '"Nunito Sans", system-ui, sans-serif' }}>
              Command Center
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Actionable intelligence beyond personal capacity.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex border border-border" style={SHARP}>
              {([7, 30, 90, 180, 365] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setWindowDays(d)}
                  className={`px-3 py-1.5 text-[11px] uppercase tracking-brand border-r border-border last:border-r-0 transition ${
                    windowDays === d ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted/50"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" style={SHARP} disabled={!!busy}
              onClick={() => runAutopilot(false)} className="uppercase tracking-brand text-xs">
              <RefreshCw className={`h-3 w-3 mr-1 ${busy === "autopilot" ? "animate-spin" : ""}`} /> Run autopilot
            </Button>
            <Button size="sm" style={SHARP} disabled={!!busy}
              onClick={() => runAutopilot(true)} className="uppercase tracking-brand text-xs bg-primary text-primary-foreground">
              <Mail className={`h-3 w-3 mr-1 ${busy === "brief" ? "animate-pulse" : ""}`} /> Send morning brief
            </Button>
          </div>
        </header>

        {/* KPI strip */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className="border border-border bg-card p-3" style={SHARP}>
              <div className="text-[10px] uppercase tracking-brand text-muted-foreground">{k.label}</div>
              <div className="text-2xl font-bold mt-1">{k.value}</div>
              {k.delta && (
                <div className={`text-[11px] mt-1 flex items-center gap-1 ${k.tone === "up" ? "text-emerald-600" : k.tone === "down" ? "text-destructive" : "text-muted-foreground"}`}>
                  {k.tone === "up" && <TrendingUp className="h-3 w-3" />}
                  {k.tone === "down" && <TrendingDown className="h-3 w-3" />}
                  {k.delta}
                </div>
              )}
            </div>
          ))}
        </section>

        {/* Decisions queue */}
        <section className="grid lg:grid-cols-3 gap-4">
          <DecisionColumn title="Ads decisions" icon={<Sparkles className="h-3 w-3" />} decisions={grouped.ads} onAct={act} busy={busy}
            expanded={expanded} onToggle={toggleExpand} />
          <DecisionColumn title="Geo & demand" icon={<MapPin className="h-3 w-3" />} decisions={grouped.geo} onAct={act} busy={busy}
            expanded={expanded} onToggle={toggleExpand} />
          <DecisionColumn title="Customers & club" icon={<Brain className="h-3 w-3" />} decisions={[...grouped.club, ...grouped.other]} onAct={act} busy={busy}
            expanded={expanded} onToggle={toggleExpand} />
        </section>

        {/* Anomalies feed */}
        <section className="border border-border bg-card" style={SHARP}>
          <div className="px-4 py-2 border-b border-border text-xs uppercase tracking-brand text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="h-3 w-3" /> Live anomalies
          </div>
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : !data?.anomalies.length ? (
            <div className="p-6 text-sm text-muted-foreground">No open anomalies. Run autopilot to scan.</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.anomalies.map(a => (
                <li key={a.id} className="p-3 text-sm flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold uppercase tracking-brand text-xs flex items-center gap-2">
                      <Badge style={SHARP} className={`text-[9px] ${a.severity === "critical" ? "bg-destructive text-destructive-foreground" : a.severity === "warn" ? "bg-amber-500 text-white" : "bg-muted"}`}>{a.severity}</Badge>
                      {a.platform.toUpperCase()} · {a.scope_label ?? "channel"} · {a.metric}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Observed {Number(a.observed).toFixed(2)} vs expected {Number(a.expected).toFixed(2)} ({a.kind})
                    </div>
                    {a.narrative && <div className="text-xs mt-1">{a.narrative}</div>}
                  </div>
                  <div className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(a.detected_at).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
    </>
  );
}

function DecisionColumn({ title, icon, decisions, onAct, busy, expanded, onToggle }: {
  title: string; icon: React.ReactNode; decisions: Decision[];
  onAct: (id: string, a: "approve" | "reject" | "snooze") => void;
  busy: string | null; expanded: Set<string>; onToggle: (id: string) => void;
}) {
  return (
    <>
      <Seo noindex title="Executive Command Center" />
    <div className="border border-border bg-card" style={SHARP}>
      <div className="px-3 py-2 border-b border-border text-xs uppercase tracking-brand text-muted-foreground flex items-center gap-2">
        {icon} {title} <span className="ml-auto text-foreground font-bold">{decisions.length}</span>
      </div>
      {!decisions.length ? (
        <div className="p-6 text-center text-xs text-muted-foreground">Nothing here. Clear inbox.</div>
      ) : decisions.map(d => {
        const isOpen = expanded.has(d.id);
        return (
          <div key={d.id} className="border-b border-border last:border-0">
            <button onClick={() => onToggle(d.id)} className="w-full text-left px-3 py-2 hover:bg-muted/40 transition">
              <div className="flex items-start gap-2">
                {isOpen ? <ChevronDown className="h-3 w-3 mt-1 shrink-0" /> : <ChevronRight className="h-3 w-3 mt-1 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge style={SHARP} className={`text-[9px] ${d.priority >= 85 ? "bg-destructive text-destructive-foreground" : d.priority >= 70 ? "bg-amber-500 text-white" : "bg-muted"}`}>P{d.priority}</Badge>
                    {d.estimated_impact_cents != null && (
                      <span className="text-[10px] text-muted-foreground">{money(d.estimated_impact_cents / 100)} impact</span>
                    )}
                  </div>
                  <div className="font-bold text-sm mt-1">{d.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{d.recommended_action}</div>
                </div>
              </div>
            </button>
            {isOpen && (
              <div className="px-6 pb-3 space-y-2">
                {d.narrative && <p className="text-xs text-muted-foreground">{d.narrative}</p>}
                {d.source_engine && <div className="text-[10px] uppercase tracking-brand text-muted-foreground">Source: {d.source_engine}</div>}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" style={SHARP} disabled={!!busy} onClick={() => onAct(d.id, "approve")}
                    className="bg-primary text-primary-foreground text-xs uppercase tracking-brand">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" style={SHARP} disabled={!!busy} onClick={() => onAct(d.id, "snooze")}
                    className="text-xs uppercase tracking-brand">Snooze</Button>
                  <Button size="sm" variant="outline" style={SHARP} disabled={!!busy} onClick={() => onAct(d.id, "reject")}
                    className="text-xs uppercase tracking-brand text-destructive">
                    <XCircle className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
    </>
  );
}