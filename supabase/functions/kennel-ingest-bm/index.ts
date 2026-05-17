// Brick-and-mortar revenue ingest for The Kennel.
// Lindy POSTs daily depletion / off-premise / on-premise rows here.
// Auth: either x-kennel-secret header (= KENNEL_INGEST_SECRET) or service-role apikey.
// Idempotent: upsert on (date, dim_hash) — re-runs overwrite, never duplicate.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kennel-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ALLOWED_CHANNELS = new Set([
  "brick_mortar_off",
  "brick_mortar_on",
  "distributor_depletion",
]);

type Row = {
  date: string;
  channel: string;
  state?: string | null;
  sku?: string | null;
  product_name?: string | null;
  customer_segment?: string | null;
  orders?: number;
  units?: number;
  gross_revenue_cents?: number;
  discount_cents?: number;
  shipping_cents?: number;
  tax_cents?: number;
  net_revenue_cents?: number;
  cogs_cents?: number;
  margin_cents?: number;
  unique_customers?: number;
  source?: string;
};

function clean(r: Row) {
  const grossC = Math.round(Number(r.gross_revenue_cents ?? 0));
  const discC = Math.round(Number(r.discount_cents ?? 0));
  const netC = Math.round(Number(r.net_revenue_cents ?? (grossC - discC)));
  const cogsC = Math.round(Number(r.cogs_cents ?? 0));
  const marginC = Math.round(Number(r.margin_cents ?? (netC - cogsC)));
  return {
    date: r.date,
    channel: r.channel,
    sku: r.sku ?? null,
    product_name: r.product_name ?? null,
    state: r.state ? String(r.state).toUpperCase().slice(0, 2) : null,
    customer_segment: r.customer_segment ?? null,
    orders: Math.round(Number(r.orders ?? 1)),
    units: Math.round(Number(r.units ?? 0)),
    gross_revenue_cents: grossC,
    discount_cents: discC,
    shipping_cents: Math.round(Number(r.shipping_cents ?? 0)),
    tax_cents: Math.round(Number(r.tax_cents ?? 0)),
    net_revenue_cents: netC,
    cogs_cents: cogsC,
    margin_cents: marginC,
    unique_customers: Math.round(Number(r.unique_customers ?? 0)),
    source: r.source ?? "lindy_bm",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return J(405, { error: "POST only" });

  // Auth
  const secret = req.headers.get("x-kennel-secret");
  const apikey = req.headers.get("apikey");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const expected = Deno.env.get("KENNEL_INGEST_SECRET");
  const ok = (expected && secret === expected) || (apikey && apikey === serviceKey);
  if (!ok) return J(401, { error: "unauthorized" });

  let body: { rows?: Row[] };
  try { body = await req.json(); } catch { return J(400, { error: "invalid json" }); }
  const rows = Array.isArray(body?.rows) ? body!.rows! : [];
  if (!rows.length) return J(400, { error: "rows[] required" });
  if (rows.length > 5000) return J(400, { error: "max 5000 rows per request" });

  // Validate
  const cleaned: ReturnType<typeof clean>[] = [];
  const errors: { index: number; reason: string }[] = [];
  rows.forEach((r, i) => {
    if (!r?.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
      errors.push({ index: i, reason: "date must be YYYY-MM-DD" }); return;
    }
    if (!r?.channel || !ALLOWED_CHANNELS.has(r.channel)) {
      errors.push({ index: i, reason: `channel must be one of ${[...ALLOWED_CHANNELS].join(", ")}` }); return;
    }
    cleaned.push(clean(r));
  });
  if (errors.length && cleaned.length === 0) return J(400, { error: "all rows invalid", errors });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  // Chunked upsert (500/batch)
  let written = 0;
  for (let i = 0; i < cleaned.length; i += 500) {
    const chunk = cleaned.slice(i, i + 500);
    const { data, error } = await sb
      .from("business_revenue_facts")
      .upsert(chunk, { onConflict: "date,dim_hash" })
      .select("id");
    if (error) return J(500, { error: error.message, written, errors });
    written += data?.length ?? 0;
  }

  return J(200, {
    ok: true,
    received: rows.length,
    written,
    skipped: errors.length,
    errors: errors.slice(0, 20),
  });
});