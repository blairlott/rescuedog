import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, RefreshCw, Activity, Truck, Store, Wine, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

type Partner = {
  id: string;
  name: string;
  slug: string;
  vendor_type: string;
  status: string;
  simulation_mode: boolean;
  fulfills_from_us: boolean;
  last_health_check_at: string | null;
  last_health_status: string | null;
  api_base_url: string | null;
};

type RelayRow = {
  id: string;
  dropship_order_id: string | null;
  vinoshipper_order_id: string | null;
  tracking_number: string | null;
  carrier: string | null;
  attempt_at: string;
  http_status: number | null;
  relay_ok: boolean;
  verified_at: string | null;
  verified_ok: boolean | null;
  mismatch_reason: string | null;
  simulated: boolean;
};

type MismatchOrder = {
  id: string;
  vinoshipper_order_id: string | null;
  tracking_number: string | null;
  vs_tracking_mismatch: string;
  vs_tracking_relayed_at: string | null;
  vs_tracking_verified_at: string | null;
};

type Application = {
  id: string;
  business_name: string;
  contact_name: string | null;
  contact_email: string | null;
  business_type: string | null;
  status: string;
  created_at: string;
};

const VENDOR_ICON: Record<string, typeof Truck> = {
  printful: ShoppingBag,
  printify: ShoppingBag,
  gooten: ShoppingBag,
  vinoshipper_warehouse: Wine,
  partner_direct: Store,
};

export function HealthTrackingTab() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [relays, setRelays] = useState<RelayRow[]>([]);
  const [mismatches, setMismatches] = useState<MismatchOrder[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  async function load() {
    setLoading(true);
    const [p, r, m, a] = await Promise.all([
      supabase
        .from("dropship_partners")
        .select("id, name, slug, vendor_type, simulation_mode, status, last_health_check_at, last_health_status")
        .order("name"),
      supabase
        .from("vs_tracking_relay_log")
        .select("*")
        .order("attempt_at", { ascending: false })
        .limit(50),
      supabase
        .from("dropship_orders")
        .select("id,vinoshipper_order_id,tracking_number,vs_tracking_mismatch,vs_tracking_relayed_at,vs_tracking_verified_at")
        .not("vs_tracking_mismatch", "is", null)
        .order("vs_tracking_relayed_at", { ascending: false })
        .limit(25),
      supabase
        .from("marketplace_partner_applications")
        .select("id,business_name,contact_name,contact_email,business_type,status,created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setPartners((p.data as Partner[]) ?? []);
    setRelays((r.data as RelayRow[]) ?? []);
    setMismatches((m.data as MismatchOrder[]) ?? []);
    setApplications((a.data as Application[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function verifyAllPending() {
    setVerifying(true);
    const { data, error } = await supabase.functions.invoke("vs-tracking-verify", {
      body: { all_pending: true, simulate: true },
    });
    setVerifying(false);
    if (error) {
      toast.error(`Verify failed: ${error.message}`);
    } else {
      toast.success(`Verified ${data?.checked ?? 0} orders`);
      await load();
    }
  }

  async function verifyOne(orderId: string) {
    const { error } = await supabase.functions.invoke("vs-tracking-verify", {
      body: { dropship_order_id: orderId, simulate: true },
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Re-verified");
      await load();
    }
  }

  async function resendTracking(orderId: string, vsOrderId: string | null) {
    if (!vsOrderId) return toast.error("Order has no Vinoshipper ID");
    const { error } = await supabase.functions.invoke("vs-tracking-verify", {
      body: { dropship_order_id: orderId, simulate: true },
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Tracking re-sent to Vinoshipper");
      await load();
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading partner ops…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Mismatch alerts */}
      {mismatches.length > 0 && (
        <Card className="border-destructive">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Vinoshipper tracking mismatch ({mismatches.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-1.5">VS Order</th>
                  <th>Tracking</th>
                  <th>Issue</th>
                  <th>Relayed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {mismatches.map((m) => (
                  <tr key={m.id} className="border-b">
                    <td className="py-1.5 font-mono">{m.vinoshipper_order_id ?? "—"}</td>
                    <td className="font-mono">{m.tracking_number ?? "—"}</td>
                    <td className="text-destructive">{m.vs_tracking_mismatch}</td>
                    <td className="text-muted-foreground">{m.vs_tracking_relayed_at ? new Date(m.vs_tracking_relayed_at).toLocaleString() : "—"}</td>
                    <td className="text-right">
                      <Button size="sm" variant="outline" onClick={() => resendTracking(m.id, m.vinoshipper_order_id)}>Resend</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Partner health */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Partner connections
          </CardTitle>
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {partners.length === 0 ? (
            <p className="text-sm text-muted-foreground">No partners configured yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-1.5">Partner</th>
                  <th>Type</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Last health check</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => {
                  const Icon = VENDOR_ICON[p.vendor_type] ?? Truck;
                  return (
                    <tr key={p.id} className="border-b">
                      <td className="py-2 font-medium flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {p.name}
                      </td>
                      <td className="text-muted-foreground">{p.vendor_type.replace(/_/g, " ")}</td>
                      <td>
                        {p.simulation_mode ? (
                          <Badge variant="outline">Sim</Badge>
                        ) : (
                          <Badge>Live</Badge>
                        )}
                      </td>
                      <td>
                        <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
                      </td>
                      <td className="text-muted-foreground">
                        {p.last_health_check_at ? (
                          <span className="flex items-center gap-1">
                            {p.last_health_status === "ok" ? (
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-3 w-3 text-destructive" />
                            )}
                            {new Date(p.last_health_check_at).toLocaleString()}
                          </span>
                        ) : (
                          <span>Never</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* VS tracking relay log */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" /> Vinoshipper tracking relay
          </CardTitle>
          <Button size="sm" variant="outline" onClick={verifyAllPending} disabled={verifying}>
            <RefreshCw className={`h-3 w-3 mr-1 ${verifying ? "animate-spin" : ""}`} />
            Verify pending
          </Button>
        </CardHeader>
        <CardContent>
          {relays.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tracking relays logged yet. Trigger one via the Printful sim.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-1.5">Time</th>
                  <th>VS Order</th>
                  <th>Carrier / #</th>
                  <th>Relay</th>
                  <th>Verified</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {relays.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-1.5 text-muted-foreground">{new Date(r.attempt_at).toLocaleString()}</td>
                    <td className="font-mono">{r.vinoshipper_order_id ?? "—"}</td>
                    <td className="font-mono">
                      {r.carrier ?? "—"} <span className="text-muted-foreground">{r.tracking_number ?? ""}</span>
                    </td>
                    <td>
                      {r.relay_ok ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {r.http_status ?? "ok"}{r.simulated ? " (sim)" : ""}
                        </span>
                      ) : (
                        <span className="text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> {r.http_status ?? "fail"}
                        </span>
                      )}
                    </td>
                    <td>
                      {r.verified_at ? (
                        r.verified_ok ? (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> ok
                          </span>
                        ) : (
                          <span className="text-destructive" title={r.mismatch_reason ?? ""}>
                            {r.mismatch_reason ?? "mismatch"}
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground">pending</span>
                      )}
                    </td>
                    <td className="text-right">
                      {r.dropship_order_id && (
                        <Button size="sm" variant="ghost" onClick={() => verifyOne(r.dropship_order_id!)}>
                          Verify
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Inbound marketplace applications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Store className="h-4 w-4" /> Inbound marketplace inquiries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No marketplace applications yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-1.5">Company</th>
                  <th>Contact</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id} className="border-b">
                    <td className="py-1.5 font-medium">{a.business_name}</td>
                    <td className="text-muted-foreground">
                      {a.contact_name}
                      {a.contact_email ? <span className="block">{a.contact_email}</span> : null}
                    </td>
                    <td className="text-muted-foreground">{a.business_type ?? "—"}</td>
                    <td>
                      <Badge variant={a.status === "approved" ? "default" : a.status === "rejected" ? "destructive" : "secondary"}>
                        {a.status}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}