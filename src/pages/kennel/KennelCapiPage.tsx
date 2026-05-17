import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Send, Activity } from "lucide-react";

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
  const [enabled, setEnabled] = useState(true);
  const [ociEnabled, setOciEnabled] = useState(false);
  const [testOrder, setTestOrder] = useState({
    order_id: `test-${Date.now()}`,
    value_cents: 9900,
    email: "",
    test_event_code: "TEST12345",
  });
  const [sending, setSending] = useState(false);

  const load = async () => {
    const [{ data: ev }, { data: flags }] = await Promise.all([
      supabase.from("meta_capi_events").select("*").order("sent_at", { ascending: false }).limit(50),
      supabase.from("app_settings").select("key,value").in("key", ["kennel_capi_enabled", "kennel_oci_enabled"]),
    ]);
    setEvents((ev as CapiEvent[]) ?? []);
    const fmap = Object.fromEntries((flags ?? []).map((f: any) => [f.key, f.value]));
    setEnabled(fmap.kennel_capi_enabled === true || fmap.kennel_capi_enabled === "true");
    setOciEnabled(fmap.kennel_oci_enabled === true || fmap.kennel_oci_enabled === "true");
  };

  useEffect(() => { load(); }, []);

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
      console.log("CAPI test result", data);
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

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold uppercase tracking-brand">Meta CAPI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Server-side Purchase events for Vinoshipper orders. Fires from the Z3a poll cycle (daily 1:30am ET).
          Uses <code className="px-1 bg-muted">order_id</code> as event_id to dedupe against the browser Pixel.
        </p>
      </header>

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