// Mid-funnel Meta CAPI relay for ViewContent / InitiateCheckout events.
//
// Applies state-margin multiplier to estimated_value, hashes PII, fires to
// Meta Conversions API, and logs every attempt to public.meta_capi_events
// with raw_value_cents + multiplier + state for downstream audit.
//
// Public endpoint (no JWT required) — site fires this from PDP mount and
// checkout handoff. Rate-limited de-facto by Meta dedup on event_id.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_EVENTS = new Set(["ViewContent", "InitiateCheckout", "AddToCart"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(s: string | null | undefined): Promise<string | null> {
  if (!s) return null;
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(s).trim().toLowerCase()),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const eventName = String(body.event_name || "");
  if (!ALLOWED_EVENTS.has(eventName)) {
    return json({ error: `event_name must be one of ${[...ALLOWED_EVENTS].join(", ")}` }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Internal suppression
  try {
    const { isInternalEmail } = await import("../_shared/internalUsers.ts");
    if (isInternalEmail(body.email)) {
      return json({ ok: true, skipped: "internal_user" });
    }
  } catch { /* ignore */ }

  // Resolve state multiplier
  const stateRaw: string | null = body.state ? String(body.state).toUpperCase().slice(0, 2) : null;
  let multiplier = 1.0;
  if (stateRaw) {
    const { data: tier } = await admin
      .from("state_margin_tiers")
      .select("multiplier")
      .eq("state_code", stateRaw)
      .maybeSingle();
    if (tier?.multiplier) multiplier = Number(tier.multiplier);
  }

  const rawValueCents = Math.max(0, Math.round(Number(body.value_cents ?? 0)));
  const weightedValueCents = Math.round(rawValueCents * multiplier);

  // Stable-ish event_id; if email present hash it, else use visitor_id, else random
  const idSeed = body.email
    ? await sha256Hex(body.email)
    : body.visitor_id
    ? String(body.visitor_id)
    : crypto.randomUUID();
  const nowSec = Math.floor(Date.now() / 1000);
  const eventId = `mf_${idSeed}_${eventName}_${nowSec}`;

  // Hash PII for Meta user_data
  const [em, ph, fn, ln, st, country] = await Promise.all([
    sha256Hex(body.email),
    sha256Hex(body.phone ? String(body.phone).replace(/\D/g, "") : null),
    sha256Hex(body.first_name),
    sha256Hex(body.last_name),
    sha256Hex(stateRaw?.toLowerCase()),
    sha256Hex("us"),
  ]);

  const userData: Record<string, unknown> = {};
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (fn) userData.fn = [fn];
  if (ln) userData.ln = [ln];
  if (st) userData.st = [st];
  if (country) userData.country = [country];
  if (body.fbp) userData.fbp = body.fbp;
  if (body.fbc) userData.fbc = body.fbc;
  const ua = req.headers.get("user-agent");
  if (ua) userData.client_user_agent = ua;
  const ip = req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) userData.client_ip_address = ip;

  const pixelId = Deno.env.get("META_PIXEL_ID");
  const token = Deno.env.get("META_CAPI_TOKEN");

  let ok = false;
  let errMsg: string | null = null;
  let status: number | null = null;
  let respBody: any = null;

  if (!pixelId || !token) {
    errMsg = "meta_credentials_missing";
  } else {
    const payload = {
      data: [{
        event_name: eventName,
        event_time: nowSec,
        event_id: eventId,
        action_source: "website",
        event_source_url: body.page_url || "https://rescuedogwines.com/",
        user_data: userData,
        custom_data: {
          currency: "USD",
          value: weightedValueCents / 100,
          content_type: "product",
          ...(body.product_id ? { content_ids: [String(body.product_id)] } : {}),
        },
      }],
    };
    try {
      const r = await fetch(
        `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      );
      status = r.status;
      const txt = await r.text().catch(() => "");
      try { respBody = JSON.parse(txt); } catch { respBody = txt; }
      ok = r.ok;
      if (!ok) errMsg = `Meta ${r.status}: ${String(txt).slice(0, 200)}`;
    } catch (e) {
      errMsg = `Meta fetch: ${String(e)}`;
    }
  }

  // Log (best-effort)
  try {
    await admin.from("meta_capi_events").insert({
      order_id: eventId, // event_id reused for non-order events (legacy NOT NULL column)
      event_name: eventName,
      event_id: eventId,
      value_cents: weightedValueCents,
      raw_value_cents: rawValueCents,
      multiplier,
      state: stateRaw,
      currency: "USD",
      test_mode: !!body.test_mode,
      email_hash: em,
      fbc: body.fbc ?? null,
      fbp: body.fbp ?? null,
      request_payload: { event_name: eventName, value_cents: weightedValueCents, page_url: body.page_url },
      response_status: status,
      response_body: typeof respBody === "object" && respBody !== null ? respBody : null,
      success: ok,
      error: errMsg,
    });
  } catch (e) {
    console.warn("[capi-midfunnel] log insert", String(e).slice(0, 200));
  }

  return json({ ok, event_id: eventId, multiplier, weighted_value_cents: weightedValueCents, error: errMsg });
});
