/*
 * SYNC_FIELDS is intentionally narrow on initial iteration:
 * - club_price_cents: not in /products/{id} response, needs
 *   membership endpoint (TBD)
 * - varietal/vintage: null for multi-pack (Sampler); needs
 *   special handling
 * - cost_cents: in price.cogs but currently CMS-controlled
 *   for margin display; sync after CFO sign-off
 * - badges/tags: derived/curated, not from VS
 * - gallery_urls: VS exposes only single imgUrl
 * Expand SYNC_FIELDS in a follow-up after each gap is closed.
 */

export type SyncField =
  | "title"
  | "description"
  | "image_url"
  | "price_cents"
  | "in_stock"
  | "vinoshipper_sku";

export const SYNC_FIELDS: readonly SyncField[] = [
  "title",
  "description",
  "image_url",
  "price_cents",
  "in_stock",
  "vinoshipper_sku",
] as const;

export interface VsProduct {
  id?: number | string;
  status?: string;
  detail?: {
    name?: string;
    sku?: string;
    description?: string;
    imgUrl?: string;
    [k: string]: unknown;
  };
  summary?: {
    name?: string;
    sku?: string;
    imgUrl?: string;
    hidden?: boolean;
    [k: string]: unknown;
  };
  price?: {
    unitPrice?: number;
    msrp?: number;
    cogs?: number;
    [k: string]: unknown;
  };
  inventory?: {
    soldOut?: boolean;
    amount?: number;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

const VS_BASE = "https://vinoshipper.com/api/v3/p";

function buildVsAuth(): string {
  const keyId = Deno.env.get("VINOSHIPPER_API_KEY_ID");
  const secret = Deno.env.get("VINOSHIPPER_API_SECRET");
  if (!keyId || !secret) throw new Error("VS credentials missing");
  return `Basic ${btoa(`${keyId}:${secret}`)}`;
}

export async function fetchVsProduct(productId: number): Promise<VsProduct> {
  const url = `${VS_BASE}/products/${productId}`;
  const r = await fetch(url, {
    method: "GET",
    headers: { Authorization: buildVsAuth(), "Content-Type": "application/json" },
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`VS ${r.status} for product ${productId}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text) as VsProduct;
  } catch {
    throw new Error(`VS returned non-JSON for product ${productId}: ${text.slice(0, 300)}`);
  }
}

export function extractSyncableFields(
  vs: VsProduct,
): Partial<Record<SyncField, string | number | boolean>> {
  const out: Partial<Record<SyncField, string | number | boolean>> = {};

  const title = vs.detail?.name ?? vs.summary?.name;
  if (typeof title === "string" && title.length > 0) out.title = title;

  const description = vs.detail?.description;
  if (typeof description === "string" && description.length > 0) out.description = description;

  const imageUrl = vs.detail?.imgUrl ?? vs.summary?.imgUrl;
  if (typeof imageUrl === "string" && imageUrl.length > 0) out.image_url = imageUrl;

  const unit = vs.price?.unitPrice;
  if (typeof unit === "number" && Number.isFinite(unit)) {
    out.price_cents = Math.round(unit * 100);
  }

  if (vs.inventory && typeof vs.inventory === "object") {
    const soldOut = vs.inventory.soldOut;
    const amount = typeof vs.inventory.amount === "number" ? vs.inventory.amount : 0;
    const hidden = vs.summary?.hidden === true;
    if (typeof soldOut === "boolean") {
      out.in_stock = soldOut === false && amount > 0 && !hidden;
    }
  }

  const sku = vs.detail?.sku ?? vs.summary?.sku;
  if (typeof sku === "string" && sku.length > 0) out.vinoshipper_sku = sku;

  return out;
}