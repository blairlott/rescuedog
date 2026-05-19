// Receives webhook events from Vinoshipper and updates our Supabase tables.
// Register this URL with Vinoshipper via vsRegisterWebhook once deployed.
//
// Public endpoint (verify_jwt = false in supabase/config.toml).
// We verify the call by checking a shared secret header (VINOSHIPPER_WEBHOOK_SECRET).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { vsFetch, type VsWebhookPayload } from "../_shared/vinoshipper.ts";
import { forwardPurchaseConversion } from "../_shared/serverConversions.ts";

// Launch cutoff: any Vinoshipper customer created before this date is treated
// as legacy and never enters the new-site welcome series.
const LAUNCH_CUTOFF_ISO = "2026-07-01T00:00:00Z";

/**
 * Best-effort: fetch a Vinoshipper customer detail record and enqueue the
 * welcome series + upsert a lead. Silently no-ops on any error so the
 * webhook handler never fails because of an enrichment problem.
 */
async function enqueueWelcomeForVsCustomer(
  supabase: ReturnType<typeof createClient>,
  vsCustomerId: string | number,
  fallback: { email?: string | null; firstName?: string | null; lastName?: string | null; createdAt?: string | null } = {},
): Promise<string> {
  try {
    let email = fallback.email ?? null;
    let firstName = fallback.firstName ?? null;
    let lastName = fallback.lastName ?? null;
    let createdAt = fallback.createdAt ?? null;

    // Try to enrich from VS API. If unavailable, fall back to whatever the
    // webhook payload gave us.
    try {
      const cust = await vsFetch<Record<string, any>>(`/customers/${vsCustomerId}`);
      email = email ?? cust?.email ?? cust?.emailAddress ?? null;
      firstName = firstName ?? cust?.firstName ?? cust?.first_name ?? null;
      lastName = lastName ?? cust?.lastName ?? cust?.last_name ?? null;
      createdAt = createdAt ?? cust?.createdAt ?? cust?.created_at ?? cust?.dateCreated ?? null;
    } catch (e) {
      console.warn(`[welcome-enqueue] vs customer fetch failed for ${vsCustomerId}: ${String(e)}`);
    }

    if (!email) return "welcome skipped: no email";

    // Legacy guard
    if (createdAt && new Date(createdAt).getTime() < new Date(LAUNCH_CUTOFF_ISO).getTime()) {
      return "welcome skipped: legacy customer (pre-launch)";
    }

    // If they already have a site account, prefer that user_id linkage.
    let userId: string | null = null;
    const { data: linked } = await supabase
      .from("customer_profiles")
      .select("id")
      .eq("vinoshipper_customer_id", String(vsCustomerId))
      .maybeSingle();
    if (linked?.id) userId = linked.id;

    // Upsert lead row (idempotent on lower(email)).
    await supabase.from("leads").upsert(
      {
        email,
        first_name: firstName,
        last_name: lastName,
        source: "vinoshipper_webhook",
        vinoshipper_customer_id: String(vsCustomerId),
        vinoshipper_created_at: createdAt,
        welcome_series_started_at: new Date().toISOString(),
        status: userId ? "converted" : "new",
      },
      { onConflict: "email", ignoreDuplicates: false },
    );

    // Enqueue series. enqueue_welcome_series handles dedupe + legacy cutoff.
    const { error: rpcErr } = await supabase.rpc("enqueue_welcome_series", {
      _user_id: userId,
      _email: email,
      _vinoshipper_created_at: createdAt,
    });
    if (rpcErr) return `welcome enqueue rpc err: ${rpcErr.message}`;
    return userId ? "welcome enqueued (linked user)" : "welcome enqueued (lead)";
  } catch (e) {
    console.error("[welcome-enqueue] exception", e);
    return `welcome error: ${String(e)}`;
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-vinoshipper-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const debugMode = url.searchParams.get("debug") === "1";
  const metaTestCode = url.searchParams.get("meta_test_code");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let logId: string | null = null;
  let rawBody = "";

  try {
    // MANDATORY shared-secret check. If the secret env var is not configured,
    // we refuse all webhook traffic — never silently fall through.
    const expected = Deno.env.get("VINOSHIPPER_WEBHOOK_SECRET");
    if (!expected) {
      console.error("[vinoshipper-webhook] VINOSHIPPER_WEBHOOK_SECRET not configured — refusing all traffic");
      return new Response(JSON.stringify({ error: "webhook secret not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Accept secret via header OR ?token= query param (Vinoshipper's webhook
    // config UI only allows URL + type, no custom headers).
    const got =
      req.headers.get("x-vinoshipper-secret") ??
      url.searchParams.get("token") ??
      url.searchParams.get("secret");
    if (got !== expected) {
      await supabase.from("vinoshipper_webhook_logs").insert({
        subject: "UNKNOWN",
        event: "UNAUTHORIZED",
        identifier: "n/a",
        payload: {},
        processed: false,
        error: "shared-secret mismatch or missing",
      });
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        // Welcome series backup trigger: covers guest-checkout customers who
        // never created a site account. enqueue_welcome_series is idempotent
        // (per-email dedupe) so repeat orders won't re-trigger.
        try {
          const p = payload as unknown as Record<string, any>;
          const vsCustomerId =
            p?.customerId ?? p?.customer_id ?? p?.data?.customerId ?? null;
          if (vsCustomerId) {
            const note = await enqueueWelcomeForVsCustomer(supabase, vsCustomerId, {
              email: p?.email ?? null,
              firstName: p?.firstName ?? p?.first_name ?? null,
              lastName: p?.lastName ?? p?.last_name ?? null,
              createdAt: p?.customerCreatedAt ?? null,
            });
            notes += ` | ${note}`;
          }
        } catch (e) {
          console.error("[welcome-from-order] exception", e);
        }
        // Best-effort loyalty accrual: if the payload includes a linkable
        // customer + a subtotal, award 1 point per $1. Idempotent on order_id.
        try {
          const p = payload as unknown as Record<string, any>;
          const vsCustomerId =
            p?.customerId ?? p?.customer_id ?? p?.data?.customerId ?? null;
          const subtotalCents =
            typeof p?.subtotalCents === "number" ? p.subtotalCents
            : typeof p?.subtotal_cents === "number" ? p.subtotal_cents
            : typeof p?.subtotal === "number" ? Math.round(p.subtotal * 100)
            : typeof p?.amount === "number" ? Math.round(p.amount * 100)
            : null;
          if (vsCustomerId && subtotalCents && subtotalCents > 0) {
            const { data: profile } = await supabase
              .from("customer_profiles")
              .select("id, email, phone")
              .eq("vinoshipper_customer_id", String(vsCustomerId))
              .maybeSingle();
            if (profile?.id) {
              // Idempotency: skip if we already awarded for this VS order.
              const { data: existing } = await supabase
                .from("loyalty_ledger")
                .select("id")
                .eq("user_id", profile.id)
                .eq("event_type", "earn_order")
                .contains("metadata", { vinoshipper_order_id: payload.identifier })
                .maybeSingle();
              if (existing) {
                notes += " | loyalty skipped: already awarded";
                break;
              }
              const { error: rpcErr } = await supabase.rpc("award_loyalty_points", {
                _user_id: profile.id,
                _delta_points: Math.floor(subtotalCents / 100),
                _event_type: "earn_order",
                _reason: `Wine order ${payload.identifier}`,
                _order_id: null,
                _subtotal_cents: subtotalCents,
                _metadata: { vinoshipper_order_id: payload.identifier },
              });
              if (rpcErr) {
                console.error("[loyalty-accrual] failed", rpcErr);
                notes += " | loyalty award failed: " + rpcErr.message;
              } else {
                notes += " | loyalty awarded";
              }
            } else {
              notes += " | loyalty skipped: no linked customer";
            }
          } else {
            notes += " | loyalty skipped: payload missing customer/amount";
          }
        } catch (e) {
          console.error("[loyalty-accrual] exception", e);
          notes += " | loyalty error: " + String(e);
        }

        // Server-side conversion forwarding (GA4 Measurement Protocol + Meta CAPI).
        // Inert until GA4_*/META_* secrets are configured.
        try {
          const p = payload as unknown as Record<string, any>;
          const vsCustomerId =
            p?.customerId ?? p?.customer_id ?? p?.data?.customerId ?? null;
          const subtotalCents =
            typeof p?.subtotalCents === "number" ? p.subtotalCents
            : typeof p?.subtotal_cents === "number" ? p.subtotal_cents
            : typeof p?.subtotal === "number" ? Math.round(p.subtotal * 100)
            : typeof p?.amount === "number" ? Math.round(p.amount * 100)
            : null;
          if (subtotalCents && subtotalCents > 0) {
            let prof: any = null;
            if (vsCustomerId) {
              const { data } = await supabase
                .from("customer_profiles")
                .select("email, phone")
                .eq("vinoshipper_customer_id", String(vsCustomerId))
                .maybeSingle();
              prof = data;
            }
            const result = await forwardPurchaseConversion({
              orderId: payload.identifier,
              valueCents: subtotalCents,
              currency: (p?.currency as string) || "USD",
              email: prof?.email ?? p?.email ?? null,
              phone: prof?.phone ?? p?.phone ?? null,
              firstName: p?.firstName ?? p?.first_name ?? null,
              lastName: p?.lastName ?? p?.last_name ?? null,
              city: p?.city ?? p?.shippingCity ?? null,
              state: p?.state ?? p?.shippingState ?? null,
              zip: p?.zip ?? p?.shippingZip ?? null,
              country: p?.country ?? "US",
              fbc: null,
              fbp: null,
              gclid: null,
              debug: debugMode,
              metaTestEventCode: metaTestCode,
            });
            notes += ` | conv ga4=${result.ga4.skipped ? "skip" : result.ga4.ok ? "ok" : "err"} meta=${result.meta.skipped ? "skip" : result.meta.ok ? "ok" : "err"}`;
            if (debugMode) notes += ` | DEBUG`;
            if (result.ga4.error) console.error("[conv-ga4]", result.ga4.error);
            if (result.meta.error) console.error("[conv-meta]", result.meta.error);
            if (debugMode) {
              return new Response(JSON.stringify({
                ok: true,
                debug: true,
                ga4: result.ga4,
                meta: result.meta,
                notes,
              }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }
        } catch (e) {
          console.error("[server-conversions] exception", e);
          notes += " | conv error: " + String(e);
        }
        // Fork non-wine line items to dropship partners (Printful, etc.).
        // Fire-and-forget: never block the webhook ack on partner dispatch.
        try {
          const { error: bridgeErr } = await supabase.functions.invoke("vs-dropship-bridge", {
            body: {
              identifier: payload.identifier,
              subject: payload.subject,
              event: payload.event,
            },
          });
          if (bridgeErr) {
            console.error("[vs-dropship-bridge] invoke err", bridgeErr);
            notes += " | bridge err: " + String(bridgeErr.message ?? bridgeErr);
          } else {
            notes += " | bridge invoked";
          }
        } catch (e) {
          console.error("[vs-dropship-bridge] exception", e);
          notes += " | bridge exception: " + String(e);
        }
        break;
      case "CLUB_MEMBERSHIP":
        // TODO: GET /club-memberships/{id}, then update wine_club_memberships
        // (status, next_shipment_date, payment_status) where vinoshipper_membership_id matches.
        notes = "CLUB_MEMBERSHIP event received; member identification + discount sync pending";
        break;
      case "CUSTOMER":
        // Primary welcome-series trigger for guest-checkout customers.
        notes = "CUSTOMER event received";
        try {
          const p = payload as unknown as Record<string, any>;
          const vsCustomerId = payload.identifier ?? p?.customerId ?? p?.id ?? null;
          if (vsCustomerId) {
            const note = await enqueueWelcomeForVsCustomer(supabase, vsCustomerId, {
              email: p?.email ?? null,
              firstName: p?.firstName ?? p?.first_name ?? null,
              lastName: p?.lastName ?? p?.last_name ?? null,
              createdAt: p?.createdAt ?? p?.created_at ?? null,
            });
            notes += ` | ${note}`;
          }
        } catch (e) {
          console.error("[welcome-from-customer] exception", e);
          notes += ` | welcome error: ${String(e)}`;
        }
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