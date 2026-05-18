// UberEats purchase webhook.
// Header: X-Uber-Signature (sha256 hex). Secret: UBEREATS_WEBHOOK_SECRET.
import { cors, json, verifyHmac, hashEmail, persistDeliveryEvent } from "../_shared/local-delivery.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const raw = await req.text();
  const sig = req.headers.get("x-uber-signature") ?? req.headers.get("x-signature");
  const ok = await verifyHmac(
    raw, sig, Deno.env.get("UBEREATS_WEBHOOK_SECRET"),
    { allowTest: new URL(req.url).searchParams.get("test") === "true" },
  );
  if (!ok) return json(401, { error: "invalid signature" });

  let body: any;
  try { body = JSON.parse(raw); } catch { return json(400, { error: "invalid json" }); }

  // UberEats webhooks nest under event_type + meta.resource_id
  const external_event_id = String(
    body.event_id ?? body.meta?.resource_id ?? body.order_id ?? body.id ?? "",
  );
  if (!external_event_id) return json(400, { error: "missing event_id" });

  const order = body.order ?? body;
  const li = Array.isArray(order.items) && order.items[0] ? order.items[0] : {};
  try {
    const saved = await persistDeliveryEvent({
      platform: "ubereats",
      external_event_id,
      customer_email_hash: await hashEmail(order.eater?.email ?? body.customer?.email ?? null),
      sku: li.external_id ?? li.sku ?? null,
      qty: typeof li.quantity === "number" ? li.quantity : null,
      revenue_cents: typeof order.payment?.charges?.total?.amount === "number"
        ? Math.round(order.payment.charges.total.amount * 100)
        : (typeof body.total_cents === "number" ? body.total_cents : null),
      occurred_at: body.event_time ?? order.placed_at ?? new Date().toISOString(),
      raw: body,
    });
    return json(200, { ok: true, id: saved?.id });
  } catch (e: any) {
    console.error("[webhook-ubereats]", e);
    return json(500, { error: String(e?.message ?? e) });
  }
});