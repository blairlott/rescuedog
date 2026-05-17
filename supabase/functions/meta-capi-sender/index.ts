// Meta Conversions API sender — Ship 2
//
// Fires a server-side `Purchase` event for a Vinoshipper order and logs the
// attempt to `meta_capi_events`. Designed to be called by the Z3a poller
// (daily 1:30am ET) once per newly-detected order, or manually from the
// Kennel CAPI panel for backfills / test events.
//
// Key contracts:
//   - `event_id` = Vinoshipper `order_id` — Meta uses this to deduplicate
//     against the browser Pixel `Purchase` event. NEVER change this.
//   - `test_mode=true` forces a `test_event_code` so the event lands in
//     Meta Events Manager → Test Events only and does NOT corrupt prod
//     attribution. Lindy: ALWAYS run the first 3 orders this way.
//   - Kill switch: `app_settings.kennel_capi_enabled = false` short-circuits
//     to a no-op (logged with success=false, error='disabled').
//   - Unique index on (order_id) WHERE test_mode=false AND success=true
//     prevents accidental duplicate live fires for the same order.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { forwardPurchaseConversion } from "../_shared/serverConversions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kennel-ingest-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface OrderInput {
  order_id: string;
  value_cents: number;
  currency?: string;
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  client_ip?: string | null;
  user_agent?: string | null;
}

interface SendRequest {
  // Batch mode (Z3a will use this)
  orders?: OrderInput[];
  // Single mode
  order?: OrderInput;
  // When true → routes to Meta Test Events only
  test_mode?: boolean;
  test_event_code?: string;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: either a logged-in ad-ops user (preview-session JWT) OR the Z3a shared secret.
  const ingestSecret = req.headers.get("x-kennel-ingest-secret");
  const expectedSecret = Deno.env.get("KENNEL_INGEST_SECRET");
  const ingestOk = !!expectedSecret && ingestSecret === expectedSecret;

  if (!ingestOk) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData } = await supabase.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleOk } = await supabase.rpc("is_ad_ops", { _user_id: uid });
    if (!roleOk) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const body = (await req.json()) as SendRequest;
    const orders = body.orders ?? (body.order ? [body.order] : []);
    if (orders.length === 0) {
      return new Response(JSON.stringify({ error: "orders[] or order required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Kill switch — but allow test_mode even when disabled (for verification).
    const { data: flagRow } = await supabase
      .from("app_settings").select("value").eq("key", "kennel_capi_enabled").maybeSingle();
    const enabled = flagRow?.value === true || flagRow?.value === "true";
    if (!enabled && !body.test_mode) {
      // Log a skip for each order so Kennel UI shows why nothing fired.
      const rows = orders.map((o) => ({
        order_id: o.order_id, event_id: o.order_id, value_cents: o.value_cents,
        currency: o.currency ?? "USD", test_mode: false, success: false,
        error: "kennel_capi_enabled=false",
      }));
      await supabase.from("meta_capi_events").insert(rows);
      return new Response(JSON.stringify({ ok: false, disabled: true, skipped: orders.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<Record<string, unknown>> = [];
    for (const o of orders) {
      // Live dedup: if a successful live send already exists for this order, skip.
      if (!body.test_mode) {
        const { data: existing } = await supabase
          .from("meta_capi_events")
          .select("id")
          .eq("order_id", o.order_id)
          .eq("test_mode", false)
          .eq("success", true)
          .maybeSingle();
        if (existing) {
          results.push({ order_id: o.order_id, skipped: "already_sent" });
          continue;
        }
      }

      const res = await forwardPurchaseConversion({
        orderId: o.order_id,
        valueCents: o.value_cents,
        currency: o.currency ?? "USD",
        email: o.email, phone: o.phone,
        firstName: o.first_name, lastName: o.last_name,
        city: o.city, state: o.state, zip: o.zip, country: o.country,
        fbc: o.fbc, fbp: o.fbp,
        clientIp: o.client_ip, userAgent: o.user_agent,
        debug: !!body.test_mode,
        metaTestEventCode: body.test_event_code ?? null,
      });

      const meta = res.meta;
      const success = meta.ok === true && !meta.skipped;
      const emailHash = o.email ? await sha256Hex(o.email) : null;

      const { error: logErr } = await supabase.from("meta_capi_events").insert({
        order_id: o.order_id,
        event_id: o.order_id,
        value_cents: o.value_cents,
        currency: o.currency ?? "USD",
        test_mode: !!body.test_mode,
        test_event_code: body.test_mode ? (body.test_event_code ?? null) : null,
        fbc: o.fbc ?? null,
        fbp: o.fbp ?? null,
        email_hash: emailHash,
        request_payload: { order_id: o.order_id, value_cents: o.value_cents },
        response_status: success ? 200 : null,
        response_body: meta.debug ?? null,
        success,
        error: meta.skipped ? "META_PIXEL_ID or META_CAPI_TOKEN not configured" : (meta.error ?? null),
      });
      if (logErr) console.error("meta_capi_events insert failed", logErr);

      results.push({
        order_id: o.order_id,
        success,
        skipped: meta.skipped ?? false,
        error: meta.error ?? null,
        debug: meta.debug ?? null,
      });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("meta-capi-sender error", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});