/**
 * Generic Meta Conversions API event sender for lifecycle events
 * (Subscribe, StartTrial, ClubCancelled, ShipmentSkipped, PaymentDeclined,
 * LTVMilestone, etc.).
 *
 * Distinct from `serverConversions.ts` which is Purchase-only and also fires
 * GA4. This helper:
 *  - Sends ONE event to Meta CAPI with arbitrary event_name + custom_data
 *  - Logs the attempt to `meta_capi_events`
 *  - Respects `app_settings.kennel_capi_enabled` kill switch
 *  - Suppresses internal/test emails so they never pollute ad attribution
 *
 * All inputs optional except event_name + event_id (used for Meta dedup).
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface CapiEventInput {
  eventName: string;            // "Subscribe" | "StartTrial" | "Lead" | custom
  eventId: string;              // dedup key (membership_id, shipment_id, ...)
  valueCents?: number;          // 0 for non-monetary
  currency?: string;            // default USD
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  customData?: Record<string, unknown>;
  testMode?: boolean;
  testEventCode?: string | null;
}

async function sha256Lower(input: string | null | undefined): Promise<string | undefined> {
  if (!input) return undefined;
  const data = new TextEncoder().encode(String(input).trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Fire-and-forget wrapper. Catches all errors so callers can `await` without
 * any risk of throwing into their main flow.
 */
export async function sendCapiEventSafe(input: CapiEventInput): Promise<void> {
  try {
    await sendCapiEvent(input);
  } catch (e) {
    console.error("[capi] sendCapiEventSafe error", input.eventName, e);
  }
}

export async function sendCapiEvent(input: CapiEventInput): Promise<{
  ok: boolean;
  skipped?: boolean;
  error?: string;
  status?: number;
}> {
  const admin = getAdminClient();

  // Internal user suppression
  try {
    const { isInternalEmail } = await import("./internalUsers.ts");
    if (isInternalEmail(input.email)) {
      await logEvent(admin, input, { success: false, error: "internal_user_suppressed" });
      return { ok: true, skipped: true, error: "internal_user_suppressed" };
    }
  } catch {
    // helper missing → continue
  }

  // Kill switch (allow test_mode regardless, mirrors meta-capi-sender)
  const { data: flagRow } = await admin
    .from("app_settings").select("value").eq("key", "kennel_capi_enabled").maybeSingle();
  const enabled = flagRow?.value === true || flagRow?.value === "true";
  if (!enabled && !input.testMode) {
    await logEvent(admin, input, { success: false, error: "kennel_capi_enabled=false" });
    return { ok: false, skipped: true, error: "disabled" };
  }

  const pixelId = Deno.env.get("META_PIXEL_ID");
  const token = Deno.env.get("META_CAPI_TOKEN");
  if (!pixelId || !token) {
    await logEvent(admin, input, { success: false, error: "META_PIXEL_ID/TOKEN not configured" });
    return { ok: true, skipped: true, error: "credentials_missing" };
  }

  // Live dedup: identical (event_id, event_name) already succeeded? skip.
  if (!input.testMode) {
    const { data: existing } = await admin
      .from("meta_capi_events")
      .select("id")
      .eq("event_id", input.eventId)
      .eq("event_name", input.eventName)
      .eq("test_mode", false)
      .eq("success", true)
      .maybeSingle();
    if (existing) {
      return { ok: true, skipped: true, error: "already_sent" };
    }
  }

  const [em, ph, fn, ln, ct, st, zp, country] = await Promise.all([
    sha256Lower(input.email),
    sha256Lower(input.phone?.replace(/\D/g, "")),
    sha256Lower(input.firstName),
    sha256Lower(input.lastName),
    sha256Lower(input.city),
    sha256Lower(input.state),
    sha256Lower(input.zip),
    sha256Lower(input.country || "us"),
  ]);

  const userData: Record<string, unknown> = {};
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (fn) userData.fn = [fn];
  if (ln) userData.ln = [ln];
  if (ct) userData.ct = [ct];
  if (st) userData.st = [st];
  if (zp) userData.zp = [zp];
  if (country) userData.country = [country];
  if (input.fbc) userData.fbc = input.fbc;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.userAgent) userData.client_user_agent = input.userAgent;

  const testCode = input.testMode
    ? (input.testEventCode || Deno.env.get("META_TEST_EVENT_CODE") || "TEST12345")
    : null;

  const valueCents = input.valueCents ?? 0;
  const body: Record<string, unknown> = {
    data: [{
      event_name: input.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: input.eventId,
      action_source: "website",
      event_source_url: `${Deno.env.get("PUBLIC_SITE_URL") ?? "https://rescuedog.lovable.app"}/`,
      user_data: userData,
      custom_data: {
        currency: input.currency || "USD",
        value: valueCents / 100,
        ...(input.customData ?? {}),
      },
    }],
    ...(testCode ? { test_event_code: testCode } : {}),
  };

  let success = false;
  let status: number | undefined;
  let error: string | undefined;
  let responseParsed: unknown = null;

  try {
    const r = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    status = r.status;
    const text = await r.text().catch(() => "");
    try { responseParsed = JSON.parse(text); } catch { responseParsed = text; }
    success = r.ok;
    if (!r.ok) error = `Meta ${r.status}: ${text.slice(0, 200)}`;
  } catch (e) {
    error = `Meta fetch error: ${String(e)}`;
  }

  await logEvent(admin, input, {
    success, error: error ?? null, status: status ?? null,
    request: { event_name: input.eventName, event_id: input.eventId, value_cents: valueCents },
    response: responseParsed,
    emailHash: em ?? null,
  });

  return { ok: success, status, error };
}

async function logEvent(
  admin: SupabaseClient,
  input: CapiEventInput,
  meta: { success: boolean; error?: string | null; status?: number | null; request?: unknown; response?: unknown; emailHash?: string | null },
) {
  try {
    await admin.from("meta_capi_events").insert({
      order_id: input.eventId, // legacy NOT NULL column — reuse event_id for non-order events
      event_id: input.eventId,
      event_name: input.eventName,
      value_cents: input.valueCents ?? 0,
      currency: input.currency ?? "USD",
      test_mode: !!input.testMode,
      test_event_code: input.testMode ? (input.testEventCode ?? null) : null,
      fbc: input.fbc ?? null,
      fbp: input.fbp ?? null,
      email_hash: meta.emailHash ?? null,
      request_payload: meta.request ?? null,
      response_status: meta.status ?? null,
      response_body: (meta.response as object) ?? null,
      success: meta.success,
      error: meta.error ?? null,
    });
  } catch (e) {
    console.error("[capi] log insert failed", e);
  }
}
