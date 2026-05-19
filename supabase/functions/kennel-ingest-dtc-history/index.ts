// DTC historical orders ingest for The Kennel.
// Accepts either:
//   - x-kennel-secret header (= KENNEL_INGEST_SECRET)   → Lindy / server jobs
//   - Authenticated ad-ops Bearer JWT                    → browser CSV upload
// Idempotent: upsert on external_id.
// Writes to public.dtc_historical_orders (separate from live `orders`).
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

type Row = {
  external_id: string;
  order_date: string;
  source?: string | null;
  channel?: string | null;
  customer_email?: string | null;
  ship_state?: string | null;
  ship_zip?: string | null;
  currency?: string | null;
  subtotal_cents?: number | null;
  shipping_cents?: number | null;
  tax_cents?: number | null;
  total_cents?: number | null;
  units?: number | null;
  sku?: string | null;
  raw?: Record<string, unknown> | null;
};

function clean(r: Row) {
  return {
    external_id: String(r.external_id),
    order_date: r.order_date,
    source: r.source ?? "vinoshipper_csv",
    channel: r.channel ?? "dtc",
    customer_email: r.customer_email?.toLowerCase().trim() || null,
    ship_state: r.ship_state ? String(r.ship_state).toUpperCase().trim() : null,
    ship_zip: r.ship_zip ?? null,
    currency: r.currency ?? "USD",
    subtotal_cents: Math.round(Number(r.subtotal_cents ?? 0)),
    shipping_cents: Math.round(Number(r.shipping_cents ?? 0)),
    tax_cents: Math.round(Number(r.tax_cents ?? 0)),
    total_cents: Math.round(Number(r.total_cents ?? 0)),
    units: r.units == null ? null : Math.round(Number(r.units)),
    sku: r.sku ?? null,
    raw: r.raw ?? {},
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return J(405, { error: "method_not_allowed" });

  // Auth: either shared secret OR ad-ops Bearer token.
  const expectedSecret = Deno.env.get("KENNEL_INGEST_SECRET");
  const providedSecret = req.headers.get("x-kennel-secret");
  let authorized = !!expectedSecret && providedSecret === expectedSecret;
  let actor = "lindy";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  if (!authorized) {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (bearer) {
      const { data: userRes, error: uerr } = await supabase.auth.getUser(bearer);
      if (!uerr && userRes?.user) {
        const { data: isOps } = await supabase.rpc("is_ad_ops", { _user_id: userRes.user.id });
        if (isOps === true) {
          authorized = true;
          actor = userRes.user.email ?? userRes.user.id;
        }
      }
    }
  }

  if (!authorized) return J(401, { error: "unauthorized" });

  let body: { rows?: Row[] };
  try {
    body = await req.json();
  } catch {
    return J(400, { error: "invalid_json" });
  }

  const rows = body?.rows ?? [];
  if (!Array.isArray(rows)) return J(400, { error: "rows_must_be_array" });
  if (rows.length === 0) {
    return J(200, { ok: true, received: 0, written: 0, skipped: 0, errors: [], actor });
  }
  if (rows.length > 5000) {
    return J(413, { error: "batch_too_large", max: 5000 });
  }

  const errors: string[] = [];
  const valid: ReturnType<typeof clean>[] = [];
  let skipped = 0;

  for (const r of rows) {
    if (!r?.external_id || !r?.order_date) {
      errors.push(`missing external_id or order_date: ${r?.external_id ?? "unknown"}`);
      skipped++;
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.order_date)) {
      errors.push(`${r.external_id}: order_date must be YYYY-MM-DD`);
      skipped++;
      continue;
    }
    valid.push(clean(r));
  }

  let written = 0;
  if (valid.length) {
    const CHUNK = 500;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const slice = valid.slice(i, i + CHUNK);
      const { error, count } = await supabase
        .from("dtc_historical_orders")
        .upsert(slice, { onConflict: "external_id", count: "exact" });
      if (error) {
        errors.push(`chunk ${i}: ${error.message}`);
        skipped += slice.length;
      } else {
        written += count ?? slice.length;
      }
    }
  }

  // Log run to kennel_ingest_runs so health-check + dashboard widget pick it up.
  try {
    await supabase.from("kennel_ingest_runs").insert({
      target: "dtc_history",
      status: errors.length === 0 ? "ok" : "partial",
      payload: { received: rows.length, written, skipped, errors, actor },
    });
  } catch (_) { /* non-fatal */ }

  return J(200, {
    ok: errors.length === 0,
    received: rows.length,
    written,
    skipped,
    errors,
    actor,
  });
});