import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Send, Activity, Flame, CheckCircle2, XCircle, Clock, ShieldCheck, Upload, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";

const SHARP = { borderRadius: 0 } as const;

type CapiEvent = {
  id: string;
  order_id: string;
  value_cents: number;
  test_mode: boolean;
  test_event_code: string | null;
  success: boolean;
  error: string | null;
  fbc: string | null;
  sent_at: string;
};

export default function KennelCapiPage() {
  const [events, setEvents] = useState<CapiEvent[]>([]);
  const [recent, setRecent] = useState<CapiEvent[]>([]);
  const [z3aOnly, setZ3aOnly] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [ociEnabled, setOciEnabled] = useState(true);
  const [conversionActionId, setConversionActionId] = useState("");
  const [savingCAI, setSavingCAI] = useState(false);
  const [backfillDays, setBackfillDays] = useState(30);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<any>(null);
  const [uploadRows, setUploadRows] = useState<any[]>([]);
  const [uploadFileName, setUploadFileName] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [testOrder, setTestOrder] = useState({
    order_id: `test-${Date.now()}`,
    value_cents: 9900,
    email: "",
    test_event_code: "TEST12345",
  });
  const [sending, setSending] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [oauthHealth, setOauthHealth] = useState<
    | { healthy: true; customer_id: string; checked_at: string; auto_enabled_oci?: boolean }
    | { healthy: false; error: string; hint?: string | null; checked_at: string }
    | null
  >(null);

  const load = async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ data: ev }, { data: rec }, { data: flags }] = await Promise.all([
      supabase.from("meta_capi_events").select("*").order("sent_at", { ascending: false }).limit(50),
      supabase.from("meta_capi_events").select("*").gte("sent_at", since).order("sent_at", { ascending: false }).limit(500),
      supabase.from("app_settings").select("key,value").in("key", ["kennel_capi_enabled", "kennel_oci_enabled", "kennel_oci_conversion_action_id"]),
    ]);
    setEvents((ev as CapiEvent[]) ?? []);
    setRecent((rec as CapiEvent[]) ?? []);
    const fmap = Object.fromEntries((flags ?? []).map((f: any) => [f.key, f.value]));
    setEnabled(fmap.kennel_capi_enabled === true || fmap.kennel_capi_enabled === "true");
    setOciEnabled(fmap.kennel_oci_enabled !== false && fmap.kennel_oci_enabled !== "false");
    setConversionActionId(String(fmap.kennel_oci_conversion_action_id ?? "").replace(/^"|"$/g, ""));
  };

  useEffect(() => { load(); }, []);

  const checkGoogleHealth = async () => {
    setCheckingHealth(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-ads-health", { body: {} });
      if (error) throw error;
      setOauthHealth(data as any);
      if ((data as any)?.healthy) {
        toast.success("Google OAuth healthy", {
          description: (data as any)?.auto_enabled_oci ? "OCI LTV upload auto-enabled." : "OCI flag already on.",
        });
      } else {
        toast.error("Google OAuth unhealthy", { description: (data as any)?.hint ?? (data as any)?.error });
      }
      load();
    } catch (e: any) {
      toast.error("Health check failed", { description: e?.message ?? String(e) });
    } finally {
      setCheckingHealth(false);
    }
  };

  const reconnectGoogleAds = async () => {
    setReconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-ads-oauth/start", { body: {} });
      if (error) throw error;
      const url = (data as any)?.url;
      if (!url) throw new Error("No OAuth URL returned");
      // Top-frame navigation — bypasses preview-iframe sandbox and popup
      // blockers. After consent the callback redirects back to /kennel/capi.
      try {
        window.top!.location.href = url;
      } catch {
        window.location.href = url;
      }
    } catch (e: any) {
      toast.error("Couldn't start OAuth", { description: e?.message ?? String(e) });
      setReconnecting(false);
    }
  };

  const toggleFlag = async (key: string, next: boolean) => {
    const { error } = await supabase.from("app_settings").upsert({ key, value: next }, { onConflict: "key" });
    if (error) { toast.error(error.message); return; }
    toast.success(`${key} = ${next}`);
    load();
  };

  const saveConversionActionId = async () => {
    setSavingCAI(true);
    try {
      const { error } = await supabase.from("app_settings")
        .upsert({ key: "kennel_oci_conversion_action_id", value: conversionActionId }, { onConflict: "key" });
      if (error) throw error;
      toast.success("Conversion action ID saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setSavingCAI(false);
    }
  };

  const runBackfill = async (dryRun: boolean) => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const since_iso = new Date(Date.now() - backfillDays * 86400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase.functions.invoke("vinoshipper-conversions-backfill", {
        body: { since_iso, dry_run: dryRun, send_meta: true, send_google: true, limit: 1000 },
      });
      if (error) throw error;
      setBackfillResult(data);
      toast.success(dryRun ? "Dry run complete" : "Backfill sent");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Backfill failed");
    } finally {
      setBackfilling(false);
    }
  };

  const handleFile = async (file: File) => {
    setUploadFileName(file.name);
    setUploadResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // Vinoshipper exports have a banner row ("Transaction Summary", "Customer Details", ...)
      // above the real column names. Auto-detect the header row by scanning the first ~10
      // rows for one that contains recognizable field names.
      const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
      const HEADER_HINTS = [
        "invoice", "order id", "order_id", "order number", "order_number",
        "email", "first name", "last name", "order total", "total",
        "transaction date", "date",
      ];
      let headerIdx = 0;
      for (let i = 0; i < Math.min(aoa.length, 10); i++) {
        const cells = (aoa[i] ?? []).map((c) => String(c ?? "").trim().toLowerCase());
        const hits = cells.filter((c) => HEADER_HINTS.some((h) => c === h || c.includes(h))).length;
        if (hits >= 3) { headerIdx = i; break; }
      }
      const headers = (aoa[headerIdx] ?? []).map((h, i) =>
        String(h ?? `col_${i}`).trim().toLowerCase().replace(/[\s\-/]+/g, "_").replace(/[^\w]/g, "")
      );
      const dataRows = aoa.slice(headerIdx + 1).filter((r) => Array.isArray(r) && r.some((c) => c !== null && c !== ""));
      const json = dataRows.map((row) => {
        const obj: any = {};
        headers.forEach((h, i) => { if (h) obj[h] = row[i] ?? null; });
        return obj;
      });
      const norm = json.map((r) => {
        const out: any = {};
        for (const [k, v] of Object.entries(r)) {
          const key = String(k).trim().toLowerCase().replace(/[\s\-]+/g, "_");
          out[key] = typeof v === "string" ? v.trim() : v;
        }
        return out;
      });
      setUploadRows(norm);
      toast.success(`Parsed ${norm.length} rows from ${file.name} (header row ${headerIdx + 1})`);
    } catch (e: any) {
      toast.error("Parse failed", { description: e?.message ?? String(e) });
      setUploadRows([]);
    }
  };

  const sendUpload = async (dryRun: boolean) => {
    if (!uploadRows.length) { toast.error("No rows parsed"); return; }
    setUploading(true);
    setUploadResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("vinoshipper-conversions-backfill", {
        body: { orders: uploadRows, dry_run: dryRun, send_meta: true, send_google: true, limit: 2000 },
      });
      if (error) throw error;
      setUploadResult(data);
      toast.success(dryRun ? "Dry run complete" : "Uploaded to Meta + Google");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const sendTest = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-capi-sender", {
        body: {
          test_mode: true,
          test_event_code: testOrder.test_event_code,
          order: {
            order_id: testOrder.order_id,
            value_cents: testOrder.value_cents,
            email: testOrder.email || null,
            currency: "USD",
          },
        },
      });
      if (error) throw error;
      toast.success("Test event sent — check Meta Events Manager → Test Events");
      setTestOrder((p) => ({ ...p, order_id: `test-${Date.now()}` }));
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Send failed");
    } finally {
      setSending(false);
    }
  };

  const liveCount = events.filter((e) => !e.test_mode).length;
  const liveSuccess = events.filter((e) => !e.test_mode && e.success).length;
  const testCount = events.filter((e) => e.test_mode).length;

  // --- 24h panel derivations ---
  const inZ3aWindow = (iso: string) => {
    // Format hour:minute in America/New_York
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    const mins = h * 60 + m;
    return mins >= 1 * 60 + 25 && mins <= 1 * 60 + 45;
  };

  const filtered = z3aOnly ? recent.filter((e) => inZ3aWindow(e.sent_at)) : recent;
  const fires24 = filtered.length;
  const succ24 = filtered.filter((e) => e.success).length;
  const successRate = fires24 ? Math.round((succ24 / fires24) * 100) : null;
  const lastFire = filtered[0]?.sent_at ?? null;

  const relTime = (iso: string | null) => {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 45) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const sortedRows = [...filtered].sort((a, b) => {
    if (a.success !== b.success) return a.success ? 1 : -1; // failures first
    return new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime();
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold uppercase tracking-brand">Meta CAPI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Server-side Purchase events for Vinoshipper orders. Fires from the Z3a poll cycle (daily 1:30am ET).
          Uses <code className="px-1 bg-muted">order_id</code> as event_id to dedupe against the browser Pixel.
        </p>
      </header>

      {/* --- Last 24h CAPI Fires panel --- */}
      <Card style={SHARP} className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4" />
            <h2 className="font-bold uppercase tracking-brand">Last 24h CAPI Fires</h2>
          </div>
          <button
            onClick={() => setZ3aOnly((v) => !v)}
            style={SHARP}
            className={`text-xs px-3 py-1 border ${z3aOnly ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"}`}
          >
            Z3a cycle only {z3aOnly ? "✓" : ""}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="border border-border p-3" style={SHARP}>
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1"><Flame className="h-3 w-3" /> Fires (24h)</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{fires24}</div>
          </div>
          <div className="border border-border p-3" style={SHARP}>
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Success rate</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{successRate == null ? "—" : `${successRate}%`}</div>
            <div className="text-xs text-muted-foreground">{succ24} / {fires24} ok</div>
          </div>
          <div className="border border-border p-3" style={SHARP}>
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Last fire</div>
            <div className="text-2xl font-bold mt-1">{relTime(lastFire)}</div>
            <div className="text-xs text-muted-foreground">{lastFire ? new Date(lastFire).toLocaleString() : "—"}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border text-xs uppercase text-muted-foreground">
                <th className="py-2">Sent</th><th>Order</th><th>fbc</th><th>Value</th><th>Status</th><th>Error</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((e) => (
                <tr key={e.id} className={`border-b border-border/50 ${!e.success ? "bg-destructive/5" : ""}`}>
                  <td className="py-2 text-xs whitespace-nowrap">{new Date(e.sent_at).toLocaleString()}</td>
                  <td className="font-mono text-xs">{e.order_id}</td>
                  <td className="font-mono text-xs">{e.fbc ? `${e.fbc.slice(0, 20)}${e.fbc.length > 20 ? "…" : ""}` : "—"}</td>
                  <td className="tabular-nums">${(e.value_cents / 100).toFixed(2)}</td>
                  <td>
                    {e.success
                      ? <span className="text-green-600 inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /></span>
                      : <span className="text-destructive inline-flex items-center gap-1"><XCircle className="h-4 w-4" /></span>}
                  </td>
                  <td className="text-xs text-destructive max-w-md truncate">{!e.success ? e.error ?? "fail" : ""}</td>
                </tr>
              ))}
              {sortedRows.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground text-sm">
                  No CAPI fires in the last 24h — Z3a runs at 1:30am ET
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* --- Vinoshipper → Meta CAPI + Google OCI backfill --- */}
      <Card style={SHARP} className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4" />
          <h2 className="font-bold uppercase tracking-brand">Backfill Vinoshipper sales</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Pulls CONSUMER orders from <code className="px-1 bg-muted">vs_transactions</code>, hashes PII as SHA-256 hex
          (Meta's required format), and forwards to Meta CAPI + Google Ads OCI.
          Both sinks dedupe on <code className="px-1 bg-muted">order_id</code> — safe to re-run.
        </p>
        <div className="grid grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-xs">Google conversion action ID</Label>
            <div className="flex gap-2">
              <Input style={SHARP} value={conversionActionId} placeholder="e.g. 1234567890"
                onChange={(e) => setConversionActionId(e.target.value)} />
              <Button size="sm" variant="outline" style={SHARP} onClick={saveConversionActionId} disabled={savingCAI}>
                Save
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Numeric ID from Google Ads → Tools → Conversions.</p>
          </div>
          <div>
            <Label className="text-xs">Lookback (days)</Label>
            <Input style={SHARP} type="number" min={1} max={365} value={backfillDays}
              onChange={(e) => setBackfillDays(Math.max(1, Number(e.target.value) || 30))} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" style={SHARP} onClick={() => runBackfill(true)} disabled={backfilling}>
              {backfilling ? "Working…" : "Dry run"}
            </Button>
            <Button style={SHARP} onClick={() => runBackfill(false)} disabled={backfilling}>
              {backfilling ? "Sending…" : "Send to Meta + Google"}
            </Button>
          </div>
        </div>
        {backfillResult && (
          <pre className="text-[11px] bg-muted/40 p-3 overflow-x-auto" style={SHARP}>
{JSON.stringify(backfillResult, null, 2)}
          </pre>
        )}
      </Card>

      {/* --- File upload (CSV / XLSX) --- */}
      <Card style={SHARP} className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          <h2 className="font-bold uppercase tracking-brand">Upload conversions file</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          CSV or XLSX. PII is SHA-256 hex-hashed before sending. Both sinks dedupe on{" "}
          <code className="px-1 bg-muted">order_id</code>.
          <br />
          Accepted columns (case-insensitive):{" "}
          <code className="px-1 bg-muted">order_id, value, date, email, phone, first_name, last_name, city, state, zip</code>
          {" "}— also accepts the Vinoshipper export names (<code className="px-1 bg-muted">invoice, order_total, customer_email…</code>).
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Input
            type="file"
            accept=".csv,.xlsx,.xls"
            style={SHARP}
            className="max-w-xs"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {uploadFileName && (
            <span className="text-xs text-muted-foreground">
              {uploadFileName} · <strong>{uploadRows.length}</strong> rows
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" style={SHARP} disabled={!uploadRows.length || uploading}
              onClick={() => sendUpload(true)}>
              {uploading ? "Working…" : "Dry run"}
            </Button>
            <Button style={SHARP} disabled={!uploadRows.length || uploading}
              onClick={() => sendUpload(false)}>
              {uploading ? "Sending…" : "Send to Meta + Google"}
            </Button>
          </div>
        </div>
        {uploadRows.length > 0 && (
          <div className="overflow-x-auto border border-border" style={SHARP}>
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  {Object.keys(uploadRows[0]).slice(0, 8).map((k) => (
                    <th key={k} className="text-left px-2 py-1 uppercase tracking-brand text-[10px]">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {uploadRows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-border/50">
                    {Object.keys(uploadRows[0]).slice(0, 8).map((k) => (
                      <td key={k} className="px-2 py-1 font-mono">{String(r[k] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {uploadRows.length > 5 && (
              <div className="px-2 py-1 text-[10px] text-muted-foreground bg-muted/20">
                +{uploadRows.length - 5} more rows…
              </div>
            )}
          </div>
        )}
        {uploadResult && (
          <pre className="text-[11px] bg-muted/40 p-3 overflow-x-auto" style={SHARP}>
{JSON.stringify(uploadResult, null, 2)}
          </pre>
        )}
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card style={SHARP} className="p-4">
          <div className="text-xs text-muted-foreground uppercase">Live sends (last 50)</div>
          <div className="text-2xl font-bold mt-1">{liveSuccess} / {liveCount}</div>
          <div className="text-xs text-muted-foreground">successful</div>
        </Card>
        <Card style={SHARP} className="p-4">
          <div className="text-xs text-muted-foreground uppercase">Test sends</div>
          <div className="text-2xl font-bold mt-1">{testCount}</div>
          <div className="text-xs text-muted-foreground">Lindy: first 3 prod orders go here</div>
        </Card>
        <Card style={SHARP} className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground uppercase">CAPI enabled</div>
              <div className="text-xs text-muted-foreground">Kill switch for live sends</div>
            </div>
            <Switch checked={enabled} onCheckedChange={(v) => toggleFlag("kennel_capi_enabled", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground uppercase">OCI LTV upload</div>
              <div className="text-xs text-muted-foreground">Auto-flips on when Google OAuth healthy</div>
            </div>
            <Switch checked={ociEnabled} onCheckedChange={(v) => toggleFlag("kennel_oci_enabled", v)} />
          </div>
          <div className="border-t border-border pt-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground uppercase flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Google OAuth
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {(() => {
                  if (!oauthHealth) return "Click check to probe the refresh token.";
                  const h = oauthHealth as any;
                  if (h.healthy) return `Healthy · customer ${h.customer_id}`;
                  return `Failed · ${h.hint ?? h.error}`;
                })()}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" style={SHARP} onClick={checkGoogleHealth} disabled={checkingHealth}>
                {checkingHealth ? "Checking…" : "Check"}
              </Button>
              <Button size="sm" style={SHARP} onClick={reconnectGoogleAds} disabled={reconnecting}>
                {reconnecting ? "Opening…" : "Reconnect"}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Card style={SHARP} className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4" />
          <h2 className="font-bold uppercase tracking-brand">Send test event</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Routes to Meta Events Manager → Test Events only. Does not affect production attribution.
        </p>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">order_id (event_id)</Label>
            <Input style={SHARP} value={testOrder.order_id}
              onChange={(e) => setTestOrder((p) => ({ ...p, order_id: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">value (cents)</Label>
            <Input style={SHARP} type="number" value={testOrder.value_cents}
              onChange={(e) => setTestOrder((p) => ({ ...p, value_cents: Number(e.target.value) }))} />
          </div>
          <div>
            <Label className="text-xs">email (optional)</Label>
            <Input style={SHARP} value={testOrder.email}
              onChange={(e) => setTestOrder((p) => ({ ...p, email: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">test_event_code</Label>
            <Input style={SHARP} value={testOrder.test_event_code}
              onChange={(e) => setTestOrder((p) => ({ ...p, test_event_code: e.target.value }))} />
          </div>
        </div>
        <Button onClick={sendTest} disabled={sending} style={SHARP}>
          {sending ? "Sending…" : "Send test event"}
        </Button>
      </Card>

      <Card style={SHARP} className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4" />
          <h2 className="font-bold uppercase tracking-brand">Recent events</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border text-xs uppercase text-muted-foreground">
                <th className="py-2">Sent</th><th>Order</th><th>Mode</th><th>Value</th><th>fbc</th><th>Result</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-border/50">
                  <td className="py-2 text-xs">{new Date(e.sent_at).toLocaleString()}</td>
                  <td className="font-mono text-xs">{e.order_id}</td>
                  <td>
                    <Badge variant={e.test_mode ? "outline" : "default"} style={SHARP}>
                      {e.test_mode ? "TEST" : "LIVE"}
                    </Badge>
                  </td>
                  <td>${(e.value_cents / 100).toFixed(2)}</td>
                  <td className="text-xs">{e.fbc ? "✓" : "—"}</td>
                  <td>
                    {e.success
                      ? <Badge style={SHARP} className="bg-green-600">OK</Badge>
                      : <span className="text-xs text-destructive">{e.error ?? "fail"}</span>}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground text-sm">
                  No CAPI events yet. Send a test above or wait for the next Z3a poll cycle.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}