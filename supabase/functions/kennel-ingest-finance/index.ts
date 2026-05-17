// QuickBooks finance ingest for The Kennel (COGS, Cost of Sales, Operating Expenses).
// Lindy POSTs daily expense rows here from QuickBooks.
// Auth: x-kennel-secret header (= KENNEL_INGEST_SECRET) or service-role apikey.
// Idempotent: upsert on (date, dim_hash). External QB txn id stabilizes dim_hash.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kennel-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ALLOWED_CATEGORIES = new Set(["cogs", "cost_of_sales", "operating_expense"]);

type Row = {
  date: string;
  category: string;
  subcategory?: string | null;
  account?: string | null;
  account_id?: string | null;
  vendor?: string | null;
  memo?: string | null;
  amount_cents?: number;
  currency?: string;
  source?: string;
  external_id?: string | null;
  metadata?: Record<string, unknown>;
};

function clean(r: Row) {
  return {
    date: r.date,
    category: r.category,
    subcategory: r.subcategory ?? null,
    account: r.account ?? null,
    account_id: r.account_id ?? null,
    vendor: r.vendor ?? null,
    memo: r.memo ?? null,
    amount_cents: Math.round(Number(r.amount_cents ?? 0)),
    currency: (r.currency ?? "USD").toUpperCase().slice(0, 3),
    source: r.source ?? "lindy_quickbooks",
    external_id: r.external_id ?? null,
    metadata: r.metadata ?? {},
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return J(405, { error: "POST only" });

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

  const cleaned: ReturnType<typeof clean>[] = [];
  const errors: { index: number; reason: string }[] = [];
  rows.forEach((r, i) => {
    if (!r?.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
      errors.push({ index: i, reason: "date must be YYYY-MM-DD" }); return;
    }
    if (!r?.category || !ALLOWED_CATEGORIES.has(r.category)) {
      errors.push({ index: i, reason: `category must be one of ${[...ALLOWED_CATEGORIES].join(", ")}` }); return;
    }
    if (r.amount_cents === undefined || r.amount_cents === null || Number.isNaN(Number(r.amount_cents))) {
      errors.push({ index: i, reason: "amount_cents required (integer cents)" }); return;
    }
    cleaned.push(clean(r));
  });
  if (errors.length && cleaned.length === 0) return J(400, { error: "all rows invalid", errors });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  let written = 0;
  for (let i = 0; i < cleaned.length; i += 500) {
    const chunk = cleaned.slice(i, i + 500);
    const { data, error } = await sb
      .from("business_expense_facts")
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