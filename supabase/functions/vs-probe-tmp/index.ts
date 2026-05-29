// Temporary VS endpoint probe. Tests detail-by-ID and several list endpoints.
// Delete after design approval.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BASE = "https://vinoshipper.com/api/v3";

function auth() {
  const id = Deno.env.get("VINOSHIPPER_API_KEY_ID")!;
  const secret = Deno.env.get("VINOSHIPPER_API_SECRET")!;
  return `Basic ${btoa(`${id}:${secret}`)}`;
}

async function probe(path: string) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: auth(), Accept: "application/json" },
  });
  const text = await r.text();
  return { path, status: r.status, body: text.slice(0, 500) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // (a) Detail by ID
  const detailR = await fetch(`${BASE}/p/orders/96444125012`, {
    headers: { Authorization: auth(), Accept: "application/json" },
  });
  const detailText = await detailR.text();
  let detailJson: any = null;
  try { detailJson = JSON.parse(detailText); } catch {}
  const detail = {
    status: detailR.status,
    top_keys: detailJson && typeof detailJson === "object" ? Object.keys(detailJson) : null,
    fields: detailJson ? {
      orderNumber: detailJson.orderNumber,
      purchasedAt: detailJson.purchasedAt,
      saleAmount: detailJson.saleAmount,
      shipToAddress: detailJson.shipToAddress,
      customer_email: detailJson.customer?.email ?? detailJson.customerEmail,
      orderStatus: detailJson.orderStatus,
    } : null,
    raw_preview: detailText.slice(0, 800),
  };

  // (b) List endpoint probes — check if from/to actually filters
  async function listProbe(path: string) {
    const r = await fetch(`${BASE}${path}`, {
      headers: { Authorization: auth(), Accept: "application/json" },
    });
    const text = await r.text();
    let j: any = null; try { j = JSON.parse(text); } catch {}
    const results = Array.isArray(j?.results) ? j.results : null;
    return {
      path,
      status: r.status,
      total_keys: j && typeof j === "object" && !Array.isArray(j) ? Object.keys(j) : null,
      result_count: results?.length ?? null,
      first_order_date: results?.[0]?.purchasedAt ?? results?.[0]?.orderDate ?? null,
      last_order_date: results?.[results.length - 1]?.purchasedAt ?? results?.[results.length - 1]?.orderDate ?? null,
      first_order_number: results?.[0]?.orderNumber ?? null,
      last_order_number: results?.[results.length - 1]?.orderNumber ?? null,
      body_preview: text.slice(0, 300),
    };
  }
  const list = await Promise.all([
    listProbe("/p/orders?from=2026-05-18&to=2026-05-21"),
    listProbe("/p/orders?from=2026-05-18&to=2026-05-21&limit=100"),
    listProbe("/p/orders/search?from=2026-05-18&to=2026-05-21"),
    listProbe("/p/orders?startDate=2026-05-18&endDate=2026-05-21"),
    listProbe("/p/orders/by-month/2026-05"),
    listProbe("/p/orders/list"),
  ]);

  return new Response(JSON.stringify({ detail, list }, null, 2), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});