// Fetches the Vinoshipper producer's product catalog (wine + non-wine merch).
// Returns a normalized list { id, sku, name, type } used by the admin
// /v3/admin/printful-sim page to auto-link Printful sync variants to VS
// productIds by SKU match.
//
// Auth: any authenticated caller (verify_jwt = false in config; we don't expose
// secrets, just the producer's own catalog).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const VS_BASE = "https://vinoshipper.com/api/v3/p";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const keyId = Deno.env.get("VINOSHIPPER_API_KEY_ID");
  const secret = Deno.env.get("VINOSHIPPER_API_SECRET");
  const producerId = Deno.env.get("VINOSHIPPER_PRODUCER_ID");
  if (!keyId || !secret) {
    return new Response(JSON.stringify({ error: "VS credentials missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const auth = `Basic ${btoa(`${keyId}:${secret}`)}`;

  // Try the most likely product-listing endpoints in order; Vinoshipper's API
  // surface varies by account, so we fall back gracefully.
  const candidates = [
    `${VS_BASE}/products`,
    `${VS_BASE}/products/search`,
    producerId ? `https://vinoshipper.com/api/v3/producers/${producerId}/products` : null,
  ].filter(Boolean) as string[];

  const attempts: Array<{ url: string; status: number; body?: string }> = [];
  let products: any[] = [];

  for (const url of candidates) {
    try {
      const r = await fetch(url, {
        method: url.endsWith("/search") ? "POST" : "GET",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: url.endsWith("/search") ? JSON.stringify({ limit: 500, offset: 0 }) : undefined,
      });
      const text = await r.text();
      attempts.push({ url, status: r.status, body: r.ok ? undefined : text.slice(0, 200) });
      if (!r.ok) continue;
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { continue; }
      const list = Array.isArray(parsed) ? parsed : (parsed.products ?? parsed.results ?? parsed.data ?? []);
      if (Array.isArray(list) && list.length >= 0) {
        products = list;
        break;
      }
    } catch (e) {
      attempts.push({ url, status: 0, body: String(e).slice(0, 200) });
    }
  }

  const normalized = products.map((p: any) => ({
    id: String(p.id ?? p.productId ?? p.product_id ?? ""),
    sku: String(p.summary?.sku ?? p.detail?.sku ?? p.sku ?? p.SKU ?? p.code ?? ""),
    name: p.summary?.name ?? p.detail?.fullName ?? p.name ?? p.title ?? "",
    type: p.taxonomy?.packagedAlcohol === false ? "non_wine" : (p.taxonomy?.packagedAlcohol ? "wine" : undefined),
    status: p.status,
  })).filter((p: any) => p.id);

  return new Response(JSON.stringify({ ok: true, count: normalized.length, products: normalized, attempts }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});