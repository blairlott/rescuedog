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

  try {
    // Optional: shared-secret check. Vinoshipper lets you set a custom header
    // when registering a webhook; we mirror that here.
    const expected = Deno.env.get("VINOSHIPPER_WEBHOOK_SECRET");
    if (expected) {
      const got = req.headers.get("x-vinoshipper-secret");
      if (got !== expected) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const payload = (await req.json()) as VsWebhookPayload;
    if (!payload?.identifier || !payload?.subject || !payload?.event) {
      return new Response(JSON.stringify({ error: "invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Route by subject. Detail-fetching from Vinoshipper happens here once we
    // confirm the exact GET endpoints from their docs.
    switch (payload.subject) {
      case "ORDER":
        // TODO: GET /orders/{id} from Vinoshipper, then update wine_club_shipments
        // (status, tracking_number, total_cents, etc.) where vinoshipper_order_id matches.
        console.log("ORDER event", payload);
        break;
      case "CLUB_MEMBERSHIP":
        // TODO: GET /club-memberships/{id}, then update wine_club_memberships
        // (status, next_shipment_date, payment_status) where vinoshipper_membership_id matches.
        console.log("CLUB_MEMBERSHIP event", payload);
        break;
      case "CUSTOMER":
        // TODO: GET /customers/{id} if we need to mirror profile changes.
        console.log("CUSTOMER event", payload);
        break;
    }

    // Always 200 quickly so Vinoshipper doesn't retry.
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("vinoshipper-webhook error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});