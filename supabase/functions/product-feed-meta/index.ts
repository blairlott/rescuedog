// Phase 4 #22 — Public Meta Catalog product feed.
// CSV per Meta spec: https://developers.facebook.com/docs/marketing-api/catalog/reference
// Wine routes deep-link to Vinoshipper; merch links to the headless storefront.
// GET /functions/v1/product-feed-meta?rail=wine|merch|all  (default all)
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE = "https://rescuedog.lovable.app";

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/"/g, '""').replace(/\r?\n/g, " ");
  return /[",]/.test(s) ? `"${s}"` : s;
}

function row(o: Record<string, any>, cols: string[]) {
  return cols.map((c) => csvEscape(o[c])).join(",");
}

async function fetchShopifyMerch(): Promise<any[]> {
  const domain = Deno.env.get("SHOPIFY_STORE_DOMAIN") ?? "";
  const token = Deno.env.get("SHOPIFY_STOREFRONT_ACCESS_TOKEN") ?? "";
  if (!domain || !token) return [];
  const query = `query { products(first: 100) { edges { node {
    id handle title description vendor productType availableForSale tags
    featuredImage { url }
    priceRange { minVariantPrice { amount currencyCode } }
  } } } }`;
  try {
    const r = await fetch(`https://${domain}/api/2025-07/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": token,
      },
      body: JSON.stringify({ query }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.data?.products?.edges ?? []).map((e: any) => e.node);
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: setting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "product_feed_meta_enabled")
    .maybeSingle();
  if (setting && setting.value === false) {
    return new Response("disabled", { status: 503, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const rail = (url.searchParams.get("rail") ?? "all").toLowerCase();

  const cols = [
    "id", "title", "description", "availability", "condition", "price", "link",
    "image_link", "brand", "google_product_category", "product_type",
    "custom_label_0", "custom_label_1",
  ];
  const lines: string[] = [cols.join(",")];

  if (rail === "wine" || rail === "all") {
    const { data: wines } = await admin
      .from("wine_products")
      .select("handle,title,description,price_cents,image_url,varietal,vintage,in_stock,is_active,tags")
      .eq("is_active", true);
    for (const w of wines ?? []) {
      lines.push(row({
        id: `wine-${w.handle}`,
        title: w.title,
        description: (w.description ?? w.title).slice(0, 5000),
        availability: w.in_stock ? "in stock" : "out of stock",
        condition: "new",
        price: `${((w.price_cents ?? 0) / 100).toFixed(2)} USD`,
        link: `${SITE}/wines/${w.handle}`,
        image_link: w.image_url ?? "",
        brand: "Rescue Dog Wines",
        google_product_category: "Food, Beverages & Tobacco > Beverages > Alcoholic Beverages > Wine",
        product_type: w.varietal ?? "Wine",
        custom_label_0: "wine",
        custom_label_1: w.vintage ? String(w.vintage) : "",
      }, cols));
    }
  }

  if (rail === "merch" || rail === "all") {
    const merch = await fetchShopifyMerch();
    for (const p of merch) {
      const price = p.priceRange?.minVariantPrice?.amount;
      const currency = p.priceRange?.minVariantPrice?.currencyCode ?? "USD";
      lines.push(row({
        id: `merch-${p.handle}`,
        title: p.title,
        description: (p.description ?? p.title).slice(0, 5000),
        availability: p.availableForSale ? "in stock" : "out of stock",
        condition: "new",
        price: price ? `${Number(price).toFixed(2)} ${currency}` : "",
        link: `${SITE}/merch/${p.handle}`,
        image_link: p.featuredImage?.url ?? "",
        brand: "Rescue Dog",
        google_product_category: "Apparel & Accessories",
        product_type: p.productType ?? "Apparel",
        custom_label_0: "merch",
        custom_label_1: "",
      }, cols));
    }
  }

  return new Response(lines.join("\n"), {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=900",
      "Content-Disposition": 'inline; filename="rdw-meta-feed.csv"',
    },
  });
});