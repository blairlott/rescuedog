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
  printful_store_id: z.union([z.string(), z.number()]).optional(),
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

  const url = new URL(req.url);
  const apiKeyEarly = Deno.env.get("PRINTFUL_API_KEY");

  // Debug helper: GET ?action=list_variants → list all sync_variant_ids in the
  // connected Printful store so the UI can pick a valid one.
  if (req.method === "GET" && url.searchParams.get("action") === "list_variants") {
    if (!apiKeyEarly) return json({ error: "no_api_key" }, 400);
    const storeId = cleanId(url.searchParams.get("store_id") ?? Deno.env.get("PRINTFUL_STORE_ID"));
    const result = await fetchAllSyncVariants(apiKeyEarly, storeId);
    return json({ ok: true, count: result.variants.length, ...result });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return json({ error: "invalid json" }, 400);
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const input = parsed.data;

  const apiKey = apiKeyEarly;
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
    const requestedStoreId = cleanId(input.printful_store_id ?? Deno.env.get("PRINTFUL_STORE_ID"));
    const storeVariants = listStoreVariants(apiKey, requestedStoreId);
    const resolvedItems = await Promise.all(input.items.map((i) => toPrintfulOrderItem(i, storeVariants)));
    const items = resolvedItems.map(({ store_id: _storeId, ...item }) => item);
    const resolvedStoreId = requestedStoreId ?? resolvedItems.find((i) => i.store_id)?.store_id;
    const res = await fetch(`${PRINTFUL_BASE}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(resolvedStoreId ? { "X-PF-Store-Id": String(resolvedStoreId) } : {}),
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

type PrintfulLine = z.infer<typeof LineSchema>;
type StoreVariant = { sync_variant_id?: number; external_id?: string | null; sku?: string | null };

async function listStoreVariants(apiKey: string): Promise<StoreVariant[]> {
  return fetchAllSyncVariants(apiKey);
}

async function fetchAllSyncVariants(apiKey: string): Promise<StoreVariant[]> {
  // Printful: list sync products, then expand each to get sync_variants.
  const out: StoreVariant[] = [];
  const listRes = await fetch(`${PRINTFUL_BASE}/store/products?limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!listRes.ok) return out;
  const listData = await listRes.json();
  const products: Array<{ id: number; name: string }> = listData?.result ?? [];
  for (const p of products) {
    const detRes = await fetch(`${PRINTFUL_BASE}/store/products/${p.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!detRes.ok) continue;
    const det = await detRes.json();
    const variants: Array<{ id: number; external_id?: string; sku?: string; name?: string }> =
      det?.result?.sync_variants ?? [];
    for (const v of variants) {
      out.push({
        sync_variant_id: v.id,
        external_id: v.external_id ?? null,
        sku: v.sku ?? null,
        // @ts-ignore extra field for UI display
        name: `${p.name} — ${v.name ?? ""}`.trim(),
      });
    }
  }
  return out;
}

async function toPrintfulOrderItem(
  item: PrintfulLine,
  storeVariantsPromise: Promise<StoreVariant[]>,
) {
  const type = item.variant_id_type ?? "auto";
  const rawVariantId = item.variant_id == null ? "" : String(item.variant_id).trim();
  const base = { quantity: item.quantity };

  if (type === "sync") return { ...base, sync_variant_id: Number(rawVariantId) };
  if (type === "external") return { ...base, external_variant_id: rawVariantId };
  if (type === "catalog") {
    return {
      ...base,
      variant_id: Number(rawVariantId),
      name: item.name ?? item.sku,
      retail_price: item.retail_price ?? "0.01",
    };
  }

  const storeVariants = await storeVariantsPromise;
  const bySku = storeVariants.find((v) => v.sku === item.sku || v.external_id === item.sku);
  if (bySku?.sync_variant_id) return { ...base, sync_variant_id: bySku.sync_variant_id };
  if (rawVariantId && /^\d+$/.test(rawVariantId)) return { ...base, sync_variant_id: Number(rawVariantId) };
  if (rawVariantId) return { ...base, external_variant_id: rawVariantId };
  return { ...base, external_variant_id: item.sku };
}