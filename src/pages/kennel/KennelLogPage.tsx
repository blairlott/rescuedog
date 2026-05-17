import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const SHARP = { borderRadius: 0 } as const;
const BRAND_FONT = { fontFamily: '"Nunito Sans", system-ui, sans-serif' } as const;

type LogRow = {
  id: string; recommendation_id: string | null; action: string;
  actor_kind: string; actor_id: string | null; success: boolean;
  error_message: string | null; created_at: string;
  request_payload: any; response_payload: any;
};

export default function KennelLogPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

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
              <th>Rec</th>
              <th>Status</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-8">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No log entries.</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 align-top">
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td><Badge style={SHARP} className="uppercase text-[10px]">{r.action}</Badge></td>
                <td className="text-xs">{r.actor_kind}</td>
                <td className="text-xs font-mono">{r.recommendation_id?.slice(0, 8) ?? "—"}</td>
                <td>
                  {r.success
                    ? <Badge variant="outline" style={SHARP} className="text-[10px]">ok</Badge>
                    : <Badge variant="destructive" style={SHARP} className="text-[10px]">error</Badge>}
                </td>
                <td className="text-xs text-muted-foreground max-w-md truncate">
                  {r.error_message ?? (r.response_payload ? JSON.stringify(r.response_payload) : (r.request_payload ? JSON.stringify(r.request_payload) : "—"))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}