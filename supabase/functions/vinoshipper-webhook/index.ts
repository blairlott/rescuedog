// Receives webhook events from Vinoshipper and updates our Supabase tables.
// Register this URL with Vinoshipper via vsRegisterWebhook once deployed.
//
// Public endpoint (verify_jwt = false in supabase/config.toml).
// We verify the call by checking a shared secret header (VINOSHIPPER_WEBHOOK_SECRET).

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { VsWebhookPayload } from "../_shared/vinoshipper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-vinoshipper-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let logId: string | null = null;
  let rawBody = "";

  try {
    // Optional: shared-secret check. Vinoshipper lets you set a custom header
    // when registering a webhook; we mirror that here.
    const expected = Deno.env.get("VINOSHIPPER_WEBHOOK_SECRET");
    if (expected) {
      const got = req.headers.get("x-vinoshipper-secret");
      if (got !== expected) {
        await supabase.from("vinoshipper_webhook_logs").insert({
          subject: "UNKNOWN",
          event: "UNAUTHORIZED",
          identifier: "n/a",
          payload: {},
          processed: false,
          error: "shared-secret mismatch",
        });
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    rawBody = await req.text();
    let payload: VsWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as VsWebhookPayload;
    } catch (e) {
      await supabase.from("vinoshipper_webhook_logs").insert({
        subject: "UNKNOWN",
        event: "PARSE_ERROR",
        identifier: "n/a",
        payload: { raw: rawBody },
        processed: false,
        error: String(e),
      });
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!payload?.identifier || !payload?.subject || !payload?.event) {
      await supabase.from("vinoshipper_webhook_logs").insert({
        subject: payload?.subject ?? "UNKNOWN",
        event: payload?.event ?? "INVALID",
        identifier: payload?.identifier ?? "n/a",
        payload: payload as unknown as Record<string, unknown>,
        processed: false,
        error: "missing required fields",
      });
      return new Response(JSON.stringify({ error: "invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Capture select headers (avoid logging the shared secret).
    const headers: Record<string, string> = {};
    for (const [k, v] of req.headers.entries()) {
      if (k.toLowerCase() === "x-vinoshipper-secret" || k.toLowerCase() === "authorization") continue;
      headers[k] = v;
    }

    const { data: logRow, error: logErr } = await supabase
      .from("vinoshipper_webhook_logs")
      .insert({
        subject: payload.subject,
        event: payload.event,
        identifier: payload.identifier,
        payload: payload as unknown as Record<string, unknown>,
        headers,
        processed: false,
      })
      .select("id")
      .single();
    if (logErr) {
      console.error("failed to insert webhook log", logErr);
    } else {
      logId = logRow?.id ?? null;
    }

    console.log(
      `[vinoshipper-webhook] ${payload.subject}/${payload.event} id=${payload.identifier} logId=${logId}`,
    );

    // Route by subject. Detail-fetching from Vinoshipper happens here once we
    // confirm the exact GET endpoints from their docs.
    let notes = "";
    switch (payload.subject) {
      case "ORDER":
        // TODO: GET /orders/{id} from Vinoshipper, then update wine_club_shipments
        // (status, tracking_number, total_cents, etc.) where vinoshipper_order_id matches.
        notes = "ORDER event received; detail fetch pending Vinoshipper API key";
        break;
      case "CLUB_MEMBERSHIP":
        // TODO: GET /club-memberships/{id}, then update wine_club_memberships
        // (status, next_shipment_date, payment_status) where vinoshipper_membership_id matches.
        notes = "CLUB_MEMBERSHIP event received; member identification + discount sync pending";
        break;
      case "CUSTOMER":
        // TODO: GET /customers/{id} if we need to mirror profile changes.
        notes = "CUSTOMER event received; profile mirror pending";
        break;
    }

    if (logId) {
      await supabase
        .from("vinoshipper_webhook_logs")
        .update({ processed: true, notes })
        .eq("id", logId);
    }

    // Always 200 quickly so Vinoshipper doesn't retry.
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("vinoshipper-webhook error", err);
    try {
      if (logId) {
        await supabase
          .from("vinoshipper_webhook_logs")
          .update({ processed: false, error: String(err) })
          .eq("id", logId);
      } else {
        await supabase.from("vinoshipper_webhook_logs").insert({
          subject: "UNKNOWN",
          event: "HANDLER_ERROR",
          identifier: "n/a",
          payload: { raw: rawBody },
          processed: false,
          error: String(err),
        });
      }
    } catch (logErr) {
      console.error("failed to log webhook error", logErr);
    }
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});