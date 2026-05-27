import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw, MessageSquare, CheckCircle2, AlertTriangle, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";

const SHARP = { borderRadius: 0 } as const;
const BRAND_FONT = { fontFamily: '"Nunito Sans", system-ui, sans-serif' } as const;

type Row = {
  id: string;
  ran_at: string;
  item_count: number;
  posted: boolean;
  skipped: boolean;
  escalated: boolean;
  forced: boolean;
  reason: string | null;
  source: string | null;
};

export default function KennelSlackDigestLogPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("slack_digest_log")
      .select("*")
      .order("ran_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const triggerNow = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("slack-digest", { body: { force: true, source: "admin-page" } });
      if (error) throw error;
      toast.success(`Digest posted (${(data as any)?.count ?? 0} items)`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  };

  const last24h = rows.filter((r) => Date.now() - new Date(r.ran_at).getTime() < 86_400_000);
  const posted24h = last24h.filter((r) => r.posted).length;
  const skipped24h = last24h.filter((r) => r.skipped).length;
  const escalated24h = last24h.filter((r) => r.escalated).length;
  const avgQueue = last24h.filter((r) => r.posted).length
    ? Math.round(
        last24h.filter((r) => r.posted).reduce((s, r) => s + r.item_count, 0) /
        last24h.filter((r) => r.posted).length,
      )
    : 0;

  return (
    <>
      <Seo noindex title="Kennel Slack Digest Log" />
    <div className="p-6 max-w-[1400px] space-y-6" style={BRAND_FONT}>
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-brand flex items-center gap-2">
            <MessageSquare className="h-6 w-6" /> Slack digest log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every scheduled and manual run of the <code>slack-digest</code> function. Shows whether
            it posted to <span className="font-bold">#lindy-lovable</span>, the unhandled item
            count, and whether escalation fired.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" style={SHARP} onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" style={SHARP} onClick={triggerNow} disabled={busy}>
            Post digest now
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Runs (24h)", value: last24h.length, icon: RefreshCw },
          { label: "Posted (24h)", value: posted24h, icon: CheckCircle2 },
          { label: "Skipped off-hour (24h)", value: skipped24h, icon: SkipForward },
          { label: "Escalated (24h)", value: escalated24h, icon: AlertTriangle },
        ].map((s) => (
          <div key={s.label} className="border border-border bg-card p-4" style={SHARP}>
            <div className="text-[10px] uppercase tracking-brand text-muted-foreground flex items-center gap-1">
              <s.icon className="h-3 w-3" /> {s.label}
            </div>
            <div className="text-2xl font-bold mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="text-xs text-muted-foreground">
        Avg unhandled queue when posted (24h): <span className="font-bold">{avgQueue}</span>
      </div>

      <div className="border border-border bg-card overflow-x-auto" style={SHARP}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-brand text-muted-foreground border-b border-border bg-muted/30">
              <th className="py-2 px-3">When (UTC)</th>
              <th className="px-3">Items</th>
              <th className="px-3">Status</th>
              <th className="px-3">Escalated</th>
              <th className="px-3">Source</th>
              <th className="px-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No digest runs logged yet.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">
                  {new Date(r.ran_at).toISOString().replace("T", " ").slice(0, 19)}
                </td>
                <td className="px-3 font-bold">{r.item_count}</td>
                <td className="px-3">
                  {r.posted && <span className="text-green-600 dark:text-green-400">posted</span>}
                  {r.skipped && <span className="text-muted-foreground">skipped</span>}
                  {!r.posted && !r.skipped && <span className="text-destructive">failed</span>}
                </td>
                <td className="px-3">
                  {r.escalated ? <span className="text-destructive font-bold">YES</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 text-xs">
                  {r.source ?? "—"}{r.forced ? " (forced)" : ""}
                </td>
                <td className="px-3 text-xs text-muted-foreground max-w-md truncate" title={r.reason ?? ""}>
                  {r.reason ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}