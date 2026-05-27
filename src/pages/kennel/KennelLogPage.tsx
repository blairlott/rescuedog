import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Seo } from "@/components/Seo";

const SHARP = { borderRadius: 0 } as const;
const BRAND_FONT = { fontFamily: '"Nunito Sans", system-ui, sans-serif' } as const;

type LogRow = {
  id: string; recommendation_id: string | null; action: string;
  actor_kind: string; actor_id: string | null; success: boolean;
  error_message: string | null; created_at: string;
  request_payload: any; response_payload: any;
  executor?: string | null;
  guardrail_results?: any;
};

export default function KennelLogPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const ROLLBACK_WINDOW_MS = 24 * 3600 * 1000;
  const canRollback = (r: LogRow) =>
    r.action === "execute" &&
    r.success &&
    !!r.recommendation_id &&
    Date.now() - new Date(r.created_at).getTime() < ROLLBACK_WINDOW_MS;

  const doRollback = async (r: LogRow) => {
    if (!r.recommendation_id) return;
    if (!confirm("Roll back this execution? This will restore the prior platform state.")) return;
    setRollingBack(r.id);
    try {
      const { data, error } = await supabase.functions.invoke("kennel-execute", {
        body: { recommendation_id: r.recommendation_id, action: "rollback" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Rollback dispatched");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Rollback failed");
    } finally {
      setRollingBack(null);
    }
  };

  const load = async () => {
    const { data } = await supabase
      .from("ad_execution_log").select("*")
      .order("created_at", { ascending: false }).limit(500);
    setRows((data as LogRow[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
    const ch = supabase
      .channel("kennel-log")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ad_execution_log" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = q
    ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
    : rows;

  return (
    <>
      <Seo noindex title="Kennel Log" />
    <div className="p-6 max-w-[1400px]" style={BRAND_FONT}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-brand">Execution log</h1>
          <p className="text-sm text-muted-foreground mt-1">Latest 500 actions across all recommendations.</p>
        </div>
        <Input style={SHARP} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      </div>
      <div className="border border-border bg-card" style={SHARP}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-brand text-muted-foreground border-b border-border">
              <th className="px-3 py-2">When</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Executor</th>
              <th>Guard</th>
              <th>Rec</th>
              <th>Status</th>
              <th>Detail</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center text-muted-foreground py-8">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center text-muted-foreground py-8">No log entries.</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 align-top">
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td><Badge style={SHARP} className="uppercase text-[10px]">{r.action}</Badge></td>
                <td className="text-xs">{r.actor_kind}</td>
                <td className="text-xs text-muted-foreground">{r.executor ?? "—"}</td>
                <td className="text-xs">
                  {r.guardrail_results
                    ? (r.guardrail_results.passed
                        ? <Badge variant="outline" style={SHARP} className="text-[10px]">✓</Badge>
                        : <Badge variant="destructive" style={SHARP} className="text-[10px]" title={r.guardrail_results.error ?? ""}>✗</Badge>)
                    : "—"}
                </td>
                <td className="text-xs font-mono">{r.recommendation_id?.slice(0, 8) ?? "—"}</td>
                <td>
                  {r.success
                    ? <Badge variant="outline" style={SHARP} className="text-[10px]">ok</Badge>
                    : <Badge variant="destructive" style={SHARP} className="text-[10px]">error</Badge>}
                </td>
                <td className="text-xs text-muted-foreground max-w-md truncate">
                  {r.error_message ?? (r.response_payload ? JSON.stringify(r.response_payload) : (r.request_payload ? JSON.stringify(r.request_payload) : "—"))}
                </td>
                <td className="text-right pr-3">
                  {canRollback(r) && (
                    <Button
                      size="sm"
                      variant="outline"
                      style={SHARP}
                      className="text-[10px] uppercase tracking-brand"
                      disabled={rollingBack === r.id}
                      onClick={() => doRollback(r)}
                    >
                      <Undo2 className="h-3 w-3 mr-1" />
                      {rollingBack === r.id ? "…" : "Rollback"}
                    </Button>
                  )}
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