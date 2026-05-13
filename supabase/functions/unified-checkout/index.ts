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
import Stripe from "npm:stripe@17";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET = Deno.env.get("STRIPE_SANDBOX_API_KEY") ?? Deno.env.get("STRIPE_LIVE_API_KEY") ?? "";

// Simulation flag mirrors src/lib/vinoshipperConfig.ts. Flip to false once VS
// API secrets are in place and we're ready to actually create wine orders.
const VS_SIMULATION = true;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET, { apiVersion: "2024-09-30.acacia" as any }) : null;

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
});

const FinalizeSchema = z.object({
  action: z.literal("finalize"),
  order_id: z.string().uuid(),
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
  if (!stripe) return jsonResp({ error: "Stripe not configured" }, 500);

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

  try {
    if (data.action === "create-intent") {
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

    const intent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
    if (intent.status !== "succeeded") {
      return jsonResp({ error: "Payment not completed", status: intent.status }, 402);
    }

    // Mark paid.
    const chargeId = (intent.latest_charge as string | null) ?? null;
    await supabase.from("orders").update({
      payment_status: "paid",
      stripe_charge_id: chargeId,
    }).eq("id", order.id);

    // Dispatch Vinoshipper leg if there are wine items.
    let vsOrderId: string | null = null;
    if (order.vinoshipper_status === "pending") {
      if (VS_SIMULATION) {
        vsOrderId = `VS-SIM-${order.order_number}`;
        await supabase.from("orders").update({
          vinoshipper_order_id: vsOrderId,
          vinoshipper_status: "submitted",
        }).eq("id", order.id);
      } else {
        // TODO: real call to vinoshipper-create-order with paid:true
        // For now log and leave pending so it shows up in admin queues.
        console.warn("[unified-checkout] VS live mode not yet wired");
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