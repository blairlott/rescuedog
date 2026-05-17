// Finance ingest for The Kennel (QuickBooks → Supabase).
// Lindy POSTs expense / revenue / COGS / refund / adjustment / transfer rows here.
// Auth: x-kennel-secret header (= KENNEL_INGEST_SECRET).
// Idempotent: upsert on external_id — re-runs overwrite, never duplicate.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kennel-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const ALLOWED_ENTRY_TYPES = new Set([
  "expense",
  "revenue",
  "cogs",
  "refund",
  "adjustment",
  "transfer",
]);

type Row = {
  date: string;
  entry_type: string;
  category: string;
  subcategory?: string | null;
  account_name?: string | null;
  account_code?: string | null;
  vendor?: string | null;
  memo?: string | null;
  amount_cents: number;
  currency?: string | null;
  sku?: string | null;
  units?: number | null;
  state?: string | null;
  channel?: string | null;
  external_id: string;
  source?: string | null;
};

// QuickBooks → channel/subcategory derivation when not explicitly provided.
function deriveTags(r: Row): { channel: string | null; subcategory: string | null; state: string | null } {
  const name = `${r.account_name ?? ""} ${r.memo ?? ""} ${r.vendor ?? ""}`.toLowerCase();
  let channel = r.channel ?? null;
  let subcategory = r.subcategory ?? null;
  let state = r.state ?? null;

  if (!subcategory) {
    if (name.includes("meta") || name.includes("facebook") || name.includes("instagram")) {
      subcategory = "meta_ads";
      channel = channel ?? "dtc";
    } else if (name.includes("google ads") || name.includes("adwords")) {
      subcategory = "google_ads";
      channel = channel ?? "dtc";
    } else if (name.includes("instacart")) {
      subcategory = "instacart_ads";
      channel = channel ?? "dtc";
    }
  }

  return { channel, subcategory, state };
}

function clean(r: Row) {
  const derived = deriveTags(r);
  return {
    external_id: String(r.external_id),
    date: r.date,
    entry_type: r.entry_type,
    category: r.category,
    subcategory: derived.subcategory,
    account_name: r.account_name ?? null,
    account_code: r.account_code ?? null,
    vendor: r.vendor ?? null,
    memo: r.memo ?? null,
    amount_cents: Math.round(Number(r.amount_cents)),
    currency: r.currency ?? "USD",
    sku: r.sku ?? null,
    units: r.units == null ? null : Math.round(Number(r.units)),
    state: derived.state ? String(derived.state).toUpperCase() : null,
    channel: derived.channel,
    source: r.source ?? "quickbooks",
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return J(405, { error: "method_not_allowed" });

  const expected = Deno.env.get("KENNEL_INGEST_SECRET");
  const provided = req.headers.get("x-kennel-secret");
  if (!expected || provided !== expected) {
    return J(401, { error: "unauthorized" });
  }

  let body: { rows?: Row[] };
  try {
    body = await req.json();
  } catch {
    return J(400, { error: "invalid_json" });
  }

  const rows = body?.rows ?? [];
  if (!Array.isArray(rows)) return J(400, { error: "rows_must_be_array" });
  if (rows.length === 0) {
    return J(200, { ok: true, received: 0, written: 0, skipped: 0, errors: [] });
  }
  if (rows.length > 5000) {
    return J(413, { error: "batch_too_large", max: 5000 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const errors: string[] = [];
  const valid: ReturnType<typeof clean>[] = [];
  let skipped = 0;

  for (const r of rows) {
    if (!r?.external_id || !r?.date || !r?.entry_type || !r?.category || r?.amount_cents == null) {
      errors.push(`missing required fields: ${r?.external_id ?? "unknown"}`);
      skipped++;
      continue;
    }
    if (!ALLOWED_ENTRY_TYPES.has(r.entry_type)) {
      errors.push(`${r.external_id}: invalid entry_type "${r.entry_type}"`);
      skipped++;
      continue;
    }
    if (!Number.isFinite(Number(r.amount_cents))) {
      errors.push(`${r.external_id}: amount_cents not a number`);
      skipped++;
      continue;
    }
    valid.push(clean(r));
  }

  let written = 0;
  if (valid.length) {
    // Chunk upserts to keep payloads modest.
    const CHUNK = 500;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const slice = valid.slice(i, i + CHUNK);
      const { error, count } = await supabase
        .from("bm_finance_entries")
        .upsert(slice, { onConflict: "external_id", count: "exact" });
      if (error) {
        errors.push(`chunk ${i}: ${error.message}`);
        skipped += slice.length;
      } else {
        written += count ?? slice.length;
      }
    }
  }

  return J(200, {
    ok: errors.length === 0,
    received: rows.length,
    written,
    skipped,
    errors,
  });
});