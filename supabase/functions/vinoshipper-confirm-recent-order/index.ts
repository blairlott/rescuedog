import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Client-callable confirmation endpoint.
 *
 * The customer is handed off to Vinoshipper's hosted cart in a new tab.
 * Our UI must NOT claim the wine order is placed until VS actually fires
 * an ORDER webhook event back to us (subject=ORDER, event=APPROVED or
 * CREATED). This function lets the client poll for that confirmation
 * by email + handoff timestamp without exposing the webhook log table
 * (which is RLS-restricted to wine_club_managers).
 *
 * Input: { email: string, since: ISO timestamp }
 * Output: { confirmed: boolean, identifier?: string, event?: string }
 */

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractEmailFromPayload(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates: Array<unknown> = [
    payload.email,
    payload.customerEmail,
    payload.customer_email,
    payload?.customer?.email,
    payload?.order?.customer?.email,
    payload?.order?.email,
    payload?.buyer?.email,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.includes("@")) return c.toLowerCase().trim();
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
    const since = typeof body?.since === "string" ? body.since : null;
    if (!email || !since) {
      return ok({ error: "email and since are required" }, 400);
    }
    const sinceDate = new Date(since);
    if (Number.isNaN(sinceDate.getTime())) {
      return ok({ error: "invalid since timestamp" }, 400);
    }

    // Pull recent ORDER webhook events. We over-fetch a bit and filter by
    // email in app code because the payload field name varies by VS event.
    const { data, error } = await supabase
      .from("vinoshipper_webhook_logs")
      .select("identifier, event, payload, received_at")
      .eq("subject", "ORDER")
      .in("event", ["APPROVED", "CREATED"])
      .gte("received_at", sinceDate.toISOString())
      .order("received_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[vs-confirm] query failed", error);
      return ok({ error: "lookup failed" }, 500);
    }

    for (const row of data ?? []) {
      const payloadEmail = extractEmailFromPayload(row.payload);
      if (payloadEmail && payloadEmail === email) {
        return ok({ confirmed: true, identifier: row.identifier, event: row.event });
      }
    }

    return ok({ confirmed: false });
  } catch (err) {
    console.error("[vs-confirm] crashed", err);
    return ok({ error: "internal error" }, 500);
  }
});