// Instacart purchase webhook.
// Header: X-Instacart-Signature (sha256 hex of body using INSTACART_WEBHOOK_SECRET).
// Body shape (assumed, refine after IC sandbox sample arrives):
//   { event_id, occurred_at, customer: { email }, line_items: [{ sku, qty }], total_cents }
import { cors, json, verifyHmac, hashEmail, persistDeliveryEvent } from "../_shared/local-delivery.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const raw = await req.text();
  const sig = req.headers.get("x-instacart-signature") ?? req.headers.get("x-signature");
  const ok = await verifyHmac(
    raw, sig, Deno.env.get("INSTACART_WEBHOOK_SECRET"),
    { allowTest: new URL(req.url).searchParams.get("test") === "true" },
  );
  if (!ok) return json(401, { error: "invalid signature" });

  let body: any;
  try { body = JSON.parse(raw); } catch { return json(400, { error: "invalid json" }); }

  const external_event_id = String(body.event_id ?? body.id ?? "");
  if (!external_event_id) return json(400, { error: "missing event_id" });

  const li = Array.isArray(body.line_items) && body.line_items[0] ? body.line_items[0] : {};
  try {
    const saved = await persistDeliveryEvent({
      platform: "instacart",
      external_event_id,
      customer_email_hash: await hashEmail(body.customer?.email ?? body.email ?? null),
      sku: li.sku ?? null,
      qty: typeof li.qty === "number" ? li.qty : null,
      revenue_cents: typeof body.total_cents === "number" ? body.total_cents : null,
      occurred_at: body.occurred_at ?? new Date().toISOString(),
      raw: body,
    });
    return json(200, { ok: true, id: saved?.id });
  } catch (e: any) {
    console.error("[webhook-instacart-purchase]", e);
    return json(500, { error: String(e?.message ?? e) });
  }
});