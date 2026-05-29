// Polls Vinoshipper REST API for new orders, mirrors them into vs_transactions,
// and fires server-side conversions for Meta/GA4 with LTV-weighted values.
//
// Why this exists: Vinoshipper has no outbound webhook. To keep ad platforms
// fed with real conversion signals (so Meta/Google can optimize correctly),
// we poll every 15 minutes. Z3a's daily poll into Google Sheets is unaffected —
// they dedup on order_id and write to different storage.
//
// LTV weighting (launch baseline, replace once vs_transactions has 30+ days of fresh data):
//   - Purchase event value = actual order_total (real money, real ROAS)
//   - Subscribe event (wine club signup) value = $400 USD = projected 12-month LTV
//
// Dedup: vs_transactions.invoice UNIQUE prevents duplicate rows. meta_capi_events
// unique index on (order_id) WHERE test_mode=false AND success=true prevents
// duplicate live Meta fires.
//
// Auth: shared secret KENNEL_INGEST_SECRET (header x-kennel-ingest-secret)
// OR admin JWT. pg_cron passes the secret.

import { createClient } from "npm:@supabase/supabase-js@2";
import { forwardPurchaseConversion } from "../_shared/serverConversions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kennel-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VS_BASE = "https://vinoshipper.com/api/v3/p";
const STATIC_CLUB_LTV_CENTS = 40000; // $400 — replace with real LTV once fresh data accumulates
const DEFAULT_MULTIPLIER = 1.0;

/** Look up multiplier table once per poll run; key by 2-letter upper state. */
async function loadStateMultipliers(admin: any): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const { data } = await admin.from("state_margin_tiers").select("state_code, multiplier");
    for (const r of data ?? []) {
      const code = String(r.state_code || "").toUpperCase();
      const m = Number(r.multiplier);
      if (code && Number.isFinite(m) && m > 0) map.set(code, m);
    }
  } catch (e) {
    console.error("[vs-poll] state_margin_tiers lookup failed", e);
  }
  return map;
}

function resolveMultiplier(map: Map<string, number>, state: string | null | undefined): number {
  if (!state) return DEFAULT_MULTIPLIER;
  return map.get(String(state).trim().toUpperCase().slice(0, 2)) ?? DEFAULT_MULTIPLIER;
}

async function sha256Hex(s: string | null | undefined): Promise<string | null> {
  if (!s) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s).trim().toLowerCase()));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Best-effort insert into meta_capi_events with weighting metadata. */
async function logCapiEvent(admin: any, row: {
  orderId: string;
  eventName: string;
  eventId: string;
  weightedValueCents: number;
  rawValueCents: number;
  multiplier: number;
  state: string | null;
  email: string | null;
  ok: boolean;
  error?: string | null;
  testMode: boolean;
}) {
  try {
    const emailHash = await sha256Hex(row.email);
    await admin.from("meta_capi_events").insert({
      order_id: row.orderId,
      event_name: row.eventName,
      event_id: row.eventId,
      value_cents: row.weightedValueCents,
      raw_value_cents: row.rawValueCents,
      multiplier: row.multiplier,
      state: row.state ? String(row.state).toUpperCase().slice(0, 2) : null,
      currency: "USD",
      test_mode: row.testMode,
      email_hash: emailHash,
      success: row.ok,
      error: row.error ?? null,
    });
  } catch (e) {
    // unique-on-(order_id) where test_mode=false AND success=true is expected for replays
    console.warn("[vs-poll] capi log insert", String(e).slice(0, 200));
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Coerce a value to number-or-null. Drops objects, strings, etc. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** First truthy numeric from a list of candidates. */
function pickNum(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    const n = num(c);
    if (n !== null) return n;
  }
  return null;
}

/** Map a Vinoshipper order JSON into a vs_transactions row. */
function mapOrder(o: any): Record<string, unknown> {
  const cust = o.customer ?? {};
  // VS schema: shipToAddress is a flat address object (street1/city/state/zip
  // directly on the object). Older code expected a nested .address — keep that
  // as a fallback for safety.
  const shipAddr = o.shipToAddress ?? o.shipTo?.address ?? cust.address ?? {};
  const billAddr = cust.address ?? shipAddr;
  const club = o.club ?? o.subscription ?? null;
  const isClub = !!club || /club|member/i.test(String(o.cartType ?? o.orderType ?? ""));

  return {
    invoice: String(o.orderNumber ?? o.id ?? o.orderId ?? o.invoice),
    transaction_date: o.purchasedAt ? new Date(o.purchasedAt).toISOString().slice(0, 10) : null,
    transaction_type: o.cartType ?? o.orderType ?? null,
    ship_date: o.shippedAt ? new Date(o.shippedAt).toISOString().slice(0, 10) : null,
    requested_ship_date: o.requestedShipDate ? new Date(o.requestedShipDate).toISOString().slice(0, 10) : null,
    store: o.store ?? null,
    delivery_type: o.deliveryType ?? o.device ?? null,
    inventory_location: o.inventoryLocation ?? null,
    tracking: o.tracking ?? null,
    payment_type: o.paymentType ?? null,
    club: club?.name ?? club?.clubName ?? null,
    release: club?.release ?? null,
    order_type: o.orderType ?? o.cartType ?? null,
    referrer: o.referrerUrl ?? o.referrer ?? null,
    discount_code: o.discountCode ?? null,
    customer_first_name: cust.firstName ?? null,
    customer_last_name: cust.lastName ?? null,
    customer_email: cust.email ?? null,
    customer_phone: cust.phone ?? null,
    customer_id: cust.id ? String(cust.id) : null,
    active_club_member: isClub,
    business_name: cust.businessName ?? null,
    customer_street: billAddr.street1 ?? billAddr.address1 ?? billAddr.street ?? null,
    customer_city: billAddr.city ?? null,
    customer_state: billAddr.state ?? billAddr.stateCode ?? null,
    customer_zip: billAddr.zip ?? billAddr.postalCode ?? null,
    ship_to_first_name: shipAddr.firstName ?? o.shipTo?.firstName ?? cust.firstName ?? null,
    ship_to_last_name: shipAddr.lastName ?? o.shipTo?.lastName ?? cust.lastName ?? null,
    ship_to_street: shipAddr.street1 ?? shipAddr.address1 ?? shipAddr.street ?? null,
    ship_to_city: shipAddr.city ?? null,
    ship_to_state: shipAddr.state ?? shipAddr.stateCode ?? null,
    ship_to_zip: shipAddr.zip ?? shipAddr.postalCode ?? null,
    bottles: num(o.bottles),
    gross_value: pickNum(o.grossValue, o.subtotal, o.subTotal),
    discount: pickNum(o.discount, o.discountTotal),
    shipping_to_customer: pickNum(o.shippingTotal, o.shippingCost, o.shipping?.total, o.shipping?.cost),
    order_total: pickNum(o.saleAmount, o.orderTotal, o.total, o.grandTotal),
    chain_status: o.orderStatus ?? o.chainStatus ?? o.status ?? null,
    raw: o,
  };
}

/** Send a Meta CAPI Subscribe event for a wine club signup with projected LTV. */
async function sendMetaSubscribe(input: {
  orderId: string;
  valueCents: number;
  email?: string | null;
  phone?: string | null;
  state?: string | null;
  zip?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const pixelId = Deno.env.get("META_PIXEL_ID");
  const token = Deno.env.get("META_CAPI_TOKEN");
  if (!pixelId || !token) return { ok: true };

  const sha = async (s: string | null | undefined) => {
    if (!s) return undefined;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.trim().toLowerCase()));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  const [em, ph, st, zp] = await Promise.all([
    sha(input.email), sha(input.phone?.replace(/\D/g, "")), sha(input.state), sha(input.zip),
  ]);
  const userData: Record<string, unknown> = {};
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (st) userData.st = [st];
  if (zp) userData.zp = [zp];
  userData.country = [await sha("us")];

  const body = {
    data: [{
      event_name: "Subscribe",
      event_time: Math.floor(Date.now() / 1000),
      event_id: `sub-${input.orderId}`,
      action_source: "website",
      user_data: userData,
      custom_data: {
        currency: "USD",
        value: input.valueCents / 100,
        predicted_ltv: input.valueCents / 100,
        order_id: input.orderId,
      },
    }],
  };
  try {
    const r = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (!r.ok) return { ok: false, error: `Meta Subscribe ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Auth — secret or admin JWT
  const ingestSecret = req.headers.get("x-kennel-ingest-secret");
  const expectedSecret = Deno.env.get("KENNEL_INGEST_SECRET");
  const secretOk = !!expectedSecret && ingestSecret === expectedSecret;

  // Cron fallback — matches the pattern used by other crons in this project
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");
  const cronOk = !!expectedCronSecret && cronSecret === expectedCronSecret;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!secretOk && !cronOk) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims } = await userClient.auth.getClaims(jwt);
    const uid = claims?.claims?.sub;
    if (!uid) return json({ error: "unauthorized" }, 401);
    const { data: ok } = await admin.rpc("is_admin_or_owner", { _user_id: uid });
    if (!ok) return json({ error: "forbidden" }, 403);
  }

  // Parse body — optional overrides for test runs
  let body: any = {};
  try { body = await req.json(); } catch { /* default empty */ }
  const limit = Math.min(Math.max(Number(body?.limit ?? 100), 1), 500);
  const testMode = body?.test_mode === true;

  const keyId = Deno.env.get("VINOSHIPPER_API_KEY_ID");
  const secret = Deno.env.get("VINOSHIPPER_API_SECRET");
  if (!keyId || !secret) return json({ error: "VS credentials missing" }, 500);
  const auth = `Basic ${btoa(`${keyId}:${secret}`)}`;

  // Start log row
  const { data: logRow } = await admin
    .from("vs_poll_log")
    .insert({ notes: { test_mode: testMode, limit } })
    .select("id")
    .single();
  const logId = logRow?.id;

  try {
    // Poll Vinoshipper — paginate ORDER_DATE DESC, early-exit on full-dedupe page.
    // VS caps page size at 25 server-side regardless of `limit`. Hard cap 20 pages = 500 orders.
    const PAGE_SIZE = 25;
    const MAX_PAGES = 20;
    let ordersSeen = 0;
    const allNewOrders: any[] = [];
    let pagesFetched = 0;
    let earlyExitReason: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_SIZE;
      const r = await fetch(`${VS_BASE}/orders/search`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: PAGE_SIZE,
          offset,
          sort: { field: "ORDER_DATE", direction: "DESC" },
        }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        await admin.from("vs_poll_log").update({
          finished_at: new Date().toISOString(),
          error: `VS ${r.status} on page ${page}: ${txt.slice(0, 300)}`,
        }).eq("id", logId);
        return json({ error: `VS ${r.status}`, body: txt.slice(0, 500), page }, 502);
      }
      const data = await r.json();
      const pageOrders: any[] = Array.isArray(data)
        ? data
        : (data.results ?? data.orders ?? data.data ?? []);
      pagesFetched++;
      ordersSeen += pageOrders.length;
      if (pageOrders.length === 0) {
        earlyExitReason = "empty-page";
        break;
      }

      const pageInvoices = pageOrders
        .map((o) => String(o.orderNumber ?? o.id ?? o.orderId ?? o.invoice))
        .filter((s) => s && s !== "undefined");
      const existing = new Set<string>();
      if (pageInvoices.length > 0) {
        const { data: have } = await admin
          .from("vs_transactions")
          .select("invoice")
          .in("invoice", pageInvoices);
        have?.forEach((row: any) => existing.add(row.invoice));
      }
      const pageNew = pageOrders.filter(
        (o) => !existing.has(String(o.orderNumber ?? o.id ?? o.orderId ?? o.invoice)),
      );
      allNewOrders.push(...pageNew);

      if (pageNew.length === 0) {
        earlyExitReason = "full-dedupe-hit";
        break;
      }
      if (pageOrders.length < PAGE_SIZE) {
        earlyExitReason = "partial-page";
        break;
      }

      // Rate-limit safety — VS Cloudflare gate trips around ~10 rapid calls.
      await new Promise((res) => setTimeout(res, 1000));
    }
    const newOrders = allNewOrders;

    // Upsert new orders
    let inserted = 0;
    if (newOrders.length > 0) {
      // VS may return multiple rows per invoice (one per line item).
      // Collapse to one row per invoice, keeping the last occurrence (richest payload).
      const byInvoice = new Map<string, Record<string, unknown>>();
      for (const o of newOrders) {
        const row = mapOrder(o);
        byInvoice.set(String(row.invoice), row);
      }
      const rows = Array.from(byInvoice.values());
      const { error: upErr, count } = await admin
        .from("vs_transactions")
        .upsert(rows, { onConflict: "invoice", count: "exact" });
      if (upErr) throw new Error(`upsert: ${upErr.message}`);
      inserted = count ?? rows.length;
    }

    // Fire CAPI conversions for each new order
    let purchases = 0, subscribes = 0, ltvCents = 0;
    const multipliers = await loadStateMultipliers(admin);
    for (const o of newOrders) {
      const orderId = String(o.id ?? o.orderId ?? o.invoice);
      const orderTotal = pickNum(o.orderTotal, o.total, o.grandTotal) ?? 0;
      const rawCents = Math.round(orderTotal * 100);
      if (rawCents <= 0) continue;

      const cust = o.customer ?? {};
      const ship = o.shipTo ?? cust;
      const shipAddr = ship?.address ?? cust?.address ?? {};
      const club = o.club ?? o.subscription ?? null;
      const isClub = !!club || /club|member/i.test(String(o.cartType ?? o.orderType ?? ""));
      const shipState = shipAddr.state ?? shipAddr.stateCode ?? null;
      const mult = resolveMultiplier(multipliers, shipState);
      const weightedCents = Math.round(rawCents * mult);

      // Purchase event (always)
      const conv = await forwardPurchaseConversion({
        orderId,
        valueCents: weightedCents,
        currency: "USD",
        email: cust.email ?? null,
        phone: cust.phone ?? null,
        firstName: cust.firstName ?? null,
        lastName: cust.lastName ?? null,
        city: shipAddr.city ?? null,
        state: shipState,
        zip: shipAddr.zip ?? shipAddr.postalCode ?? null,
        country: "US",
        debug: testMode,
      });
      if (conv.meta?.ok) purchases++;
      ltvCents += weightedCents;
      await logCapiEvent(admin, {
        orderId,
        eventName: "Purchase",
        eventId: orderId,
        weightedValueCents: weightedCents,
        rawValueCents: rawCents,
        multiplier: mult,
        state: shipState,
        email: cust.email ?? null,
        ok: !!conv.meta?.ok,
        error: conv.meta?.error ?? null,
        testMode,
      });

      // Follow-up "back to RescueDogWines" email — one-time per invoice.
      // Sent inline so customers land back on our site after the VS hosted checkout.
      if (!testMode && cust.email) {
        try {
          await admin.functions.invoke("send-transactional-email", {
            body: {
              templateName: "vs-order-confirmation-followup",
              recipientEmail: cust.email,
              idempotencyKey: `vs-followup-${orderId}`,
              templateData: {
                name: cust.firstName ?? null,
                invoice: orderId,
              },
            },
          });
        } catch (e) {
          console.error("vs-order-confirmation-followup send failed (non-fatal)", e);
        }
      }

      // Subscribe event with projected $400 LTV — wine club signups only
      if (isClub && !testMode) {
        const subRaw = STATIC_CLUB_LTV_CENTS;
        const subWeighted = Math.round(subRaw * mult);
        const sub = await sendMetaSubscribe({
          orderId,
          valueCents: subWeighted,
          email: cust.email ?? null,
          phone: cust.phone ?? null,
          state: shipState,
          zip: shipAddr.zip ?? shipAddr.postalCode ?? null,
        });
        if (sub.ok) {
          subscribes++;
          ltvCents += subWeighted;
        }
        await logCapiEvent(admin, {
          orderId,
          eventName: "Subscribe",
          eventId: `sub-${orderId}`,
          weightedValueCents: subWeighted,
          rawValueCents: subRaw,
          multiplier: mult,
          state: shipState,
          email: cust.email ?? null,
          ok: sub.ok,
          error: sub.error ?? null,
          testMode,
        });
      }
    }

    await admin.from("vs_poll_log").update({
      finished_at: new Date().toISOString(),
      orders_seen: ordersSeen,
      orders_new: inserted,
      capi_purchases_sent: purchases,
      capi_subscribes_sent: subscribes,
      ltv_value_sent_cents: ltvCents,
      notes: {
        test_mode: testMode,
        limit,
        static_club_ltv_cents: STATIC_CLUB_LTV_CENTS,
        ltv_note: "Static $400 LTV — replace once vs_transactions has 30+ days of fresh per-customer data",
        pages_fetched: pagesFetched,
        early_exit_reason: earlyExitReason,
      },
    }).eq("id", logId);

    return json({
      ok: true,
      orders_seen: ordersSeen,
      orders_new: inserted,
      capi_purchases_sent: purchases,
      capi_subscribes_sent: subscribes,
      ltv_value_sent_cents: ltvCents,
      pages_fetched: pagesFetched,
      early_exit_reason: earlyExitReason,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("vs_poll_log").update({
      finished_at: new Date().toISOString(),
      error: msg.slice(0, 500),
    }).eq("id", logId);
    return json({ error: msg }, 500);
  }
});