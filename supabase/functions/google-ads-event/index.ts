// Generic Google Ads OCI lifecycle event uploader.
//
// Mirrors `meta-capi-event` so the client (or other edge functions) can fire a
// single offline conversion to Google Ads without dealing with OAuth, hashing,
// or payload shape.
//
// Auth: requires a logged-in user JWT.
//
// Body:
//   {
//     event_name: "Subscribe" | "Purchase" | ...,
//     event_id:   string,            // dedup key for `oci_upload_log.order_id`
//     value:      number,            // USD
//     currency?:  string,            // defaults USD
//     gclid?:     string | null,     // raw gclid (preferred)
//     gclaw?:     string | null,     // GCL.<seconds>.<gclid> cookie value
//     email?:     string | null,     // hashed fallback
//     phone?:     string | null,
//     conversion_action_id?: string, // override; default = app_settings key
//     conversion_date_time?: string, // override; default = now in -05:00
//   }
//
// Reads:
//   - app_settings.kennel_oci_enabled (kill switch)
//   - app_settings.google_ads_subscribe_conversion_action_id
//   - app_settings.kennel_oci_conversion_action_id (fallback)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getGoogleAdsAccessToken,
  buildGoogleAdsHeaders,
  isAuthError,
} from "../_shared/googleAdsAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  event_name: string;
  event_id: string;
  value: number;
  currency?: string;
  gclid?: string | null;
  gclaw?: string | null;
  email?: string | null;
  phone?: string | null;
  conversion_action_id?: string;
  conversion_date_time?: string;
}

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string | null | undefined): Promise<string | null> {
  if (!input) return null;
  const norm = input.trim().toLowerCase();
  if (!norm) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extractGclid(b: Body): string | null {
  if (b.gclid) return b.gclid;
  if (b.gclaw) {
    // Format: GCL.<seconds>.<gclid>
    const parts = b.gclaw.split(".");
    if (parts.length >= 3) return parts.slice(2).join(".");
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: Body;
  try { body = await req.json(); } catch { return j({ error: "invalid json" }, 400); }
  if (!body.event_name || !body.event_id || typeof body.value !== "number") {
    return j({ error: "event_name, event_id and value are required" }, 400);
  }

  // Kill switch
  const { data: settings } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "kennel_oci_enabled",
      "kennel_oci_conversion_action_id",
      "google_ads_subscribe_conversion_action_id",
    ]);
  const map = new Map((settings ?? []).map((s: any) => [s.key, s.value]));
  if (String(map.get("kennel_oci_enabled") ?? "true") === "false") {
    return j({ skipped: true, reason: "kennel_oci_enabled=false" });
  }

  // Pick conversion action: per-event override, then global fallback
  const eventKey = `google_ads_${body.event_name.toLowerCase()}_conversion_action_id`;
  const { data: eventSetting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", eventKey)
    .maybeSingle();
  const conversionActionId =
    body.conversion_action_id ||
    (eventSetting?.value ? String(eventSetting.value).replace(/"/g, "") : null) ||
    (map.get("google_ads_subscribe_conversion_action_id")
      ? String(map.get("google_ads_subscribe_conversion_action_id")).replace(/"/g, "")
      : null) ||
    (map.get("kennel_oci_conversion_action_id")
      ? String(map.get("kennel_oci_conversion_action_id")).replace(/"/g, "")
      : null);
  if (!conversionActionId) {
    return j({ skipped: true, reason: "no_conversion_action_id_configured" });
  }

  const gclid = extractGclid(body);
  const userIdentifiers: any[] = [];
  const emH = await sha256Hex(body.email);
  if (emH) userIdentifiers.push({ hashedEmail: emH, userIdentifierSource: "FIRST_PARTY" });
  const phH = await sha256Hex((body.phone ?? "").replace(/\D/g, "") || null);
  if (phH) userIdentifiers.push({ hashedPhoneNumber: phH, userIdentifierSource: "FIRST_PARTY" });

  if (!gclid && userIdentifiers.length === 0) {
    // Log a "skipped" row so the team can see it in the OCI log.
    await admin.from("oci_upload_log").insert({
      conversion_action_id: conversionActionId,
      order_id: body.event_id,
      gclid: null,
      conversion_value: body.value,
      currency: body.currency || "USD",
      status: "skipped_no_identifier",
      error_message: `event=${body.event_name} no gclid/email/phone`,
    }).then(() => {}, () => {});
    return j({ skipped: true, reason: "no_gclid_or_user_identifier" });
  }

  const auth = await getGoogleAdsAccessToken();
  if (isAuthError(auth)) return j({ error: "google_oauth_failed", details: auth }, 502);
  const { accessToken, config } = auth;
  const headers = buildGoogleAdsHeaders(accessToken, config);

  const resourcePrefix = `customers/${config.customerId}`;
  const conversionAction = `${resourcePrefix}/conversionActions/${conversionActionId}`;

  const cdt = body.conversion_date_time ||
    (() => {
      const d = new Date();
      // yyyy-mm-dd hh:mm:ss-05:00
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`;
    })();

  const conversion: Record<string, unknown> = {
    conversionAction,
    conversionDateTime: cdt,
    conversionValue: body.value,
    currencyCode: body.currency || "USD",
    orderId: body.event_id,
  };
  if (gclid) conversion.gclid = gclid;
  if (userIdentifiers.length) conversion.userIdentifiers = userIdentifiers;

  const url = `https://googleads.googleapis.com/v20/${resourcePrefix}:uploadClickConversions`;
  const adsRes = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ conversions: [conversion], partialFailure: true, validateOnly: false }),
  });
  const adsJson: any = await adsRes.json().catch(() => ({}));

  const partial = adsJson?.partialFailureError;
  const failed = !adsRes.ok || !!partial;

  await admin.from("oci_upload_log").insert({
    conversion_action_id: conversionActionId,
    order_id: body.event_id,
    gclid: gclid || null,
    conversion_value: body.value,
    currency: body.currency || "USD",
    status: failed ? (adsRes.ok ? "partial_failure" : "error") : "uploaded",
    error_message: failed ? JSON.stringify(partial ?? adsJson).slice(0, 1000) : null,
    raw_response: failed ? (partial ?? adsJson) : null,
  }).then(() => {}, () => {});

  if (!adsRes.ok) return j({ error: "google_ads_api_error", status: adsRes.status, details: adsJson }, 502);
  return j({ ok: true, uploaded: !failed, event_name: body.event_name, event_id: body.event_id });
});