import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * /v3/admin/printful-sim
 *
 * End-to-end Printful loop simulation. No real API keys required.
 *   1. Dispatch — fabricate a Printful order from a sample VS order id
 *   2. Ship    — fire a simulated `package_shipped` webhook with tracking
 *   3. Deliver — fire a simulated `order_updated` → delivered
 * Each step calls our edge functions in simulate=true mode so we can verify
 * the relay chain into the Vinoshipper tracking endpoint without writing to
 * real partner systems.
 */
export default function V3PrintfulSim() {
  const [vsOrderId, setVsOrderId] = useState("sim-vs-001");
  const [partnerOrderId, setPartnerOrderId] = useState<string>("");
  const [tracking, setTracking] = useState("1Z999AA10123456784");
  const [log, setLog] = useState<string[]>([]);
  const [liveMode, setLiveMode] = useState(false);
  const simulate = !liveMode;

  const append = (label: string, payload: unknown) =>
    setLog((l) => [`[${new Date().toLocaleTimeString()}] ${label}\n${JSON.stringify(payload, null, 2)}`, ...l]);

  const dispatch = async () => {
    const { data, error } = await supabase.functions.invoke("printful-dispatch", {
      body: {
        vs_order_id: vsOrderId,
        simulate,
        recipient: {
          name: "Test Rescue",
          address1: "1 Bone Lane",
          city: "Austin",
          state_code: "TX",
          country_code: "US",
          zip: "78701",
          email: "test@example.com",
        },
        items: [{ sku: "RDW-HAT-RED", quantity: 1 }],
      },
    });
    if (error) return append("dispatch FAILED", error);
    setPartnerOrderId(data?.printful_order_id ?? "");
    append("dispatch", data);
  };

  const fireShipped = async () => {
    const { data, error } = await supabase.functions.invoke("printful-webhook", {
      body: {
        type: "package_shipped",
        simulate,
        data: {
          order: { id: partnerOrderId, external_id: `vs_${vsOrderId}` },
          shipment: {
            carrier: "USPS",
            service: "Ground Advantage",
            tracking_number: tracking,
            tracking_url: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}`,
            ship_date: new Date().toISOString(),
          },
        },
      },
    });
    append(error ? "shipped FAILED" : "package_shipped → VS relay", error ?? data);
  };

  const fireDelivered = async () => {
    const { data, error } = await supabase.functions.invoke("printful-webhook", {
      body: {
        type: "order_updated",
        simulate,
        data: { order: { id: partnerOrderId, external_id: `vs_${vsOrderId}`, status: "delivered" } },
      },
    });
    append(error ? "delivered FAILED" : "order_updated → delivered", error ?? data);
  };

  return (
    <main className="mx-auto max-w-4xl p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Printful — End-to-end simulation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tests the full <code>VS order → printful-dispatch → partner ships → printful-webhook → VS tracking relay</code> loop
          using fabricated payloads. Safe to run repeatedly — no real Printful or Vinoshipper writes.
        </p>
      </header>

      <section className="border p-4 space-y-3">
        <h2 className="font-semibold">1. Inputs</h2>
        <label className="flex items-center gap-2 text-sm border p-2 bg-muted">
          <input
            type="checkbox"
            checked={liveMode}
            onChange={(e) => setLiveMode(e.target.checked)}
          />
          <span className="font-medium">
            LIVE MODE {liveMode ? "ON — real Printful API calls will be made" : "OFF (simulated)"}
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            VS order id
            <input
              className="block w-full border px-2 py-1 mt-1"
              value={vsOrderId}
              onChange={(e) => setVsOrderId(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Tracking number
            <input
              className="block w-full border px-2 py-1 mt-1"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
            />
          </label>
        </div>
        {partnerOrderId && (
          <p className="text-xs text-muted-foreground">
            Partner order id: <code>{partnerOrderId}</code>
          </p>
        )}
      </section>

      <section className="border p-4 space-y-3">
        <h2 className="font-semibold">2. Run steps in order</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={dispatch} className="bg-primary text-primary-foreground px-3 py-2 text-sm">
            Dispatch to Printful
          </button>
          <button
            onClick={fireShipped}
            disabled={!partnerOrderId}
            className="bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-40"
          >
            Simulate package_shipped
          </button>
          <button
            onClick={fireDelivered}
            disabled={!partnerOrderId}
            className="bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-40"
          >
            Simulate delivered
          </button>
        </div>
      </section>

      <section className="border p-4">
        <h2 className="font-semibold mb-2">3. Event log</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet. Hit Dispatch above.</p>
        ) : (
          <pre className="text-xs whitespace-pre-wrap max-h-[480px] overflow-auto bg-muted p-3">
            {log.join("\n\n———\n\n")}
          </pre>
        )}
      </section>
    </main>
  );
}