// Drains local_delivery_events with capi_status='pending' or oci_status='pending'
// and dispatches each to Meta Conversions API (hashed email match) and stamps
// Google OCI as skipped until we capture gclid via the delivery platform.
// Runs every 5 minutes via pg_cron; also callable on demand.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SB = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BATCH_SIZE = 200;

interface DeliveryRow {
  id: string;
  platform: string;
  external_event_id: string;
  customer_email_hash: string | null;
  revenue_cents: number | null;
  occurred_at: string;
  raw: any;
  capi_status: string | null;
  oci_status: string | null;
}

/** Meta CAPI with pre-hashed email. Returns ok/error/skipped. */
async function sendMetaCapi(row: DeliveryRow): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const pixelId = Deno.env.get("META_PIXEL_ID");
  const token = Deno.env.get("META_CAPI_TOKEN");
  if (!pixelId || !token) return { ok: true, skipped: true };

  const userData: Record<string, unknown> = {};
  if (row.customer_email_hash) userData.em = [row.customer_email_hash];
  // No fbp/fbc available from delivery platforms; Meta still accepts hashed-email match.
  if (Object.keys(userData).length === 0) {
    return { ok: false, error: "no user identifiers (missing email_hash)" };
  }

  const eventTime = Math.floor(new Date(row.occurred_at).getTime() / 1000);
  const body = {
    data: [{
      event_name: "Purchase",
      event_time: eventTime,
      event_id: `${row.platform}:${row.external_event_id}`, // dedup key
      action_source: "physical_store",
      user_data: userData,
      custom_data: {
        currency: "USD",
        value: (row.revenue_cents ?? 0) / 100,
        order_id: row.external_event_id,
        delivery_platform: row.platform,
      },
    }],
  };

  try {
    const r = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const t = await r.text();
    if (!r.ok) return { ok: false, error: `Meta ${r.status} ${t.slice(0, 180)}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Meta ${String(e?.message ?? e)}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { data: rows, error } = await SB
      .from("local_delivery_events")
      .select("id, platform, external_event_id, customer_email_hash, revenue_cents, occurred_at, raw, capi_status, oci_status")
      .or("capi_status.eq.pending,oci_status.eq.pending")
      .order("occurred_at", { ascending: true })
      .limit(BATCH_SIZE);
    if (error) throw error;

    let capiSent = 0, capiFailed = 0, capiSkipped = 0;
    let ociSkipped = 0;

    for (const row of (rows ?? []) as DeliveryRow[]) {
      const updates: Record<string, unknown> = { processed_at: new Date().toISOString() };

      if (row.capi_status === "pending") {
        const res = await sendMetaCapi(row);
        if (res.skipped) {
          updates.capi_status = "skipped_no_secret";
          capiSkipped++;
        } else if (res.ok) {
          updates.capi_status = "sent";
          capiSent++;
        } else {
          updates.capi_status = `failed: ${res.error}`.slice(0, 200);
          capiFailed++;
        }
      }

      if (row.oci_status === "pending") {
        // Google Offline Conversion Import requires a gclid we don't have from
        // delivery-platform webhooks. Mark skipped; revisit when platform
        // attribution payloads include click ids.
        updates.oci_status = "skipped_no_gclid";
        ociSkipped++;
      }

      await SB.from("local_delivery_events").update(updates).eq("id", row.id);
    }

    return J(200, {
      ok: true,
      drained: rows?.length ?? 0,
      capi: { sent: capiSent, failed: capiFailed, skipped: capiSkipped },
      oci: { skipped: ociSkipped },
    });
  } catch (e: any) {
    console.error("kennel-delivery-fanout", e);
    return J(500, { error: String(e?.message ?? e) });
  }
});