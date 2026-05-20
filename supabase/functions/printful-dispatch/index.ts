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
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const PRINTFUL_BASE = "https://api.printful.com";

const LineSchema = z.object({
  sku: z.string().min(1),
  variant_id: z.union([z.string(), z.number()]).optional(),
  product_template_id: z.union([z.string(), z.number()]).optional(),
  variant_id_type: z.enum(["auto", "sync", "external", "catalog", "template"]).optional().default("auto"),
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

  if (req.method === "GET" && url.searchParams.get("action") === "list_templates") {
    if (!apiKeyEarly) return json({ error: "no_api_key" }, 400);
    const templates = await fetchAllProductTemplates(apiKeyEarly);
    return json({ ok: true, count: templates.length, templates });
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
type PrintfulStore = { id: number; name?: string; type?: string };
type StoreVariant = { sync_variant_id?: number; external_id?: string | null; sku?: string | null; store_id?: number };

async function listStoreVariants(apiKey: string, storeId?: string | number): Promise<StoreVariant[]> {
  return (await fetchAllSyncVariants(apiKey, storeId)).variants;
}

async function fetchAllSyncVariants(apiKey: string, requestedStoreId?: string | number) {
  // Printful account-level tokens need X-PF-Store-Id; scan all accessible stores
  // unless the caller supplies one explicitly.
  const out: StoreVariant[] = [];
  const stores = await fetchStores(apiKey);
  const targets = requestedStoreId
    ? [{ id: Number(requestedStoreId), name: `Store ${requestedStoreId}` }]
    : stores.length > 0
      ? stores
      : [{ id: 0, name: "Default token store" }];
  const debug: Array<Record<string, unknown>> = [];

  for (const store of targets) {
    const products = await fetchStoreProducts(apiKey, store.id || undefined);
    debug.push({ store_id: store.id || null, store_name: store.name ?? null, products: products.length });
    for (const p of products) {
      const detRes = await printfulFetch(apiKey, `/store/products/${p.id}`, store.id || undefined);
      if (!detRes.ok) continue;
      const det = await detRes.json();
      const variants: Array<{ id: number; external_id?: string; sku?: string; name?: string }> =
        det?.result?.sync_variants ?? [];
      for (const v of variants) {
        out.push({
          sync_variant_id: v.id,
          external_id: v.external_id ?? null,
          sku: v.sku ?? null,
          store_id: store.id || undefined,
          // @ts-ignore extra field for UI display
          name: `${store.name ? `${store.name} / ` : ""}${p.name} — ${v.name ?? ""}`.trim(),
        });
      }
    }
  }

  return { stores, debug, variants: out };
}

async function fetchStores(apiKey: string): Promise<PrintfulStore[]> {
  const res = await fetch(`${PRINTFUL_BASE}/stores`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.result ?? [];
}

async function fetchStoreProducts(apiKey: string, storeId?: number) {
  const products: Array<{ id: number; name: string }> = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const res = await printfulFetch(apiKey, `/store/products?limit=100&offset=${offset}`, storeId);
    if (!res.ok) break;
    const data = await res.json();
    products.push(...(data?.result ?? []));
    if (!data?.paging || products.length >= Number(data.paging.total ?? 0)) break;
  }
  return products;
}

async function fetchAllProductTemplates(apiKey: string) {
  const templates: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const res = await fetch(`${PRINTFUL_BASE}/product-templates?limit=100&offset=${offset}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) break;
    const data = await res.json();
    templates.push(...(data?.result?.items ?? []));
    if (!data?.paging || templates.length >= Number(data.paging.total ?? 0)) break;
  }
  return templates;
}

function printfulFetch(apiKey: string, path: string, storeId?: number) {
  return fetch(`${PRINTFUL_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(storeId ? { "X-PF-Store-Id": String(storeId) } : {}),
    },
  });
}

function cleanId(value: unknown) {
  const id = value == null ? "" : String(value).trim();
  return id.length > 0 ? id : undefined;
}

async function toPrintfulOrderItem(
  item: PrintfulLine,
  storeVariantsPromise: Promise<StoreVariant[]>,
) {
  const type = item.variant_id_type ?? "auto";
  const rawVariantId = item.variant_id == null ? "" : String(item.variant_id).trim();
  const base = { quantity: item.quantity };

  if (type === "sync") {
    const storeVariants = await storeVariantsPromise;
    const byId = storeVariants.find((v) => String(v.sync_variant_id) === rawVariantId);
    return { ...base, sync_variant_id: Number(rawVariantId), store_id: byId?.store_id };
  }
  if (type === "external") return { ...base, external_variant_id: rawVariantId };
  if (type === "template") {
    const templateId = cleanId(item.product_template_id);
    if (!templateId || !rawVariantId) throw new Error("template orders require product_template_id and catalog variant_id");
    return { ...base, product_template_id: Number(templateId), variant_id: Number(rawVariantId) };
  }
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
  if (bySku?.sync_variant_id) return { ...base, sync_variant_id: bySku.sync_variant_id, store_id: bySku.store_id };
  if (rawVariantId && /^\d+$/.test(rawVariantId)) {
    const byId = storeVariants.find((v) => String(v.sync_variant_id) === rawVariantId);
    return { ...base, sync_variant_id: Number(rawVariantId), store_id: byId?.store_id };
  }
  if (rawVariantId) return { ...base, external_variant_id: rawVariantId };
  return { ...base, external_variant_id: item.sku };
}