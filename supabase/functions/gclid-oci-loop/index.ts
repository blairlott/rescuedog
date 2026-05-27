// Joins ab_checkout_intents (gclid capture) → vs_transactions (real wine purchases)
// and uploads matched conversions to Google Ads via OCI.
//
// Trigger: pg_cron every 2 hours (and manual POST).
// Auth: verify_jwt = false (cron + admin manual call via service role / LINDY_PROXY_TOKEN).
//
// Matching rules:
//   - intent.email == vs_transactions.customer_email (lowercased)
//   - intent.created_at <= vs.transaction_date + 24h AND >= vs.transaction_date - 30d
//   - intent.gclid IS NOT NULL
//   - vs.transaction_type IN ('Sale','Order') and order_total > 0
//   - Dedup via oci_gclid_matches UNIQUE(invoice, gclid)

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getGoogleAdsAccessToken,
  buildGoogleAdsHeaders,
  isAuthError,
} from "../_shared/googleAdsAuth.ts";
import { checkSharedSecret } from "../_shared/cronAlert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fmtCdt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Accept either cron secret OR an authenticated admin/owner/ad_ops_manager JWT.
  const cronOk = await checkSharedSecret(req, {
    functionName: "gclid-oci-loop",
    envVar: "CRON_SECRET",
    headers: ["x-cron-secret"],
    alertOnFail: false,
  });
  if (!cronOk) {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roles, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin", "ad_ops_manager", "kennel_viewer", "executive"])
      .limit(1);
    if (roleErr || !roles?.length) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Lookback window: default 7 days, can be overridden by body
  let lookbackDays = 30;
  let dryRun = false;
  if (req.method === "POST") {
    try {
      const b = await req.json();
      if (typeof b?.lookback_days === "number") lookbackDays = Math.min(60, Math.max(1, b.lookback_days));
      if (typeof b?.dry_run === "boolean") dryRun = b.dry_run;
    } catch (_) {}
  }

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // 1. Pull recent VS sales
  const { data: txs, error: txErr } = await admin
    .from("vs_transactions")
    .select("invoice,customer_email,transaction_date,order_total,attribution_gross_product_value")
    .gte("transaction_date", since.slice(0, 10))
    .in("transaction_type", ["Sale", "Order", "SALE", "ORDER", "sale", "order"])
    .gt("order_total", 0)
    .not("customer_email", "is", null);
  if (txErr) return json({ error: "vs_query_failed", details: txErr.message }, 500);

  if (!txs || txs.length === 0) {
    return json({ ok: true, scanned: 0, matched: 0, uploaded: 0 });
  }

  // 2. Pull recent intents with gclid
  const emails = [...new Set(txs.map((t: any) => String(t.customer_email).toLowerCase().trim()).filter(Boolean))];
  const sinceIso = new Date(Date.now() - (lookbackDays + 30) * 24 * 60 * 60 * 1000).toISOString();

  const [intentsRes, cartsRes] = await Promise.all([
    admin
      .from("ab_checkout_intents")
      .select("id,email,gclid,created_at")
      .not("gclid", "is", null)
      .in("email", emails)
      .gte("created_at", sinceIso),
    admin
      .from("abandoned_carts")
      .select("id,email,gclid,last_activity_at,created_at")
      .not("gclid", "is", null)
      .in("email", emails)
      .gte("last_activity_at", sinceIso),
  ]);
  if (intentsRes.error) return json({ error: "intent_query_failed", details: intentsRes.error.message }, 500);
  if (cartsRes.error) return json({ error: "cart_query_failed", details: cartsRes.error.message }, 500);

  // Unwrap any stored `GCL.{seconds}.{gclid}` wrappers so we only emit raw click IDs.
  const unwrapGclid = (raw: string | null): string | null => {
    if (!raw) return null;
    if (raw.startsWith("GCL.")) {
      const parts = raw.split(".");
      return parts.length >= 3 ? parts.slice(2).join(".") : null;
    }
    return raw;
  };

  // Index intents + abandoned-cart fallbacks by email → most-recent first.
  // Intents take priority (explicit "about to check out" signal); carts back-fill.
  const byEmail = new Map<string, any[]>();
  for (const it of intentsRes.data || []) {
    const gclid = unwrapGclid(it.gclid);
    if (!gclid) continue;
    const k = String(it.email).toLowerCase().trim();
    if (!byEmail.has(k)) byEmail.set(k, []);
    byEmail.get(k)!.push({ id: it.id, email: it.email, gclid, created_at: it.created_at, source: "intent" });
  }
  for (const c of cartsRes.data || []) {
    const gclid = unwrapGclid(c.gclid);
    if (!gclid) continue;
    const k = String(c.email).toLowerCase().trim();
    if (!byEmail.has(k)) byEmail.set(k, []);
    byEmail.get(k)!.push({
      id: c.id,
      email: c.email,
      gclid,
      created_at: c.last_activity_at ?? c.created_at,
      source: "cart",
    });
  }
  for (const arr of byEmail.values()) arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  // 3. Build candidate matches
  type Match = {
    intent_id: string | null;
    invoice: string;
    email: string;
    gclid: string;
    conversion_value: number;
    transaction_date: string;
    source: "intent" | "cart";
  };
  const matches: Match[] = [];
  for (const t of txs) {
    const email = String(t.customer_email).toLowerCase().trim();
    const candidates = byEmail.get(email);
    if (!candidates?.length) continue;
    const txDate = new Date(t.transaction_date);
    // pick intent created at most 24h after, or within prior 60d
    const winnerIntent = candidates.find((i) => {
      const ts = new Date(i.created_at);
      return ts <= new Date(txDate.getTime() + 24 * 3600 * 1000)
        && ts >= new Date(txDate.getTime() - 60 * 24 * 3600 * 1000);
    });
    if (!winnerIntent) continue;
    matches.push({
      // intent_id has a FK to ab_checkout_intents — only set when source is intent.
      intent_id: winnerIntent.source === "intent" ? winnerIntent.id : null,
      invoice: t.invoice,
      email,
      gclid: winnerIntent.gclid,
      conversion_value: Number(t.attribution_gross_product_value ?? t.order_total) || 0,
      transaction_date: t.transaction_date,
      source: winnerIntent.source,
    });
  }

  if (matches.length === 0) {
    return json({ ok: true, scanned: txs.length, matched: 0, uploaded: 0 });
  }

  // 4. Skip already-uploaded (invoice+gclid)
  const { data: existing } = await admin
    .from("oci_gclid_matches")
    .select("invoice,gclid,status")
    .in("invoice", matches.map((m) => m.invoice));
  const seen = new Set((existing || []).map((r: any) => `${r.invoice}::${r.gclid}`));
  const fresh = matches.filter((m) => !seen.has(`${m.invoice}::${m.gclid}`));

  if (fresh.length === 0) {
    return json({ ok: true, scanned: txs.length, matched: matches.length, uploaded: 0, note: "all_already_uploaded" });
  }

  // 5. Resolve conversion action
  const { data: settings } = await admin
    .from("app_settings")
    .select("key,value")
    .in("key", [
      "google_ads_purchase_conversion_action_id",
      "kennel_oci_conversion_action_id",
      "kennel_oci_enabled",
    ]);
  const map = new Map((settings || []).map((s: any) => [s.key, s.value]));
  if (String(map.get("kennel_oci_enabled") ?? "true") === "false") {
    return json({ ok: true, skipped: true, reason: "kennel_oci_enabled=false" });
  }
  const actionId =
    (map.get("google_ads_purchase_conversion_action_id")
      ? String(map.get("google_ads_purchase_conversion_action_id")).replace(/"/g, "")
      : null) ||
    (map.get("kennel_oci_conversion_action_id")
      ? String(map.get("kennel_oci_conversion_action_id")).replace(/"/g, "")
      : null);
  if (!actionId) return json({ ok: false, error: "no_purchase_conversion_action_configured" }, 400);

  if (dryRun) {
    return json({ ok: true, dry_run: true, scanned: txs.length, matched: matches.length, would_upload: fresh.length, sample: fresh.slice(0, 3) });
  }

  // 6. Insert pending rows (dedup safety net)
  await admin.from("oci_gclid_matches").insert(
    fresh.map((m) => ({
      intent_id: m.intent_id,
      invoice: m.invoice,
      email: m.email,
      gclid: m.gclid,
      conversion_value: m.conversion_value,
      conversion_action_id: actionId,
      status: "pending",
    })),
  );

  // 7. Google Ads OAuth + upload
  const auth = await getGoogleAdsAccessToken();
  if (isAuthError(auth)) return json({ error: "google_oauth_failed", details: auth }, 502);
  const { accessToken, config } = auth;
  const headers = buildGoogleAdsHeaders(accessToken, config);
  const resourcePrefix = `customers/${config.customerId}`;
  const conversionAction = `${resourcePrefix}/conversionActions/${actionId}`;

  const conversions = fresh.map((m) => ({
    conversionAction,
    conversionDateTime: fmtCdt(new Date(m.transaction_date + "T12:00:00Z")),
    conversionValue: m.conversion_value,
    currencyCode: "USD",
    orderId: m.invoice,
    gclid: m.gclid,
  }));

  const url = `https://googleads.googleapis.com/v20/${resourcePrefix}:uploadClickConversions`;
  const adsRes = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ conversions, partialFailure: true, validateOnly: false }),
  });
  const adsJson: any = await adsRes.json().catch(() => ({}));

  const partial = adsJson?.partialFailureError;
  const failIdx = new Set<number>();
  const rowErrs: Record<number, unknown> = {};
  if (partial?.details && Array.isArray(partial.details)) {
    for (const d of partial.details) {
      for (const e of d?.errors || []) {
        const idx = e?.location?.fieldPathElements?.find((p: any) => p.fieldName === "conversions")?.index;
        if (typeof idx === "number") {
          failIdx.add(idx);
          rowErrs[idx] = e;
        }
      }
    }
  }

  // 8. Update per-row status
  await Promise.all(
    fresh.map(async (m, i) => {
      const failed = !adsRes.ok || failIdx.has(i);
      await admin
        .from("oci_gclid_matches")
        .update({
          status: failed ? "error" : "uploaded",
          error_message: failed
            ? (adsRes.ok ? JSON.stringify(rowErrs[i]).slice(0, 800) : `http ${adsRes.status}`)
            : null,
          uploaded_at: failed ? null : new Date().toISOString(),
        })
        .eq("invoice", m.invoice)
        .eq("gclid", m.gclid);
    }),
  );

  // Mirror into oci_upload_log so the existing Kennel OCI page shows these too
  await admin.from("oci_upload_log").insert(
    fresh.map((m, i) => {
      const failed = !adsRes.ok || failIdx.has(i);
      return {
        conversion_action_id: actionId,
        order_id: m.invoice,
        gclid: m.gclid,
        conversion_value: m.conversion_value,
        currency: "USD",
        status: failed ? (adsRes.ok ? "partial_failure" : "error") : "uploaded",
        error_message: failed ? JSON.stringify(rowErrs[i] ?? adsJson).slice(0, 1000) : null,
        raw_response: failed ? (rowErrs[i] ?? adsJson) : null,
      };
    }),
  ).then(() => {}, () => {});

  return json({
    ok: adsRes.ok,
    scanned: txs.length,
    matched: matches.length,
    uploaded: fresh.length - failIdx.size,
    failed: failIdx.size,
    google_status: adsRes.status,
  });
});