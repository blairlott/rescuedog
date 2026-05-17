// shopify-wine-mirror-sync (v2 sandbox)
//
// Mirrors public.wine_products -> Shopify as products tagged `v2-test wine`.
// Shopify is system of record for CART + PAYMENT only; Vinoshipper remains
// source of truth for inventory, compliance, and fulfillment. We mirror only
// the fields needed to render a checkout line and route an order webhook.
//
// Idempotent (lookup-by-handle, upsert). Safe to re-run.
// Today: returns a DRY_RUN diff plan so Lindy/Claude can review before flip.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SHOPIFY_API_VERSION = "2025-07";
const SHOP_DOMAIN = Deno.env.get("SHOPIFY_SHOP_DOMAIN") ?? "home-45-new-fashion.myshopify.com";
const ADMIN_TOKEN = Deno.env.get("SHOPIFY_ADMIN_TOKEN") ?? "";
const DRY_RUN = (Deno.env.get("V2_MIRROR_DRY_RUN") ?? "true").toLowerCase() !== "false";
const MIRROR_TAGS = ["v2-test", "wine", "vinoshipper-fulfilled"];

type WineRow = {
  handle: string;
  title: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  gallery_urls: string[] | null;
  sku: string | null;
  is_active: boolean;
};

type MirrorAction =
  | { op: "create"; handle: string; reason: string }
  | { op: "update"; handle: string; reason: string; diff: Record<string, unknown> }
  | { op: "skip"; handle: string; reason: string };

async function adminGraphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  if (!ADMIN_TOKEN) return null;
  const res = await fetch(`https://${SHOP_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    console.error("[mirror] admin HTTP", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  if (json.errors) {
    console.error("[mirror] admin gql errors", json.errors);
    return null;
  }
  return json.data as T;
}

const PRODUCT_BY_HANDLE = `
  query($handle: String!) {
    productByHandle(handle: $handle) {
      id title handle tags
      variants(first: 1) { edges { node { id sku price } } }
    }
  }
`;

function diffWineVsShopify(wine: WineRow, shopify: any): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (shopify.title !== wine.title) out.title = { from: shopify.title, to: wine.title };
  const tagSet = new Set((shopify.tags ?? []).map((t: string) => t.toLowerCase()));
  const missingTags = MIRROR_TAGS.filter((t) => !tagSet.has(t));
  if (missingTags.length) out.tags = { add: missingTags };
  const variant = shopify.variants?.edges?.[0]?.node;
  const desiredPrice = (wine.price_cents / 100).toFixed(2);
  if (variant && variant.price !== desiredPrice) {
    out.price = { from: variant.price, to: desiredPrice };
  }
  if (wine.sku && variant && variant.sku !== wine.sku) {
    out.sku = { from: variant.sku, to: wine.sku };
  }
  return Object.keys(out).length ? out : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: wines, error } = await supabase
    .from("wine_products")
    .select("handle,title,description,price_cents,image_url,gallery_urls,sku,is_active")
    .eq("is_active", true);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const actions: MirrorAction[] = [];

  for (const wine of (wines ?? []) as WineRow[]) {
    const existing = await adminGraphql<{ productByHandle: any | null }>(
      PRODUCT_BY_HANDLE,
      { handle: wine.handle },
    );
    if (!existing || !existing.productByHandle) {
      actions.push({ op: "create", handle: wine.handle, reason: "missing in Shopify" });
      continue;
    }
    const diff = diffWineVsShopify(wine, existing.productByHandle);
    if (diff) {
      actions.push({ op: "update", handle: wine.handle, reason: "fields drifted", diff });
    } else {
      actions.push({ op: "skip", handle: wine.handle, reason: "in sync" });
    }
  }

  // TODO(Phase 2): when DRY_RUN=false, execute productCreate / productUpdate
  // + productVariantUpdate. Log each result to a `mirror_sync_log` table.

  const summary = {
    dry_run: DRY_RUN,
    shop: SHOP_DOMAIN,
    counts: {
      total: actions.length,
      create: actions.filter((a) => a.op === "create").length,
      update: actions.filter((a) => a.op === "update").length,
      skip: actions.filter((a) => a.op === "skip").length,
    },
    actions,
  };

  return new Response(JSON.stringify(summary, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
