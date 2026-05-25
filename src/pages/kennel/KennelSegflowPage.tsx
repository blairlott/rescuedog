import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, RefreshCw, Zap, Save } from "lucide-react";
import { JobRunHistory } from "@/components/kennel/JobRunHistory";
import { useUserRole } from "@/hooks/useUserRole";

type SignalRow = {
  email: string;
  signal: string;
  previous_signal: string | null;
  last_order_at: string | null;
  days_since_order: number | null;
  order_count: number | null;
  ltv_cents: number | null;
  mailchimp_tag: string | null;
  pushed_at: string | null;
  push_status: string | null;
  push_error: string | null;
  computed_at: string | null;
  signal_changed_at: string | null;
};

const SIGNAL_TONE: Record<string, string> = {
  reorder_nudge: "bg-blue-500/15 text-blue-700 border-blue-500/40",
  churn_risk: "bg-amber-500/15 text-amber-700 border-amber-500/40",
  winback: "bg-purple-500/15 text-purple-700 border-purple-500/40",
  first_timer_no_repeat: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40",
  cart_abandoner: "bg-pink-500/15 text-pink-700 border-pink-500/40",
  none: "bg-muted text-muted-foreground border-border",
};

const SIGNAL_ORDER = [
  "first_timer_no_repeat",
  "cart_abandoner",
  "reorder_nudge",
  "churn_risk",
  "winback",
] as const;

type OfferRow = {
  id: string;
  signal: string;
  offer_title: string;
  offer_sku: string | null;
  offer_url: string | null;
  offer_price_cents: number | null;
  mailchimp_tag: string;
  mailchimp_journey: string | null;
  notes: string | null;
  active: boolean;
};

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString();
}

export default function KennelSegflowPage() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const { data: roleInfo } = useUserRole();
  const canEdit = !!roleInfo?.isAdOps;

  const counts = useQuery({
    queryKey: ["segflow-counts"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("segflow_signals" as any)
        .select("signal, push_status, computed_at, signal_changed_at");
      if (error) throw error;
      const rows = (data as any[]) ?? [];
      const bySignal: Record<string, number> = {};
      const byPush: Record<string, number> = {};
      let lastComputed: string | null = null;
      let lastChanged: string | null = null;
      for (const r of rows) {
        bySignal[r.signal] = (bySignal[r.signal] ?? 0) + 1;
        byPush[r.push_status ?? "(unpushed)"] = (byPush[r.push_status ?? "(unpushed)"] ?? 0) + 1;
        if (r.computed_at && (!lastComputed || r.computed_at > lastComputed)) lastComputed = r.computed_at;
        if (r.signal_changed_at && (!lastChanged || r.signal_changed_at > lastChanged)) lastChanged = r.signal_changed_at;
      }
      return { total: rows.length, bySignal, byPush, lastComputed, lastChanged };
    },
  });

  const recent = useQuery({
    queryKey: ["segflow-recent"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("segflow_signals" as any)
        .select("*")
        .order("signal_changed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as unknown as SignalRow[]) ?? [];
    },
  });

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("segflow-compute-and-tag", {
        body: { manual: true },
      });
      if (error) throw error;
      toast({ title: "Segflow run complete", description: JSON.stringify(data).slice(0, 200) });
      counts.refetch();
      recent.refetch();
    } catch (e: any) {
      toast({ title: "Run failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const c = counts.data;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Segflow Hybrid</h1>
          <p className="text-sm text-muted-foreground">
            SQL computes reorder / churn / win-back signals from <code>vs_transactions</code>; tags are pushed to Mailchimp to trigger WF-12 / WF-13 as they exist today. Cron runs daily at 14:00 UTC.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { counts.refetch(); recent.refetch(); }}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          {canEdit && (
            <Button size="sm" onClick={runNow} disabled={running}>
              {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
              Run now
            </Button>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-none border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Read-only view. Contact an Ad Ops manager to run jobs or edit signal offers.
        </div>
      )}

      {/* Status row */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-none border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Last computed</div>
          <div className="mt-1 text-lg font-medium">{fmt(c?.lastComputed ?? null)}</div>
        </div>
        <div className="rounded-none border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Last signal change</div>
          <div className="mt-1 text-lg font-medium">{fmt(c?.lastChanged ?? null)}</div>
        </div>
        <div className="rounded-none border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Tracked emails</div>
          <div className="mt-1 text-lg font-medium">{c?.total?.toLocaleString() ?? "—"}</div>
        </div>
      </div>

      {/* Audience counts */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Audience counts</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[...SIGNAL_ORDER, "none"].map((sig) => (
            <div key={sig} className="rounded-none border border-border bg-card p-4">
              <Badge variant="outline" className={`rounded-none ${SIGNAL_TONE[sig] ?? ""}`}>{sig}</Badge>
              <div className="mt-2 text-2xl font-semibold">{(c?.bySignal?.[sig] ?? 0).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      <OffersEditor canEdit={canEdit} />

      {/* Mailchimp push status */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Mailchimp push status</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(c?.byPush ?? {}).map(([k, v]) => (
            <div key={k} className="rounded-none border border-border bg-card px-3 py-2 text-sm">
              <span className="font-medium">{k}</span>
              <span className="ml-2 text-muted-foreground">{v.toLocaleString()}</span>
            </div>
          ))}
          {!Object.keys(c?.byPush ?? {}).length && (
            <div className="text-sm text-muted-foreground">No pushes yet.</div>
          )}
        </div>
      </div>

      {/* Recent signal changes */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recent signal changes</h2>
        </div>
        <div className="overflow-x-auto rounded-none border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Signal</th>
                <th className="px-3 py-2">From</th>
                <th className="px-3 py-2">Last order</th>
                <th className="px-3 py-2">Days</th>
                <th className="px-3 py-2">Orders</th>
                <th className="px-3 py-2">LTV</th>
                <th className="px-3 py-2">MC tag</th>
                <th className="px-3 py-2">Pushed</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Changed</th>
              </tr>
            </thead>
            <tbody>
              {recent.isLoading && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading…</td></tr>
              )}
              {!recent.isLoading && !recent.data?.length && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">No signal changes yet — hit "Run now" to compute.</td></tr>
              )}
              {recent.data?.map((r) => (
                <tr key={r.email} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{r.email}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`rounded-none ${SIGNAL_TONE[r.signal] ?? ""}`}>{r.signal}</Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.previous_signal ?? "—"}</td>
                  <td className="px-3 py-2">{r.last_order_at ? new Date(r.last_order_at).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2">{r.days_since_order ?? "—"}</td>
                  <td className="px-3 py-2">{r.order_count ?? "—"}</td>
                  <td className="px-3 py-2">${((r.ltv_cents ?? 0) / 100).toFixed(2)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.mailchimp_tag ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{fmt(r.pushed_at)}</td>
                  <td className="px-3 py-2">
                    {r.push_status ? (
                      <Badge variant="outline" className={`rounded-none ${r.push_status === "ok" ? "bg-green-500/15 text-green-700 border-green-500/40" : "bg-destructive/15 text-destructive border-destructive/40"}`}>
                        {r.push_status}
                      </Badge>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{fmt(r.signal_changed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <JobRunHistory jobName="segflow_compute_and_tag" title="Segflow run history" />
    </div>
  );
}

function OffersEditor({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, Partial<OfferRow>>>({});
  const [savingSig, setSavingSig] = useState<string | null>(null);

  const offers = useQuery({
    queryKey: ["segflow-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("segflow_offers" as any)
        .select("*");
      if (error) throw error;
      return (data as unknown as OfferRow[]) ?? [];
    },
  });

  const bySignal: Record<string, OfferRow | undefined> = {};
  for (const o of offers.data ?? []) bySignal[o.signal] = o;

  const setField = (sig: string, key: keyof OfferRow, val: any) => {
    setDrafts((d) => ({ ...d, [sig]: { ...(d[sig] ?? {}), [key]: val } }));
  };

  const save = async (sig: string) => {
    const base = bySignal[sig];
    const draft = drafts[sig] ?? {};
    if (!base) return;
    setSavingSig(sig);
    try {
      const patch: any = {};
      for (const k of ["offer_title", "offer_sku", "offer_url", "offer_price_cents", "mailchimp_tag", "mailchimp_journey", "notes", "active"]) {
        if (k in draft) patch[k] = (draft as any)[k];
      }
      if (patch.offer_price_cents !== undefined && patch.offer_price_cents !== null && patch.offer_price_cents !== "") {
        patch.offer_price_cents = Number(patch.offer_price_cents);
      }
      const { error } = await supabase.from("segflow_offers" as any).update(patch).eq("id", base.id);
      if (error) throw error;
      toast({ title: "Offer saved", description: sig });
      setDrafts((d) => { const n = { ...d }; delete n[sig]; return n; });
      offers.refetch();
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSavingSig(null);
    }
  };

  const get = (sig: string, key: keyof OfferRow): any => {
    const d = drafts[sig];
    if (d && key in d) return (d as any)[key];
    return (bySignal[sig] as any)?.[key] ?? "";
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Signal offers (Mailchimp anchors)</h2>
        <Button variant="outline" size="sm" onClick={() => offers.refetch()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reload
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Each signal sets a Mailchimp tag and a target offer (anchor SKU + URL). Edit here to swap creative or seasonal anchors without redeploying. New first-timer / cart-abandoner default to the 6-Bottle Sampler.
      </p>
      <div className="overflow-x-auto rounded-none border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Signal</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Mailchimp tag</th>
              <th className="px-3 py-2">Journey</th>
              <th className="px-3 py-2">Offer title</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">URL</th>
              <th className="px-3 py-2">Price ¢</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {offers.isLoading && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading…</td></tr>
            )}
            {!offers.isLoading && SIGNAL_ORDER.map((sig) => {
              const row = bySignal[sig];
              if (!row) return (
                <tr key={sig} className="border-t border-border">
                  <td className="px-3 py-2"><Badge variant="outline" className={`rounded-none ${SIGNAL_TONE[sig] ?? ""}`}>{sig}</Badge></td>
                  <td className="px-3 py-2 text-muted-foreground" colSpan={9}>No offer mapping seeded.</td>
                </tr>
              );
              const dirty = !!drafts[sig];
              return (
                <tr key={sig} className="border-t border-border align-top">
                  <td className="px-3 py-2"><Badge variant="outline" className={`rounded-none ${SIGNAL_TONE[sig] ?? ""}`}>{sig}</Badge></td>
                  <td className="px-3 py-2">
                    <Switch checked={!!get(sig, "active")} onCheckedChange={(v) => setField(sig, "active", v)} disabled={!canEdit} />
                  </td>
                  <td className="px-3 py-2"><Input className="rounded-none h-8 w-40" value={get(sig, "mailchimp_tag") ?? ""} onChange={(e) => setField(sig, "mailchimp_tag", e.target.value)} readOnly={!canEdit} /></td>
                  <td className="px-3 py-2"><Input className="rounded-none h-8 w-36" value={get(sig, "mailchimp_journey") ?? ""} onChange={(e) => setField(sig, "mailchimp_journey", e.target.value)} readOnly={!canEdit} /></td>
                  <td className="px-3 py-2"><Input className="rounded-none h-8 w-56" value={get(sig, "offer_title") ?? ""} onChange={(e) => setField(sig, "offer_title", e.target.value)} readOnly={!canEdit} /></td>
                  <td className="px-3 py-2"><Input className="rounded-none h-8 w-36 font-mono text-xs" value={get(sig, "offer_sku") ?? ""} onChange={(e) => setField(sig, "offer_sku", e.target.value)} readOnly={!canEdit} /></td>
                  <td className="px-3 py-2"><Input className="rounded-none h-8 w-64 font-mono text-xs" value={get(sig, "offer_url") ?? ""} onChange={(e) => setField(sig, "offer_url", e.target.value)} readOnly={!canEdit} /></td>
                  <td className="px-3 py-2"><Input className="rounded-none h-8 w-24" type="number" value={get(sig, "offer_price_cents") ?? ""} onChange={(e) => setField(sig, "offer_price_cents", e.target.value)} readOnly={!canEdit} /></td>
                  <td className="px-3 py-2"><Input className="rounded-none h-8 w-64" value={get(sig, "notes") ?? ""} onChange={(e) => setField(sig, "notes", e.target.value)} readOnly={!canEdit} /></td>
                  <td className="px-3 py-2">
                    {canEdit && (
                      <Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || savingSig === sig} onClick={() => save(sig)}>
                        {savingSig === sig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}