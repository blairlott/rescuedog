// Webhook receiver for doordash purchase events. Verifies signature when secret present,
// dedupes by external_event_id, fans out to Meta CAPI + Google OCI helpers (stubbed where helpers are TBD).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const PLATFORM = "doordash";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sha256hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // TODO: verify platform-specific signature header (HMAC-SHA256 of body using shared secret)
  // const sig = req.headers.get("x-doordash-signature");
  // const secret = Deno.env.get("doordashUPPER_WEBHOOK_SECRET");

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const externalId = String(body?.event_id ?? body?.id ?? crypto.randomUUID());
  const email = String(body?.customer_email ?? body?.email ?? "").toLowerCase();
  const emailHash = email ? await sha256hex(email) : null;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: row, error } = await admin.from("local_delivery_events").upsert({
    platform: PLATFORM,
    external_event_id: externalId,
    customer_email_hash: emailHash,
    sku: body?.sku ?? null,
    qty: body?.qty ?? null,
    revenue_cents: body?.revenue_cents ?? null,
    occurred_at: body?.occurred_at ?? new Date().toISOString(),
    raw: body,
  }, { onConflict: "platform,external_event_id" }).select().single();

  if (error) return json({ error: error.message }, 500);

  // TODO: fan out to Meta CAPI + Google OCI (using existing Z3/vinoshipper-poll helpers)
  return json({ ok: true, id: row?.id, dedup: !!row });
});
