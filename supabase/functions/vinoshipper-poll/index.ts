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
//
// Date bucketing note: transaction_date / ship_date are derived via
// `new Date(...).toISOString().slice(0,10)`, which buckets in UTC. VS returns
// `purchasedAt` with a -07:00 (PT) offset, so a Pacific-evening order will
// shift to next-day UTC (e.g. 2026-05-28T19:31:00-07:00 → 2026-05-29).
// This matches legacy behavior; downstream reports treat dates as UTC. Keep
// in mind when reconciling against VS admin UI which displays Pacific time.
//
// VS endpoint quirk: /api/v3/p/orders/search returns at most 25 rows total
// for this account's credentials; `offset` does not page beyond that window.
// Older history requires a different VS API or expanded credentials.

import { createClient } from "npm:@supabase/supabase-js@2";
import { forwardPurchaseConversion } from "../_shared/serverConversions.ts";
import {
  mapOrder,
  logCapiEvent,
  sendMetaSubscribe,
  loadStateMultipliers,
  resolveMultiplier,
  pickNum,
  STATIC_CLUB_LTV_CENTS,
} from "../_shared/vinoshipperMap.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kennel-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VS_BASE = "https://vinoshipper.com/api/v3/p";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    // TEST MODE: skip all writes + CAPI fires; return mapped sample for inspection.
    if (testMode) {
      const mappedSample = newOrders.slice(0, 5).map(mapOrder);
      const mappedAll = newOrders.map(mapOrder);
      // Find Friday's test order if present
      const fridayTest = mappedAll.find((r) => String(r.invoice).startsWith("96444125012")) ?? null;
      const may25Orders = mappedAll.filter((r) => r.transaction_date === "2026-05-25");
      await admin.from("vs_poll_log").update({
        finished_at: new Date().toISOString(),
        orders_seen: ordersSeen,
        orders_new: newOrders.length,
        notes: {
          test_mode: true,
          pages_fetched: pagesFetched,
          early_exit_reason: earlyExitReason,
          mapping_fix_verification: true,
        },
      }).eq("id", logId);
      return json({
        ok: true,
        test_mode: true,
        pages_fetched: pagesFetched,
        early_exit_reason: earlyExitReason,
        orders_seen: ordersSeen,
        would_insert: newOrders.length,
        mapped_sample_first_5: mappedSample,
        may25_orders: may25Orders,
        friday_test_order_96444125012: fridayTest,
      });
    }

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
      const orderId = String(o.orderNumber ?? o.id ?? o.orderId ?? o.invoice);
      const orderTotal = pickNum(o.saleAmount, o.orderTotal, o.total, o.grandTotal) ?? 0;
      const rawCents = Math.round(orderTotal * 100);
      if (rawCents <= 0) continue;

      const cust = o.customer ?? {};
      const shipAddr = o.shipToAddress ?? o.shipTo?.address ?? cust?.address ?? {};
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