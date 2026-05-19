// Backfill real Vinoshipper sales → Meta CAPI + Google Ads OCI.
//
// Triggered from the Kennel CAPI page. Pulls vs_transactions (CONSUMER,
// non-cancelled) for a date range and forwards each order to:
//   - Meta CAPI via meta-capi-sender (which SHA-256 hex-hashes PII the way
//     Meta requires and dedupes on event_id = order_id)
//   - Google Ads :uploadClickConversions with userIdentifiers (hashedEmail
//     + hashedPhoneNumber), deduped against oci_upload_log.order_id
//
// Both sinks are independently controlled via app_settings:
//   kennel_capi_enabled            (bool)
//   kennel_oci_enabled             (bool, default true)
//   kennel_oci_conversion_action_id(string — required for Google)

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getGoogleAdsAccessToken,
  buildGoogleAdsHeaders,
  isAuthError,
} from "../_shared/googleAdsAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string | null | undefined): Promise<string | null> {
  if (!input) return null;
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: ad-ops user JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "unauthorized" }, 401);
  const { data: roleOk } = await admin.rpc("is_ad_ops", { _user_id: uid });
  if (!roleOk) return json({ error: "forbidden" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const sinceIso: string = body.since_iso ??
    new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const limit: number = Math.min(Math.max(Number(body.limit) || 500, 1), 2000);
  const dryRun: boolean = body.dry_run === true;
  const sendMeta: boolean = body.send_meta !== false;
  const sendGoogle: boolean = body.send_google !== false;
  // Optional: caller-supplied orders (CSV/XLSX upload path). When present we
  // skip the vs_transactions query and treat these as the source rows.
  const uploadedOrders: any[] | null = Array.isArray(body.orders) ? body.orders : null;

  // Settings
  const { data: settings } = await admin
    .from("app_settings")
    .select("key,value")
    .in("key", ["kennel_capi_enabled", "kennel_oci_enabled", "kennel_oci_conversion_action_id"]);
  const smap = Object.fromEntries((settings ?? []).map((s: any) => [s.key, s.value]));
  const capiOn = smap.kennel_capi_enabled === true || smap.kennel_capi_enabled === "true";
  const ociOn = smap.kennel_oci_enabled === true || smap.kennel_oci_enabled === "true";
  const conversionActionId = String(smap.kennel_oci_conversion_action_id ?? "").trim();

  // Pull orders: either supplied directly (file upload) or queried.
  let rows: any[] = [];
  if (uploadedOrders) {
    const today = new Date().toISOString().slice(0, 10);
    rows = uploadedOrders.slice(0, limit).map((r: any, i: number) => ({
      invoice: String(r.order_id ?? r.invoice ?? `upload-${Date.now()}-${i}`),
      transaction_date: r.transaction_date ?? r.date ?? today,
      order_total: Number(r.order_total ?? r.value ?? 0),
      customer_email: r.customer_email ?? r.email ?? null,
      customer_phone: r.customer_phone ?? r.phone ?? null,
      customer_first_name: r.customer_first_name ?? r.first_name ?? null,
      customer_last_name: r.customer_last_name ?? r.last_name ?? null,
      ship_to_city: r.ship_to_city ?? r.city ?? null,
      ship_to_state: r.ship_to_state ?? r.state ?? null,
      ship_to_zip: r.ship_to_zip ?? r.zip ?? null,
    })).filter((r: any) => r.order_total > 0);
  } else {
    const { data: orders, error: ordErr } = await admin
      .from("vs_transactions")
      .select("invoice,transaction_date,order_total,customer_email,customer_phone,customer_first_name,customer_last_name,ship_to_city,ship_to_state,ship_to_zip")
      .gte("transaction_date", sinceIso)
      .eq("order_type", "CONSUMER")
      .neq("chain_status", "Cancelled")
      .gt("order_total", 0)
      .order("transaction_date", { ascending: false })
      .limit(limit);
    if (ordErr) return json({ error: ordErr.message }, 500);
    rows = orders ?? [];
  }

  // --- Meta dedup ---
  const invoices = rows.map((r: any) => String(r.invoice));
  let metaSent = new Set<string>();
  let ociSent = new Set<string>();
  if (invoices.length) {
    const [{ data: metaExisting }, { data: ociExisting }] = await Promise.all([
      admin.from("meta_capi_events").select("order_id")
        .in("order_id", invoices).eq("test_mode", false).eq("success", true),
      admin.from("oci_upload_log").select("order_id")
        .in("order_id", invoices).in("status", ["uploaded", "partial_failure"]),
    ]);
    metaSent = new Set((metaExisting ?? []).map((r: any) => String(r.order_id)));
    ociSent = new Set((ociExisting ?? []).map((r: any) => String(r.order_id)).filter(Boolean));
  }

  // --- META: fan out to meta-capi-sender in one batch ---
  let metaResult: any = { skipped: true };
  if (sendMeta && capiOn) {
    const metaBatch = rows
      .filter((r: any) => !metaSent.has(String(r.invoice)))
      .map((r: any) => ({
        order_id: String(r.invoice),
        value_cents: Math.round(Number(r.order_total) * 100),
        currency: "USD",
        email: r.customer_email,
        phone: r.customer_phone,
        first_name: r.customer_first_name,
        last_name: r.customer_last_name,
        city: r.ship_to_city,
        state: r.ship_to_state,
        zip: r.ship_to_zip,
        country: "US",
      }));
    if (metaBatch.length && !dryRun) {
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-capi-sender`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-kennel-ingest-secret": Deno.env.get("KENNEL_INGEST_SECRET") ?? "",
        },
        body: JSON.stringify({ orders: metaBatch }),
      });
      metaResult = { status: r.status, body: await r.json().catch(() => ({})), attempted: metaBatch.length };
    } else {
      metaResult = { attempted: metaBatch.length, dry_run: dryRun };
    }
  } else {
    metaResult = { skipped: true, reason: !capiOn ? "kennel_capi_enabled=false" : "send_meta=false" };
  }

  // --- GOOGLE OCI: hashed user_identifiers, no gclid required ---
  let googleResult: any = { skipped: true };
  if (sendGoogle && ociOn && conversionActionId) {
    const candidates = rows.filter((r: any) =>
      !ociSent.has(String(r.invoice)) &&
      (r.customer_email || r.customer_phone)
    );
    if (candidates.length === 0) {
      googleResult = { attempted: 0, note: "nothing to send" };
    } else {
      const auth = await getGoogleAdsAccessToken();
      if (isAuthError(auth)) {
        googleResult = { error: "google_oauth_failed", details: auth };
      } else {
        const { accessToken, config } = auth;
        const headers = buildGoogleAdsHeaders(accessToken, config);
        const resourcePrefix = `customers/${config.customerId}`;
        const conversionAction = `${resourcePrefix}/conversionActions/${conversionActionId}`;

        const conversions = await Promise.all(candidates.map(async (r: any) => {
          const userIdentifiers: any[] = [];
          const emH = await sha256Hex(r.customer_email);
          if (emH) userIdentifiers.push({ hashedEmail: emH, userIdentifierSource: "FIRST_PARTY" });
          const phH = await sha256Hex(String(r.customer_phone ?? "").replace(/\D/g, "") || null);
          if (phH) userIdentifiers.push({ hashedPhoneNumber: phH, userIdentifierSource: "FIRST_PARTY" });
          // Google requires a date-time string with timezone. transaction_date is YYYY-MM-DD.
          const cdt = `${r.transaction_date} 12:00:00-05:00`;
          return {
            conversionAction,
            conversionDateTime: cdt,
            conversionValue: Number(r.order_total),
            currencyCode: "USD",
            orderId: String(r.invoice),
            userIdentifiers,
          };
        }));

        if (dryRun) {
          googleResult = { attempted: conversions.length, dry_run: true };
        } else {
          const url = `https://googleads.googleapis.com/v20/${resourcePrefix}:uploadClickConversions`;
          const adsRes = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ conversions, partialFailure: true, validateOnly: false }),
          });
          const adsJson: any = await adsRes.json().catch(() => ({}));

          // Per-row partial-failure parse
          const partial = adsJson?.partialFailureError;
          const failureIdx = new Set<number>();
          const rowErrors: Record<number, unknown> = {};
          if (partial?.details && Array.isArray(partial.details)) {
            for (const d of partial.details) {
              for (const e of (d?.errors ?? [])) {
                const idx = e?.location?.fieldPathElements?.find((p: any) => p.fieldName === "conversions")?.index;
                if (typeof idx === "number") { failureIdx.add(idx); rowErrors[idx] = e; }
              }
            }
          }

          // Log per-row to oci_upload_log
          await admin.from("oci_upload_log").insert(
            candidates.map((r: any, i: number) => {
              const failed = !adsRes.ok || failureIdx.has(i);
              return {
                conversion_action_id: conversionActionId,
                order_id: String(r.invoice),
                gclid: null,
                conversion_value: Number(r.order_total),
                currency: "USD",
                status: failed ? (adsRes.ok ? "partial_failure" : "error") : "uploaded",
                error_message: failed ? JSON.stringify(rowErrors[i] ?? adsJson).slice(0, 1000) : null,
                raw_response: failed ? (rowErrors[i] ?? adsJson) : null,
              };
            }),
          );

          googleResult = {
            status: adsRes.status,
            attempted: conversions.length,
            uploaded: conversions.length - failureIdx.size,
            partial_failures: failureIdx.size,
            error: adsRes.ok ? null : adsJson,
          };
        }
      }
    }
  } else {
    googleResult = {
      skipped: true,
      reason: !ociOn ? "kennel_oci_enabled=false"
            : !conversionActionId ? "kennel_oci_conversion_action_id not set"
            : "send_google=false",
    };
  }

  return json({
    ok: true,
    since: sinceIso,
    orders_examined: rows.length,
    meta_already_sent: metaSent.size,
    google_already_sent: ociSent.size,
    meta: metaResult,
    google: googleResult,
    dry_run: dryRun,
  });
});