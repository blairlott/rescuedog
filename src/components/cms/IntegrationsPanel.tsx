import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCcw, CheckCircle2, XCircle, AlertCircle, Send, ExternalLink } from "lucide-react";

type Status = {
  key: string;
  label: string;
  category: string;
  configured: boolean;
  required_secrets: string[];
  missing_secrets: string[];
  valid?: boolean | null;
  error?: string | null;
  notes?: string;
};

const TEST_KEYS: Record<string, string> = {
  ga4: "ga4",
  meta_capi: "meta",
  resend: "resend",
  vinoshipper: "vinoshipper",
  stripe_sandbox: "stripe",
};

export function IntegrationsPanel() {
  const { toast } = useToast();
  const [pinging, setPinging] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<Record<string, { valid?: boolean; error?: string }>>({});
  const [testOrder, setTestOrder] = useState({ amount: "42.50", email: "test@rescuedogwines.com", testCode: "" });
  const [orderResult, setOrderResult] = useState<any>(null);
  const [sendingOrder, setSendingOrder] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["integrations-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("integrations-status");
      if (error) throw error;
      return data as { integrations: Status[] };
    },
  });

  const runPing = async (status: Status) => {
    const testKey = TEST_KEYS[status.key];
    if (!testKey) return;
    setPinging(status.key);
    try {
      const { data, error } = await supabase.functions.invoke(`integrations-status?test=${testKey}`);
      if (error) throw error;
      setPingResults((p) => ({ ...p, [status.key]: data.result }));
      toast({
        title: data.result?.valid ? "Connection valid" : "Connection failed",
        description: data.result?.error || (data.result?.valid ? "Live ping succeeded." : "See details."),
      });
    } catch (e: any) {
      toast({ title: "Ping failed", description: String(e), variant: "destructive" });
    } finally {
      setPinging(null);
    }
  };

  const sendTestOrder = async () => {
    setSendingOrder(true);
    setOrderResult(null);
    try {
      const orderId = `TEST-${Date.now()}`;
      const code = testOrder.testCode.trim();
      const qs = new URLSearchParams({ debug: "1" });
      if (code) qs.set("meta_test_code", code);
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vinoshipper-webhook?${qs}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "ORDER",
          event: "PLACED",
          identifier: orderId,
          amount: parseFloat(testOrder.amount) || 0,
          currency: "USD",
          email: testOrder.email,
          firstName: "Debug",
          lastName: "Test",
          city: "Austin", state: "TX", zip: "78701", country: "US",
        }),
      });
      const json = await r.json();
      setOrderResult({ orderId, ...json });
      toast({ title: "Test order sent", description: `Order ${orderId} dispatched in debug mode.` });
    } catch (e: any) {
      toast({ title: "Test order failed", description: String(e), variant: "destructive" });
    } finally {
      setSendingOrder(false);
    }
  };

  const grouped = (data?.integrations ?? []).reduce<Record<string, Status[]>>((acc, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Test Order */}
      <section className="bg-background border border-border">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-bold text-foreground">Send Test Order</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Fires the Vinoshipper webhook in debug mode → GA4 DebugView + Meta Test Events. Will not affect production reports.
            </p>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <Label className="text-xs">Order amount (USD)</Label>
            <Input value={testOrder.amount} onChange={(e) => setTestOrder({ ...testOrder, amount: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Customer email</Label>
            <Input value={testOrder.email} onChange={(e) => setTestOrder({ ...testOrder, email: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Meta test_event_code</Label>
            <Input placeholder="optional override" value={testOrder.testCode} onChange={(e) => setTestOrder({ ...testOrder, testCode: e.target.value })} />
          </div>
          <Button onClick={sendTestOrder} disabled={sendingOrder} className="gap-2">
            {sendingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send test order
          </Button>
        </div>
        {orderResult && (
          <div className="px-6 pb-6">
            <div className="bg-muted/30 border border-border p-3 text-xs font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(orderResult, null, 2)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Verify in:{" "}
              <a href="https://analytics.google.com" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">GA4 DebugView <ExternalLink className="h-3 w-3" /></a>
              {" · "}
              <a href="https://business.facebook.com/events_manager2" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">Meta Test Events <ExternalLink className="h-3 w-3" /></a>
            </p>
          </div>
        )}
      </section>

      {/* Status grid */}
      <section className="bg-background border border-border">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-bold text-foreground">Integrations</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Live connection status for every analytics, ads, commerce, payments, and email platform.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
        <div className="p-6 space-y-6">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{cat}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map((s) => {
                  const ping = pingResults[s.key];
                  const isPinging = pinging === s.key;
                  const hasTest = !!TEST_KEYS[s.key];
                  return (
                    <div key={s.key} className="border border-border p-4 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {s.configured ? (
                            ping?.valid === false ? <AlertCircle className="h-4 w-4 text-yellow-600" />
                            : ping?.valid === true ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                            : <CheckCircle2 className="h-4 w-4 text-green-600/60" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="font-semibold text-sm">{s.label}</span>
                        </div>
                        {hasTest && s.configured && (
                          <Button size="sm" variant="outline" onClick={() => runPing(s)} disabled={isPinging} className="h-7 text-xs">
                            {isPinging ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
                          </Button>
                        )}
                      </div>
                      {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
                      {!s.configured && s.missing_secrets.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Missing: <span className="font-mono">{s.missing_secrets.join(", ")}</span>
                        </div>
                      )}
                      {ping?.error && (
                        <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-1">{ping.error}</div>
                      )}
                      {ping?.valid && (
                        <div className="text-xs text-green-700">Live ping OK</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground">
            To <strong>add or rotate</strong> a secret (API key, token), ask the AI: <em>"Add secrets X, Y, Z"</em>. Secrets live in Lovable Cloud and are
            never returned to the browser. Removing a secret deactivates the integration on the next request.
          </p>
        </div>
      </section>
    </div>
  );
}