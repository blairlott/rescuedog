import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, ExternalLink, ArrowLeft, Truck } from "lucide-react";
import { carrierTrackingUrl } from "@/lib/carrierTracking";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";

type Item = { id: string; product_title: string; quantity: number; price_cents: number | null; product_image_url: string | null };
type Shipment = {
  id: string;
  status: string;
  shipment_date: string | null;
  tracking_number: string | null;
  total_cents: number | null;
  dispatched_at: string | null;
  delivery_destination_type: string | null;
  delivery_ups_access_point: any;
  items: Item[];
};

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "delivered" ? "default"
    : status === "shipped" || status === "dispatched" ? "secondary"
    : status === "cancelled" ? "destructive"
    : "outline";
  return <Badge variant={tone as any} className="uppercase tracking-brand text-[10px]">{status}</Badge>;
}

export default function MyShipmentsPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useCustomerAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login?redirect=/account/shipments"); return; }
    (async () => {
      setLoading(true);
      // Find this user's membership(s).
      const { data: memberships } = await supabase
        .from("wine_club_memberships")
        .select("id")
        .eq("user_id", user.id);
      const ids = (memberships ?? []).map((m: any) => m.id);
      if (ids.length === 0) { setShipments([]); setLoading(false); return; }
      const { data: ships } = await supabase
        .from("wine_club_shipments")
        .select("id,status,shipment_date,tracking_number,total_cents,dispatched_at,delivery_destination_type,delivery_ups_access_point,items:wine_club_shipment_items(id,product_title,quantity,price_cents,product_image_url)")
        .in("membership_id", ids)
        .order("shipment_date", { ascending: false, nullsFirst: false });
      setShipments((ships as any) ?? []);
      setLoading(false);
    })();
  }, [user, authLoading, navigate]);

  const detail = useMemo(() => id ? shipments.find(s => s.id === id) : null, [id, shipments]);

  return (
    <>
      <Seo
        title={detail ? "Shipment Details · Rescue Dog Wines" : "My Shipments · Rescue Dog Wines"}
        description="View tracking, contents, and history for your Rescue Dog Wines wine club shipments."
        noindex
      />
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-10">
        {loading || authLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : detail ? (
          <ShipmentDetail shipment={detail} onBack={() => navigate("/account/shipments")} />
        ) : (
          <ShipmentList shipments={shipments} />
        )}
      </main>
      <Footer />
    </>
  );
}

function ShipmentList({ shipments }: { shipments: Shipment[] }) {
  return (
    <>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold uppercase text-foreground">My Shipments</h1>
          <p className="text-sm text-muted-foreground mt-1">{shipments.length} total · sorted by most recent</p>
        </div>
        <Button asChild variant="outline" size="sm" className="uppercase tracking-brand text-xs">
          <Link to="/account">Back to Account</Link>
        </Button>
      </div>
      {shipments.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center">
          <Package className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No shipments yet — your first one will appear here once curated.</p>
        </div>
      ) : (
        <div className="border border-border divide-y divide-border">
          {shipments.map((s) => {
            const bottles = s.items.reduce((x, it) => x + (it.quantity || 0), 0);
            return (
              <Link to={`/account/shipments/${s.id}`} key={s.id} className="block p-4 hover:bg-muted/40 transition-colors">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground">{s.shipment_date ? new Date(s.shipment_date).toLocaleDateString() : "Date TBD"}</span>
                      <StatusBadge status={s.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {bottles} bottle{bottles !== 1 ? "s" : ""}
                      {s.tracking_number && <> · <code className="bg-muted px-1.5">{s.tracking_number}</code></>}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">
                    {typeof s.total_cents === "number" ? `$${(s.total_cents / 100).toFixed(2)}` : ""}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function ShipmentDetail({ shipment, onBack }: { shipment: Shipment; onBack: () => void }) {
  const tracking = shipment.tracking_number ? carrierTrackingUrl(shipment.tracking_number) : null;
  const bottles = shipment.items.reduce((x, it) => x + (it.quantity || 0), 0);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 -ml-2">
        <ArrowLeft className="h-4 w-4 mr-1.5" /> All Shipments
      </Button>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold uppercase text-foreground">
            Shipment · {shipment.shipment_date ? new Date(shipment.shipment_date).toLocaleDateString() : "TBD"}
          </h1>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <StatusBadge status={shipment.status} />
            {shipment.dispatched_at && (
              <span className="text-xs text-muted-foreground">Dispatched {new Date(shipment.dispatched_at).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </div>

      {/* Tracking */}
      <div className="border border-primary bg-primary/5 p-5 mb-6">
        <div className="flex items-start gap-3 flex-wrap">
          <Truck className="h-5 w-5 text-primary mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold uppercase tracking-brand text-sm">Tracking</h3>
            {shipment.tracking_number ? (
              <>
                <p className="text-sm text-muted-foreground mt-1">
                  {tracking?.carrier !== "Unknown" ? tracking?.carrier + " · " : ""}
                  <code className="bg-background border border-border px-1.5">{shipment.tracking_number}</code>
                </p>
                {tracking && (
                  <Button asChild size="sm" className="mt-3 uppercase tracking-brand text-xs">
                    <a href={tracking.url} target="_blank" rel="noopener noreferrer">
                      Track Package <ExternalLink className="h-3 w-3 ml-1.5" />
                    </a>
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">
                A tracking number will appear here as soon as your shipment is dispatched.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="border border-border p-5 mb-6">
        <h3 className="font-bold uppercase tracking-brand text-sm mb-4">
          In this shipment · {bottles} bottle{bottles !== 1 ? "s" : ""}
        </h3>
        {shipment.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Contents will be finalized closer to ship date.</p>
        ) : (
          <ul className="divide-y divide-border">
            {shipment.items.map((it) => (
              <li key={it.id} className="py-3 flex items-center gap-3">
                {it.product_image_url ? (
                  <img src={it.product_image_url} alt="" className="w-12 h-12 object-cover" />
                ) : <div className="w-12 h-12 bg-muted" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground truncate">{it.product_title}</div>
                  <div className="text-xs text-muted-foreground">Qty {it.quantity}</div>
                </div>
                <div className="text-sm tabular-nums">
                  {typeof it.price_cents === "number" ? `$${((it.price_cents * it.quantity) / 100).toFixed(2)}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
        {typeof shipment.total_cents === "number" && (
          <div className="border-t border-border mt-4 pt-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Shipment total</span>
            <span className="font-bold">${(shipment.total_cents / 100).toFixed(2)}</span>
          </div>
        )}
      </div>

      {shipment.delivery_destination_type === "ups_access_point" && shipment.delivery_ups_access_point && (
        <div className="border border-border p-5 text-sm">
          <h3 className="font-bold uppercase tracking-brand text-xs mb-2">Pickup Location</h3>
          <pre className="text-xs whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify(shipment.delivery_ups_access_point, null, 2)}
          </pre>
        </div>
      )}
    </>
  );
}