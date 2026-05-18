// GoPuff purchase webhook.
// Header: X-GoPuff-Signature (sha256 hex). Secret: GOPUFF_WEBHOOK_SECRET.
import { cors, json, verifyHmac, hashEmail, persistDeliveryEvent } from "../_shared/local-delivery.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const raw = await req.text();
  const sig = req.headers.get("x-gopuff-signature") ?? req.headers.get("x-signature");
  const ok = await verifyHmac(
    raw, sig, Deno.env.get("GOPUFF_WEBHOOK_SECRET"),
    { allowTest: new URL(req.url).searchParams.get("test") === "true" },
  );
  if (!ok) return json(401, { error: "invalid signature" });

  let body: any;
  try { body = JSON.parse(raw); } catch { return json(400, { error: "invalid json" }); }

  const external_event_id = String(body.order_id ?? body.event_id ?? body.id ?? "");
  if (!external_event_id) return json(400, { error: "missing order_id" });

  const li = Array.isArray(body.line_items) && body.line_items[0] ? body.line_items[0] : {};
  try {
    const saved = await persistDeliveryEvent({
      platform: "gopuff",
      external_event_id,
      customer_email_hash: await hashEmail(body.customer?.email ?? body.email ?? null),
      sku: li.sku ?? li.product_id ?? null,
      qty: typeof li.quantity === "number" ? li.quantity : null,
      revenue_cents: typeof body.total_cents === "number" ? body.total_cents : null,
      occurred_at: body.placed_at ?? body.occurred_at ?? new Date().toISOString(),
      raw: body,
    });
    return json(200, { ok: true, id: saved?.id });
  } catch (e: any) {
    console.error("[webhook-gopuff]", e);
    return json(500, { error: String(e?.message ?? e) });
  }
});