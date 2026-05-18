// printful-dispatch
//
// Sends a purchase order to Printful for the non-wine line items split out by
// vs-dropship-bridge. Operates in SIMULATION mode when PRINTFUL_API_KEY is
// missing OR when body.simulate === true. In simulation it fabricates a
// printful order id, writes a `dropship_orders` row, and returns the same
// shape the real API would.
//
// Auth: this fn is invoked server-to-server by vs-dropship-bridge OR by the
// /v3/admin/printful-sim UI for manual testing.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const PRINTFUL_BASE = "https://api.printful.com";

const LineSchema = z.object({
  sku: z.string().min(1),
  variant_id: z.union([z.string(), z.number()]).optional(),
  variant_id_type: z.enum(["auto", "sync", "external", "catalog"]).optional().default("auto"),
  name: z.string().min(1).optional(),
  retail_price: z.string().min(1).optional(),
  quantity: z.number().int().positive(),
});

const BodySchema = z.object({
  vs_order_id: z.union([z.string(), z.number()]),
  external_id: z.string().min(1).optional(),
  recipient: z.object({
    name: z.string(),
    address1: z.string(),
    address2: z.string().optional().nullable(),
    city: z.string(),
    state_code: z.string(),
    country_code: z.string().default("US"),
    zip: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  items: z.array(LineSchema).min(1),
  simulate: z.boolean().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return json({ error: "invalid json" }, 400);
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const input = parsed.data;

  const apiKey = Deno.env.get("PRINTFUL_API_KEY");
  const simulate = input.simulate === true || !apiKey;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const externalId = input.external_id ?? `vs_${input.vs_order_id}`;

  let printfulOrderId: string;
  let printfulRaw: unknown;

  if (simulate) {
    printfulOrderId = `sim_${crypto.randomUUID().slice(0, 8)}`;
    printfulRaw = {
      simulated: true,
      id: printfulOrderId,
      external_id: externalId,
      status: "draft",
      items: input.items,
      recipient: input.recipient,
      created_at: new Date().toISOString(),
    };
  } else {
    const storeVariants = listStoreVariants(apiKey);
    const items = await Promise.all(input.items.map((i) => toPrintfulOrderItem(i, storeVariants)));
    const res = await fetch(`${PRINTFUL_BASE}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        external_id: externalId,
        recipient: input.recipient,
        items,
      }),
    });
    const data = await res.json();
    if (!res.ok) return json({ error: "printful_error", details: data }, 502);
    printfulOrderId = String(data?.result?.id ?? "");
    printfulRaw = data;
  }

  // Look up the Printful partner row (required FK on dropship_orders).
  const { data: partner } = await supabase
    .from("dropship_partners")
    .select("id")
    .eq("vendor_type", "printful")
    .maybeSingle();

  if (!partner) {
    return json({ error: "no_printful_partner_row" }, 500);
  }

  await supabase.from("dropship_orders").insert({
    partner_id: partner.id,
    vinoshipper_order_id: String(input.vs_order_id),
    partner_order_id: printfulOrderId,
    vendor_order_id: externalId,
    status: simulate ? "simulated" : "submitted",
    fulfillment_status_detail: "dispatched",
    simulated: simulate,
    customer_name: input.recipient.name,
    customer_email: input.recipient.email ?? null,
    shipping_address: input.recipient as unknown as Record<string, unknown>,
    submitted_at: new Date().toISOString(),
    notes: JSON.stringify(printfulRaw),
  });

  return json({ ok: true, simulated: simulate, printful_order_id: printfulOrderId, raw: printfulRaw });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}