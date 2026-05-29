// One-shot helper: walks every active wine_product, fetches its VS counterpart,
// and locks any field where current value diverges from VS into cms_overrides.
// This prevents the first live run of vinoshipper-sync-catalog from flooding
// wine_products_pending or stomping hand-curated CMS content.
//
// Idempotent: re-running after a successful run is a no-op (values now match
// themselves, so nothing new gets locked).
//
// Auth: shared cron secret OR service-role JWT (verifyCronSecret).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { verifyCronSecret, logCronRun } from "../_shared/cronAlert.ts";
import {
  SYNC_FIELDS,
  fetchVsProduct,
  extractSyncableFields,
} from "../_shared/vinoshipperCatalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SLEEP_MS = 100;
const SOURCE_TAG = "prepopulate-2026-05-29";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!(await verifyCronSecret(req, "vinoshipper-prepopulate-overrides"))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const dryRun = Deno.env.get("DRY_RUN") === "true" || body?.dry_run === true;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  const errors: Array<{ wine_product_id?: string; vs_id?: number; error: string }> = [];
  const preview: Array<{ wine_product_id: string; handle: string; overrides: Record<string, unknown> }> = [];
  let productsProcessed = 0;
  let productsLocked = 0;
  let fieldsLocked = 0;

  try {
    const { data: rows, error: rErr } = await admin
      .from("wine_products")
      .select("id,handle,vinoshipper_product_id,title,description,image_url,price_cents,in_stock,vinoshipper_sku,cms_overrides")
      .eq("is_active", true)
      .not("vinoshipper_product_id", "is", null);
    if (rErr) throw rErr;

    for (const row of rows ?? []) {
      const vsId = Number(row.vinoshipper_product_id);
      if (!Number.isFinite(vsId)) continue;

      try {
        const vs = await fetchVsProduct(vsId);
        const proposed = extractSyncableFields(vs);
        const newOverrides: Record<string, unknown> = {};
        const lockedAt = new Date().toISOString();

        for (const field of SYNC_FIELDS) {
          const incoming = proposed[field];
          if (incoming === undefined) continue;
          const current = (row as Record<string, unknown>)[field];
          if (incoming === current) continue;
          newOverrides[field] = {
            // SEMANTIC: cms_overrides[field].value records the LAST-
            // ACKNOWLEDGED VS-SIDE VALUE — not the curated DB value. The
            // curated value lives in wine_products[field] itself; this
            // entry tracks "we've reviewed VS at this snapshot."
            // sync-catalog compares incoming VS against lock.value; if
            // they match, VS hasn't moved since we acknowledged, so no
            // pending row is created. Approve/reject update lock.value
            // to whatever VS value the admin reviewed.
            value: incoming ?? null, // VS state at lock time
            locked_at: lockedAt,
            source: SOURCE_TAG,
          };
        }

        const keys = Object.keys(newOverrides);
        if (keys.length > 0) {
          productsLocked++;
          fieldsLocked += keys.length;
          if (preview.length < 5) {
            preview.push({ wine_product_id: row.id, handle: row.handle, overrides: newOverrides });
          }
          if (!dryRun) {
            // Client-side merge preserves any existing override keys
            // (idempotent: same field re-locking is a no-op overwrite).
            const existing = (row.cms_overrides ?? {}) as Record<string, unknown>;
            const merged = { ...existing, ...newOverrides };
            const { error: uErr } = await admin
              .from("wine_products")
              .update({ cms_overrides: merged })
              .eq("id", row.id);
            if (uErr) errors.push({ wine_product_id: row.id, vs_id: vsId, error: uErr.message });
          }
        }

        productsProcessed++;
      } catch (e) {
        errors.push({ wine_product_id: row.id, vs_id: vsId, error: (e as Error).message });
      }

      await sleep(SLEEP_MS);
    }

    const result = {
      ok: true,
      products_processed: productsProcessed,
      products_locked: productsLocked,
      fields_locked: fieldsLocked,
      errors,
      dry_run: dryRun,
      preview,
    };

    await logCronRun("vinoshipper-prepopulate-overrides", "ok", {
      httpStatus: 200,
      metadata: {
        products_processed: productsProcessed,
        products_locked: productsLocked,
        fields_locked: fieldsLocked,
        errors: errors.length,
        dry_run: dryRun,
      },
    });

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await logCronRun("vinoshipper-prepopulate-overrides", "error", { httpStatus: 500, error: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});