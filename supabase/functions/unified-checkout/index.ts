// Unified single-transaction checkout.
//
// Customer enters card ONCE on /checkout; we charge the FULL cart on our
// Stripe account (Lovable's seamless Stripe integration). Vinoshipper is then
// notified out-of-band as a fulfillment partner for any wine line items —
// we remain the merchant of record on Stripe; VS handles wine compliance,
// shipping, and tax filings as our fulfillment vendor.
//
// Two actions on a single endpoint to keep the round-trips minimal:
//   POST { action: "create-intent", ... } → creates draft order + Stripe
//     PaymentIntent, returns { orderId, orderNumber, clientSecret }.
//   POST { action: "finalize", orderId } → after Stripe.js confirms the
//     PaymentIntent, server verifies status=succeeded, dispatches the
//     Vinoshipper leg (simulation for now), updates the order row, and
//     returns the final order summary for the thank-you page.
//
// SIMULATION MODE: while VS_SIMULATION === true on the front-end side, the
// Vinoshipper call is faked here too — we mark the wine leg as "submitted"
// with a synthetic order id. Flip both flags + add VS API secrets to go live.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { vsCreateOrder, vsLiveMode, VinoshipperError } from "../_shared/vinoshipper.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Live vs simulation is now controlled by the VS_LIVE_MODE secret (see
// _shared/vinoshipper.ts → vsLiveMode()). Default = simulation.

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const LineItemSchema = z.object({
  product_kind: z.enum(["wine", "merch"]),
  product_id: z.string().uuid().nullable().optional(),
  vinoshipper_product_id: z.string().nullable().optional(),
  product_name: z.string().min(1).max(500),
  product_sku: z.string().nullable().optional(),
  variant_name: z.string().nullable().optional(),
  quantity: z.number().int().positive(),
  unit_price_cents: z.number().int().nonnegative(),
});

const CreateIntentSchema = z.object({
  action: z.literal("create-intent"),
  customer: z.object({
    email: z.string().email(),
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    phone: z.string().max(50).optional().nullable(),
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  }),
  shipping: z.object({
    address1: z.string().min(1).max(200),
    address2: z.string().max(200).optional().nullable(),
    city: z.string().min(1).max(100),
    state: z.string().min(2).max(2),
    zip: z.string().min(3).max(20),
    country: z.string().min(2).max(2).default("US"),
  }),
  items: z.array(LineItemSchema).min(1).max(100),
  shipping_cents: z.number().int().nonnegative().default(0),
  tax_cents: z.number().int().nonnegative().default(0),
  age_verified: z.boolean(),
  user_id: z.string().uuid().nullable().optional(),
  environment: z.enum(["sandbox", "live"]).default("sandbox"),
});

const FinalizeSchema = z.object({
  action: z.literal("finalize"),
  order_id: z.string().uuid(),
  environment: z.enum(["sandbox", "live"]).default("sandbox"),
});

const RequestSchema = z.discriminatedUnion("action", [CreateIntentSchema, FinalizeSchema]);

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function genOrderNumber(): string {
  // RDW-YYYYMMDD-XXXXXX
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RDW-${ymd}-${rand}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "Method not allowed" }, 405);

  let parsed;
  try {
    const body = await req.json();
    parsed = RequestSchema.safeParse(body);
  } catch {
    return jsonResp({ error: "Invalid JSON" }, 400);
  }
  if (!parsed.success) {
    return jsonResp({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }
  const data = parsed.data;
  const env: StripeEnv = data.environment;
  let stripe;
  try {
    stripe = createStripeClient(env);
  } catch (e) {
    console.error("[unified-checkout] stripe client init failed", e);
    return jsonResp({ error: "Stripe not configured" }, 500);
  }

  try {
    if (data.action === "create-intent") {
      // ── Cost snapshot lookup (margin tracking) ──────────────────────────
      // Wine: cost from wine_products.cost_cents, partner = Vinoshipper.
      // Merch: prefer dropship_skus.cost_cents (matched by sku), fall back to
      // merch_products.cost_cents (self-fulfilled).
      const wineVsIds = data.items.filter(i => i.product_kind === "wine" && i.vinoshipper_product_id).map(i => i.vinoshipper_product_id!);
      const merchSkus = data.items.filter(i => i.product_kind === "merch" && i.product_sku).map(i => i.product_sku!);
      const merchIds = data.items.filter(i => i.product_kind === "merch" && i.product_id).map(i => i.product_id!);
      const merchVsIds = data.items.filter(i => i.product_kind === "merch" && i.vinoshipper_product_id).map(i => i.vinoshipper_product_id!);

      // ── Printful mapping validation ────────────────────────────────────
      // Every merch line must resolve to a dropship_skus row. If that row's
      // fulfillment_mode is "printful", it MUST be linked to a Printful partner
      // and carry a vendor_variant_id (sync_variant_id). Otherwise we'd accept
      // payment for an item we can't physically dispatch.
      const merchItems = data.items.filter(i => i.product_kind === "merch");
      if (merchItems.length > 0) {
        const orFilters: string[] = [];
        if (merchSkus.length) orFilters.push(`sku.in.(${merchSkus.map(s => `"${s}"`).join(",")})`);
        if (merchVsIds.length) orFilters.push(`vinoshipper_product_id.in.(${merchVsIds.map(s => `"${s}"`).join(",")})`);

        const { data: mappings } = orFilters.length
          ? await supabase
              .from("dropship_skus")
              .select("sku, vinoshipper_product_id, partner_id, fulfillment_mode, vendor_variant_id, is_active")
              .or(orFilters.join(","))
          : { data: [] as any[] };

        const activeMappings = (mappings ?? []).filter((m: any) => m.is_active !== false);
        const partnerIds = [...new Set(activeMappings.map((m: any) => m.partner_id).filter(Boolean))];
        const { data: partners } = partnerIds.length
          ? await supabase.from("dropship_partners").select("id, vendor_type").in("id", partnerIds)
          : { data: [] as any[] };
        const vendorTypeById = new Map((partners ?? []).map((p: any) => [p.id, p.vendor_type]));

        const unmapped: Array<{ sku?: string | null; vinoshipper_product_id?: string | null; reason: string }> = [];
        for (const item of merchItems) {
          const match = activeMappings.find((m: any) =>
            (item.product_sku && m.sku === item.product_sku) ||
            (item.vinoshipper_product_id && String(m.vinoshipper_product_id) === String(item.vinoshipper_product_id))
          );
          if (!match) {
            unmapped.push({ sku: item.product_sku, vinoshipper_product_id: item.vinoshipper_product_id, reason: "no_dropship_mapping" });
            continue;
          }
          if (match.fulfillment_mode === "printful") {
            const vendorType = vendorTypeById.get(match.partner_id);
            if (vendorType !== "printful") {
              unmapped.push({ sku: item.product_sku, vinoshipper_product_id: item.vinoshipper_product_id, reason: "printful_mode_wrong_partner_type" });
            } else if (!match.vendor_variant_id) {
              unmapped.push({ sku: item.product_sku, vinoshipper_product_id: item.vinoshipper_product_id, reason: "printful_missing_sync_variant_id" });
            }
          }
        }
        if (unmapped.length > 0) {
          console.warn("[unified-checkout] blocking checkout — unmapped Printful items", unmapped);
          return jsonResp({
            error: "Some items can't be fulfilled — missing Printful mapping. Please contact support.",
            code: "dropship_mapping_missing",
            details: unmapped,
          }, 422);
        }
      }

      const [wineLookup, dropshipLookup, merchLookup] = await Promise.all([
        wineVsIds.length
          ? supabase.from("wine_products").select("vinoshipper_product_id, cost_cents, price_cents")
              .in("vinoshipper_product_id", wineVsIds)
              .then(r => new Map((r.data ?? []).map((w: any) => [String(w.vinoshipper_product_id), { cost: w.cost_cents, price: w.price_cents }])))
          : Promise.resolve(new Map<string, { cost: number | null; price: number | null }>()),
        merchSkus.length
          ? supabase.from("dropship_skus").select("sku, cost_cents, partner_id, retail_cents")
              .in("sku", merchSkus).eq("is_active", true)
              .then(r => new Map((r.data ?? []).map((d: any) => [d.sku, { cost: d.cost_cents, partner_id: d.partner_id, price: d.retail_cents }])))
          : Promise.resolve(new Map<string, { cost: number; partner_id: string; price: number | null }>()),
        merchIds.length
          ? supabase.from("merch_products").select("id, cost_cents, price_cents")
              .in("id", merchIds)
              .then(r => new Map((r.data ?? []).map((m: any) => [m.id, { cost: m.cost_cents, price: m.price_cents }])))
          : Promise.resolve(new Map<string, { cost: number | null; price: number | null }>()),
      ]);

      // ── SERVER-SIDE PRICE ENFORCEMENT ──────────────────────────────────
      // Replace client-supplied unit_price_cents with the authoritative price
      // from the database. Reject the request if any line item can't be
      // resolved to a known price — never trust the client on amounts.
      const priceMismatches: Array<{ name: string; reason: string }> = [];
      for (const item of data.items) {
        let authoritative: number | null | undefined;
        if (item.product_kind === "wine") {
          const w = item.vinoshipper_product_id ? wineLookup.get(String(item.vinoshipper_product_id)) : null;
          authoritative = w?.price ?? null;
        } else {
          const ds = item.product_sku ? (dropshipLookup.get(item.product_sku) as any) : null;
          authoritative = ds?.price ?? null;
          if (authoritative == null && item.product_id) {
            authoritative = merchLookup.get(item.product_id)?.price ?? null;
          }
        }
        if (authoritative == null || authoritative <= 0) {
          priceMismatches.push({ name: item.product_name, reason: "no authoritative price found" });
          continue;
        }
        item.unit_price_cents = authoritative;
      }
      if (priceMismatches.length > 0) {
        return jsonResp({
          error: "Some items could not be priced. Please refresh and try again.",
          code: "price_resolution_failed",
          details: priceMismatches,
        }, 422);
      }

      // Back-compat aliases for downstream snapshotCost()
      const wineCostMap = new Map(Array.from(wineLookup.entries()).map(([k, v]) => [k, v.cost]));
      const dropshipCostMap = new Map(Array.from(dropshipLookup.entries()).map(([k, v]: any) => [k, { cost: v.cost, partner_id: v.partner_id }]));
      const merchCostMap = new Map(Array.from(merchLookup.entries()).map(([k, v]) => [k, v.cost]));

      function snapshotCost(i: typeof data.items[number]): { cost_cents: number | null; partner_kind: string | null; partner_id: string | null } {
        if (i.product_kind === "wine") {
          const c = i.vinoshipper_product_id ? wineCostMap.get(i.vinoshipper_product_id) : null;
          return { cost_cents: c ?? null, partner_kind: "vinoshipper", partner_id: i.vinoshipper_product_id ?? null };
        }
        // merch — try dropship match first
        const ds = i.product_sku ? dropshipCostMap.get(i.product_sku) as any : null;
        if (ds) return { cost_cents: ds.cost ?? null, partner_kind: "dropship", partner_id: ds.partner_id ?? null };
        const mc = i.product_id ? merchCostMap.get(i.product_id) : null;
        return { cost_cents: mc ?? null, partner_kind: "self", partner_id: null };
      }

      const wineSubtotal = data.items.filter(i => i.product_kind === "wine")
        .reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);
      const merchSubtotal = data.items.filter(i => i.product_kind === "merch")
        .reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);
      const total = wineSubtotal + merchSubtotal + data.shipping_cents + data.tax_cents;
      if (total <= 0) return jsonResp({ error: "Empty cart" }, 400);

      const hasWine = wineSubtotal > 0;
      const hasMerch = merchSubtotal > 0;
      const orderNumber = genOrderNumber();

      // Create Stripe PaymentIntent first so we can store its id on the order row.
      const intent = await stripe.paymentIntents.create({
        amount: total,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        receipt_email: data.customer.email,
        description: `RDW order ${orderNumber}`,
        metadata: {
          order_number: orderNumber,
          wine_subtotal_cents: String(wineSubtotal),
          merch_subtotal_cents: String(merchSubtotal),
        },
      });

      const { data: order, error: orderErr } = await supabase.from("orders").insert({
        order_number: orderNumber,
        user_id: data.user_id ?? null,
        customer_email: data.customer.email,
        customer_first_name: data.customer.first_name,
        customer_last_name: data.customer.last_name,
        customer_phone: data.customer.phone ?? null,
        date_of_birth: data.customer.date_of_birth ?? null,
        ship_address1: data.shipping.address1,
        ship_address2: data.shipping.address2 ?? null,
        ship_city: data.shipping.city,
        ship_state: data.shipping.state,
        ship_zip: data.shipping.zip,
        ship_country: data.shipping.country ?? "US",
        wine_subtotal_cents: wineSubtotal,
        merch_subtotal_cents: merchSubtotal,
        tax_cents: data.tax_cents,
        shipping_cents: data.shipping_cents,
        total_cents: total,
        stripe_payment_intent_id: intent.id,
        payment_status: "pending",
        vinoshipper_status: hasWine ? "pending" : "not_applicable",
        merch_fulfillment_status: hasMerch ? "pending" : "not_applicable",
        age_verified: data.age_verified,
      }).select("id, order_number").single();

      if (orderErr || !order) {
        console.error("[unified-checkout] order insert failed", orderErr);
        // Best-effort cancel the intent so we don't leak it.
        try { await stripe.paymentIntents.cancel(intent.id); } catch {}
        return jsonResp({ error: "Failed to create order" }, 500);
      }

      const itemRows = data.items.map(i => ({
        order_id: order.id,
        product_kind: i.product_kind,
        product_id: i.product_id ?? null,
        vinoshipper_product_id: i.vinoshipper_product_id ?? null,
        product_name: i.product_name,
        product_sku: i.product_sku ?? null,
        variant_name: i.variant_name ?? null,
        quantity: i.quantity,
        unit_price_cents: i.unit_price_cents,
        line_total_cents: i.unit_price_cents * i.quantity,
        ...snapshotCost(i),
      }));
      const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
      if (itemsErr) {
        console.error("[unified-checkout] order_items insert failed", itemsErr);
        // Order row exists but items failed — let it through; finalize will surface the issue.
      }

      return jsonResp({
        order_id: order.id,
        order_number: order.order_number,
        client_secret: intent.client_secret,
        amount_cents: total,
      });
    }

    // FINALIZE
    const { data: order, error: fetchErr } = await supabase.from("orders")
      .select("*").eq("id", data.order_id).single();
    if (fetchErr || !order) return jsonResp({ error: "Order not found" }, 404);
    if (order.payment_status === "paid") {
      return jsonResp({ ok: true, order_number: order.order_number, already_finalized: true });
    }
    if (!order.stripe_payment_intent_id) return jsonResp({ error: "No payment intent on order" }, 400);

    const intent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id as string);
    if (intent.status !== "succeeded") {
      return jsonResp({ error: "Payment not completed", status: intent.status }, 402);
    }

    // Mark paid + capture Stripe fee for margin tracking.
    const chargeId = (intent.latest_charge as string | null) ?? null;
    let stripeFeeCents: number | null = null;
    let processorNetCents: number | null = null;
    if (chargeId) {
      try {
        const charge: any = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] });
        const bt = charge.balance_transaction;
        if (bt && typeof bt === "object") {
          stripeFeeCents = bt.fee ?? null;
          processorNetCents = bt.net ?? null;
        }
      } catch (e) {
        console.warn("[unified-checkout] could not retrieve balance_transaction", e);
      }
    }
    await supabase.from("orders").update({
      payment_status: "paid",
      stripe_charge_id: chargeId,
      stripe_fee_cents: stripeFeeCents,
      processor_net_cents: processorNetCents,
    }).eq("id", order.id);

    // Dispatch Vinoshipper leg if there are wine items.
    let vsOrderId: string | null = null;
    if (order.vinoshipper_status === "pending") {
      const live = vsLiveMode();
      if (!live) {
        // SIMULATION: stamp a synthetic VS order id so the rest of the
        // pipeline (admin queues, webhook simulator) has something to work with.
        vsOrderId = `VS-SIM-${order.order_number}`;
        await supabase.from("orders").update({
          vinoshipper_order_id: vsOrderId,
          vinoshipper_status: "submitted",
        }).eq("id", order.id);
      } else {
        // LIVE: pull wine line items + ship address off the order and POST to VS.
        // VS is acting as our fulfillment vendor — payment already captured on
        // our Stripe, so we mark the order paid:true so VS does NOT re-charge.
        try {
          const { data: wineItems } = await supabase
            .from("order_items")
            .select("vinoshipper_product_id, quantity")
            .eq("order_id", order.id)
            .eq("product_kind", "wine");

          const lineItems = (wineItems ?? [])
            .filter((i: any) => i.vinoshipper_product_id)
            .map((i: any) => ({
              productId: i.vinoshipper_product_id as string,
              quantity: i.quantity as number,
            }));

          if (lineItems.length === 0) {
            console.warn("[unified-checkout] live mode but no VS-mapped wine items on order", order.id);
            await supabase.from("orders").update({
              vinoshipper_status: "error",
              vinoshipper_error: "no vinoshipper_product_id on wine line items",
            } as Record<string, unknown>).eq("id", order.id);
          } else {
            const vsResp = await vsCreateOrder({
              orderNumber: order.order_number,
              lineItems,
              shippingAddress: {
                firstName: order.customer_first_name,
                lastName: order.customer_last_name,
                address1: order.ship_address1,
                address2: order.ship_address2 ?? undefined,
                city: order.ship_city,
                state: order.ship_state,
                zip: order.ship_zip,
                phone: order.customer_phone ?? undefined,
                email: order.customer_email,
              },
              // @ts-expect-error — paid flag passed through to VS payload
              paid: true,
            }) as { id: string | number };
            vsOrderId = String(vsResp.id);
            await supabase.from("orders").update({
              vinoshipper_order_id: vsOrderId,
              vinoshipper_status: "submitted",
            }).eq("id", order.id);
          }
        } catch (e) {
          const detail = e instanceof VinoshipperError ? e.details : String(e);
          console.error("[unified-checkout] VS live order failed", detail);
          await supabase.from("orders").update({
            vinoshipper_status: "error",
            vinoshipper_error: typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 1000),
          } as Record<string, unknown>).eq("id", order.id);
          // Don't fail the whole finalize — payment already captured. Admin
          // queue will surface the failed VS dispatch for manual retry.
        }
      }
    }

    return jsonResp({
      ok: true,
      order_id: order.id,
      order_number: order.order_number,
      vinoshipper_order_id: vsOrderId,
      total_cents: order.total_cents,
    });
  } catch (err) {
    console.error("[unified-checkout] unhandled", err);
    return jsonResp({ error: (err as Error).message ?? "Unknown error" }, 500);
  }
});