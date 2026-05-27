import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw, Copy, ChevronDown, ChevronRight, Play, FlaskConical } from "lucide-react";

const SHARP = { borderRadius: 0 } as const;
const BRAND_FONT = { fontFamily: '"Nunito Sans", system-ui, sans-serif' } as const;

type OciRow = {
  id: string;
  uploaded_at: string;
  conversion_action_id: string;
  order_id: string | null;
  gclid: string | null;
  conversion_value: number | null;
  currency: string | null;
  status: "uploaded" | "partial_failure" | "error";
  error_message: string | null;
  raw_response: unknown;
};

type StatusFilter = "all" | "uploaded" | "partial_failure" | "error";
type WindowFilter = "24h" | "7d" | "30d";

const WINDOW_MS: Record<WindowFilter, number> = {
  "24h": 24 * 3600 * 1000,
  "7d": 7 * 24 * 3600 * 1000,
  "30d": 30 * 24 * 3600 * 1000,
};

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function statusBadge(status: OciRow["status"]) {
  const map: Record<OciRow["status"], { label: string; cls: string }> = {
    uploaded: { label: "Uploaded", cls: "bg-green-600 text-white" },
    partial_failure: { label: "Partial", cls: "bg-amber-500 text-black" },
    error: { label: "Error", cls: "bg-destructive text-destructive-foreground" },
  };
  const v = map[status];
  return (
    <Badge style={SHARP} className={`uppercase tracking-brand text-[10px] ${v.cls}`}>
      {v.label}
    </Badge>
  );
}

export default function KennelOciLogPage() {
  const [rows, setRows] = useState<OciRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [windowFilter, setWindowFilter] = useState<WindowFilter>("7d");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [running, setRunning] = useState<false | "run" | "dry">(false);
  const [lastRun, setLastRun] = useState<null | {
    ok: boolean;
    scanned?: number;
    matched?: number;
    uploaded?: number;
    would_upload?: number;
    failed?: number;
    dry_run?: boolean;
    note?: string;
    error?: string;
  }>(null);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - WINDOW_MS[windowFilter]).toISOString();
    let q = supabase
      .from("oci_upload_log" as any)
      .select("*")
      .gte("uploaded_at", since)
      .order("uploaded_at", { ascending: false })
      .limit(500);
    if (status !== "all") q = q.eq("status", status);
    if (search.trim()) q = q.ilike("order_id", `%${search.trim()}%`);
    const { data, error } = await q;
    if (error) {
      toast.error(error.message || "Failed to load OCI log");
      setRows([]);
    } else {
      setRows((data as unknown as OciRow[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, windowFilter]);

  const summary = useMemo(() => {
    let uploaded = 0, partial = 0, error = 0, value = 0;
    for (const r of rows) {
      if (r.status === "uploaded") { uploaded++; value += Number(r.conversion_value || 0); }
      else if (r.status === "partial_failure") partial++;
      else if (r.status === "error") error++;
    }
    return { total: rows.length, uploaded, partial, error, value };
  }, [rows]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
  };

  const runLoop = async (dryRun: boolean) => {
    setRunning(dryRun ? "dry" : "run");
    setLastRun(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Please sign in again before running the loop.");

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gclid-oci-loop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ lookback_days: 7, dry_run: dryRun }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.details?.message || data?.error || `Loop failed (${response.status})`;
        toast.error(message);
        setLastRun({ ok: false, error: message });
      } else {
        setLastRun(data as any);
        if (dryRun) {
          toast.success(`Dry run: ${data?.would_upload ?? 0} would upload`);
        } else {
          const uploaded = Number(data?.uploaded ?? 0);
          const matched = Number(data?.matched ?? 0);
          const scanned = Number(data?.scanned ?? 0);
          if (uploaded > 0) {
            toast.success(`Uploaded ${uploaded} (${data?.failed ?? 0} failed)`);
          } else if (matched === 0) {
            toast.message(`No new conversions to upload`, {
              description: `Scanned ${scanned} VS sales — none matched a captured GCLID in the last ${7} days.`,
            });
          } else {
            toast.message(`Nothing new to upload`, {
              description: `Matched ${matched}, but all were already uploaded previously.`,
            });
          }
          load();
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "Loop failed");
      setLastRun({ ok: false, error: e?.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4" style={BRAND_FONT}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold uppercase tracking-brand text-foreground">
            Google Ads OCI Uploads
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Offline click conversions. Internal <code>gclid-oci-loop</code> runs every 2h, matching VS sales → captured GCLIDs and uploading to Google Ads.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            style={SHARP}
            onClick={() => runLoop(true)}
            disabled={!!running}
            className="gap-2"
            title="Match VS sales → GCLIDs without uploading"
          >
            <FlaskConical className={`h-4 w-4 ${running === "dry" ? "animate-pulse" : ""}`} />
            Dry Run
          </Button>
          <Button
            size="sm"
            style={SHARP}
            onClick={() => runLoop(false)}
            disabled={!!running}
            className="gap-2"
          >
            <Play className={`h-4 w-4 ${running === "run" ? "animate-pulse" : ""}`} />
            Run Match & Upload
          </Button>
          <Button
            variant="outline"
            size="sm"
            style={SHARP}
            onClick={load}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {lastRun && (
        <div
          className="border border-border bg-card p-3 text-xs"
          style={SHARP}
        >
          <div className="uppercase tracking-brand text-[10px] text-muted-foreground mb-1">
            Last loop result {lastRun.dry_run ? "(dry run)" : ""}
          </div>
          {lastRun.error ? (
            <div className="text-destructive font-mono">{lastRun.error}</div>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono">
              <span>scanned: <b>{lastRun.scanned ?? 0}</b></span>
              <span>matched: <b>{lastRun.matched ?? 0}</b></span>
              {lastRun.dry_run ? (
                <span>would_upload: <b>{lastRun.would_upload ?? 0}</b></span>
              ) : (
                <>
                  <span className="text-green-600">uploaded: <b>{lastRun.uploaded ?? 0}</b></span>
                  <span className="text-destructive">failed: <b>{lastRun.failed ?? 0}</b></span>
                </>
              )}
              {lastRun.note && <span className="text-muted-foreground">({lastRun.note})</span>}
            </div>
          )}
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Tile label="Total" value={summary.total} />
        <Tile label="Uploaded" value={summary.uploaded} accent="text-green-600" />
        <Tile label="Partial" value={summary.partial} accent="text-amber-600" />
        <Tile label="Error" value={summary.error} accent="text-destructive" />
        <Tile label="Value" value={`$${summary.value.toFixed(2)}`} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border border-border p-2 bg-card" style={SHARP}>
        <div className="flex items-center gap-1">
          {(["all", "uploaded", "partial_failure", "error"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              style={SHARP}
              className={`px-2 py-1 text-[10px] uppercase tracking-brand border ${
                status === s
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {s === "all" ? "All" : s === "partial_failure" ? "Partial" : s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(["24h", "7d", "30d"] as WindowFilter[]).map((w) => (
            <button
              key={w}
              onClick={() => setWindowFilter(w)}
              style={SHARP}
              className={`px-2 py-1 text-[10px] uppercase tracking-brand border ${
                windowFilter === w
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); load(); }}
          className="flex-1 min-w-[200px] flex items-center gap-2"
        >
          <Input
            placeholder="Search by order_id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={SHARP}
            className="h-8 text-xs"
          />
          <Button type="submit" size="sm" variant="outline" style={SHARP}>Search</Button>
        </form>
      </div>

      {/* Table */}
      <div className="border border-border bg-card overflow-x-auto" style={SHARP}>
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left">
            <tr className="uppercase tracking-brand text-[10px] text-muted-foreground">
              <th className="px-2 py-2 w-6"></th>
              <th className="px-2 py-2">Uploaded</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Order ID</th>
              <th className="px-2 py-2">Click ID</th>
              <th className="px-2 py-2 text-right">Value</th>
              <th className="px-2 py-2">Action ID</th>
              <th className="px-2 py-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">
                No uploads yet. The internal loop runs every 2h, or click "Run Match & Upload" to trigger now.
              </td></tr>
            )}
            {!loading && rows.map((r) => {
              const isOpen = expanded === r.id;
              return (
                <>
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-2 py-2 align-top">
                      <button
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={isOpen ? "Collapse" : "Expand"}
                      >
                        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </button>
                    </td>
                    <td className="px-2 py-2 align-top" title={new Date(r.uploaded_at).toLocaleString()}>
                      {relTime(r.uploaded_at)}
                    </td>
                    <td className="px-2 py-2 align-top">{statusBadge(r.status)}</td>
                    <td className="px-2 py-2 font-mono align-top">{r.order_id ?? "—"}</td>
                    <td className="px-2 py-2 font-mono align-top">
                      {r.gclid ? (
                        <button
                          className="inline-flex items-center gap-1 hover:text-foreground text-muted-foreground"
                          onClick={() => copy(r.gclid!)}
                          title={r.gclid}
                        >
                          {r.gclid.slice(0, 14)}…
                          <Copy className="h-3 w-3" />
                        </button>
                      ) : "—"}
                    </td>
                    <td className="px-2 py-2 align-top text-right tabular-nums">
                      {r.conversion_value != null
                        ? `${r.currency || "USD"} ${Number(r.conversion_value).toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-2 py-2 font-mono align-top">{r.conversion_action_id}</td>
                    <td className="px-2 py-2 align-top text-destructive max-w-[280px] truncate" title={r.error_message ?? ""}>
                      {r.error_message ?? ""}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-t border-border bg-muted/20">
                      <td colSpan={8} className="px-2 py-2">
                        <pre className="text-[10px] whitespace-pre-wrap break-all overflow-x-auto font-mono text-muted-foreground">
                          {JSON.stringify(r.raw_response ?? {}, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="border border-border bg-card p-3" style={SHARP}>
      <div className="text-[10px] uppercase tracking-brand text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${accent ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}
