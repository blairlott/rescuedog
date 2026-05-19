import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Send, Activity, Flame, CheckCircle2, XCircle, Clock, ShieldCheck } from "lucide-react";

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
  const [ociEnabled, setOciEnabled] = useState(false);
  const [testOrder, setTestOrder] = useState({
    order_id: `test-${Date.now()}`,
    value_cents: 9900,
    email: "",
    test_event_code: "TEST12345",
  });
  const [sending, setSending] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
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
      supabase.from("app_settings").select("key,value").in("key", ["kennel_capi_enabled", "kennel_oci_enabled"]),
    ]);
    setEvents((ev as CapiEvent[]) ?? []);
    setRecent((rec as CapiEvent[]) ?? []);
    const fmap = Object.fromEntries((flags ?? []).map((f: any) => [f.key, f.value]));
    setEnabled(fmap.kennel_capi_enabled === true || fmap.kennel_capi_enabled === "true");
    setOciEnabled(fmap.kennel_oci_enabled === true || fmap.kennel_oci_enabled === "true");
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

  const toggleFlag = async (key: string, next: boolean) => {
    const { error } = await supabase.from("app_settings").upsert({ key, value: next }, { onConflict: "key" });
    if (error) { toast.error(error.message); return; }
    toast.success(`${key} = ${next}`);
    load();
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
            <Button size="sm" variant="outline" style={SHARP} onClick={checkGoogleHealth} disabled={checkingHealth}>
              {checkingHealth ? "Checking…" : "Check"}
            </Button>
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