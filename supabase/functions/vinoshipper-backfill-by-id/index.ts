// Backfill missing VS orders by ID.
//
// Why: /orders/search returns only the 25 most-recent orders and silently
// ignores from/to/startDate params. Any older window (e.g. the May-18→28 gap)
// is unreachable via list endpoints. Source the missing order IDs from VS
// admin UI export, POST them as { order_ids: [...] }, and this function
// fetches each via /orders/{id}, maps with the SAME mapOrder used by the
// poll, upserts into vs_transactions, and fires Meta Purchase + (when
// applicable) Subscribe CAPI events.
//
// Auth: verifyCronSecret — accepts x-cron-secret OR service-role JWT.
// Rate limit: 1s sleep per call (matches vinoshipper-poll pagination cadence).
// Bounds: max 200 IDs per invocation to keep wall-time under edge budget
//   and CAPI exposure predictable.
// Idempotency: upsert on invoice; CAPI dedup via meta_capi_events unique
//   index on (order_id) WHERE test_mode=false AND success=true.

import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyCronSecret } from "../_shared/cronAlert.ts";
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VS_BASE = "https://vinoshipper.com/api/v3/p";
const MAX_IDS_PER_RUN = 200;
const SLEEP_MS = 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  if (!(await verifyCronSecret(req, "vinoshipper-backfill-by-id"))) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* default empty */ }
  const orderIds: string[] = Array.isArray(body?.order_ids)
    ? body.order_ids.map((s: unknown) => String(s).trim()).filter(Boolean)
    : [];
  const dryRun: boolean = body?.dry_run === true;

  if (orderIds.length === 0) return json({ error: "order_ids[] required" }, 400);
  if (orderIds.length > MAX_IDS_PER_RUN) {
    return json({ error: `max ${MAX_IDS_PER_RUN} ids per run`, received: orderIds.length }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const keyId = Deno.env.get("VINOSHIPPER_API_KEY_ID");
  const secret = Deno.env.get("VINOSHIPPER_API_SECRET");
  if (!keyId || !secret) return json({ error: "VS credentials missing" }, 500);
  const vsAuth = `Basic ${btoa(`${keyId}:${secret}`)}`;

  const { data: logRow } = await admin
    .from("vs_poll_log")
    .insert({
      notes: { source: "gap_backfill", requested: orderIds.length, dry_run: dryRun },
    })
    .select("id")
    .single();
  const logId = logRow?.id;

  const fetched: any[] = [];
  const failures: Array<{ id: string; error: string }> = [];

  for (let i = 0; i < orderIds.length; i++) {
    const id = orderIds[i];
    try {
      const r = await fetch(`${VS_BASE}/orders/${encodeURIComponent(id)}`, {
        headers: { Authorization: vsAuth, Accept: "application/json" },
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        failures.push({ id, error: `VS ${r.status}: ${txt.slice(0, 200)}` });
      } else {
        fetched.push(await r.json());
      }
    } catch (e) {
      failures.push({ id, error: String(e).slice(0, 200) });
    }
    if (i < orderIds.length - 1) await new Promise((res) => setTimeout(res, SLEEP_MS));
  }

  // pickNum's fallback chain already covers `total` for detail-endpoint payloads
  // (which omit `saleAmount`), so mapOrder works without any pre-aliasing.
  const mapped = fetched.map(mapOrder);

  if (dryRun) {
    await admin.from("vs_poll_log").update({
      finished_at: new Date().toISOString(),
      orders_seen: fetched.length,
      orders_new: 0,
      notes: {
        source: "gap_backfill",
        requested: orderIds.length,
        succeeded: fetched.length,
        failed: failures.length,
        dry_run: true,
      },
    }).eq("id", logId);
    return json({
      ok: true,
      dry_run: true,
      processed: orderIds.length,
      fetched: fetched.length,
      mapped,
      failures,
    });
  }

  // Upsert — collapse to one row per invoice (last wins, richest payload)
  const byInvoice = new Map<string, Record<string, unknown>>();
  for (const row of mapped) byInvoice.set(String(row.invoice), row);
  const rows = Array.from(byInvoice.values());
  let inserted = 0;
  if (rows.length > 0) {
    const { error: upErr, count } = await admin
      .from("vs_transactions")
      .upsert(rows, { onConflict: "invoice", count: "exact" });
    if (upErr) {
      await admin.from("vs_poll_log").update({
        finished_at: new Date().toISOString(),
        error: `upsert: ${upErr.message}`,
      }).eq("id", logId);
      return json({ error: `upsert: ${upErr.message}` }, 500);
    }
    inserted = count ?? rows.length;
  }

  // CAPI fires — identical to vinoshipper-poll
  let purchases = 0, subscribes = 0, ltvCents = 0;
  const multipliers = await loadStateMultipliers(admin);
  for (const o of fetched) {
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

    // Purchase
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
      testMode: false,
    });

    // Subscribe (club only) with projected LTV
    if (isClub) {
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
        testMode: false,
      });
    }
  }

  await admin.from("vs_poll_log").update({
    finished_at: new Date().toISOString(),
    orders_seen: fetched.length,
    orders_new: inserted,
    capi_purchases_sent: purchases,
    capi_subscribes_sent: subscribes,
    ltv_value_sent_cents: ltvCents,
    notes: {
      source: "gap_backfill",
      requested: orderIds.length,
      succeeded: fetched.length,
      failed: failures.length,
      dry_run: false,
    },
  }).eq("id", logId);

  return json({
    ok: true,
    processed: orderIds.length,
    inserted,
    capi_purchases_sent: purchases,
    capi_subscribes_sent: subscribes,
    ltv_value_sent_cents: ltvCents,
    failures,
  });
});