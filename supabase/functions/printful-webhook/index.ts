// printful-webhook
//
// Receives shipping/status events from Printful (real or simulated) and
// relays carrier + tracking_number back to the parent Vinoshipper order so
// the customer sees a unified shipment in their VS account.
//
// Supported event types (Printful naming):
//   - package_shipped      → write tracking to VS + mark dropship_orders.shipped
//   - package_returned     → mark dropship_orders.returned
//   - order_updated        → status sync only
//   - order_failed         → mark dropship_orders.failed, alert ops
//
// When VINOSHIPPER credentials are missing OR body.simulate === true the
// VS relay is logged but not POSTed, so the whole loop is testable without
// touching live Vinoshipper.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { vsFetch, vsLiveMode } from "../_shared/vinoshipper.ts";

const EventSchema = z.object({
  type: z.enum(["package_shipped", "package_returned", "order_updated", "order_failed"]),
  data: z.object({
    order: z.object({
      id: z.union([z.string(), z.number()]),
      external_id: z.string().optional(),
      status: z.string().optional(),
    }),
    shipment: z
      .object({
        carrier: z.string().optional(),
        service: z.string().optional(),
        tracking_number: z.string().optional(),
        tracking_url: z.string().optional(),
        ship_date: z.string().optional(),
      })
      .optional(),
  }),
  simulate: z.boolean().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return json({ error: "invalid json" }, 400);
  }
  const parsed = EventSchema.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const evt = parsed.data;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Find the parent VS order via our dropship_orders row.
  const partnerOrderId = String(evt.data.order.id);
  const externalId = evt.data.order.external_id ?? "";
  const { data: row } = await supabase
    .from("dropship_orders")
    .select("id,vinoshipper_order_id,simulated,status")
    .or(`partner_order_id.eq.${partnerOrderId},vendor_order_id.eq.${externalId}`)
    .maybeSingle();

  if (!row) {
    console.warn("[printful-webhook] no matching dropship_orders row", evt.data.order);
    return json({ ok: true, ignored: true, reason: "no_match" });
  }

  const simulate = evt.simulate === true || row.simulated === true || !vsLiveMode();
  const updates: Record<string, unknown> = { notes: JSON.stringify(evt) };

  let vsRelay: unknown = null;
  if (evt.type === "package_shipped" && evt.data.shipment) {
    updates.fulfillment_status_detail = "shipped";
    updates.tracking_number = evt.data.shipment.tracking_number ?? null;
    updates.tracking_url = evt.data.shipment.tracking_url ?? null;
    updates.carrier = evt.data.shipment.carrier ?? null;
    updates.shipped_at = evt.data.shipment.ship_date ?? new Date().toISOString();

    if (simulate) {
      vsRelay = { simulated: true, would_put: `/orders/${row.vinoshipper_order_id}/tracking` };
    } else {
      try {
        vsRelay = await vsFetch(`/orders/${row.vinoshipper_order_id}/tracking`, {
          method: "PUT",
          body: {
            carrier: evt.data.shipment.carrier,
            trackingNumber: evt.data.shipment.tracking_number,
            trackingUrl: evt.data.shipment.tracking_url,
          },
        });
      } catch (err) {
        console.error("[printful-webhook] VS relay failed", err);
        vsRelay = { error: String(err) };
      }
    }
  } else if (evt.type === "package_returned") {
    updates.fulfillment_status_detail = "cancelled";
  } else if (evt.type === "order_failed") {
    updates.fulfillment_status_detail = "failed";
  } else if (evt.type === "order_updated" && evt.data.order.status === "delivered") {
    updates.fulfillment_status_detail = "delivered";
    updates.delivered_at = new Date().toISOString();
  }

  await supabase.from("dropship_orders").update(updates).eq("id", row.id);

  return json({ ok: true, simulated: simulate, dropship_order_id: row.id, vs_relay: vsRelay });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}