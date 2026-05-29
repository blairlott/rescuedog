// Vinoshipper → wine_products catalog sync (Phase B).
//
// Unlike vinoshipper-sync-prices (which pulls the bulk catalog and only writes
// price/stock), this fetches each product individually via /products/{id} and
// syncs the broader SYNC_FIELDS set. Fields listed in wine_products.cms_overrides
// are NOT written through — instead, drift is staged in wine_products_pending
// for admin review.
//
// Defensive: if VS returns undefined for a field where we hold real data, we
// SKIP rather than blank it out.
//
// Auth: shared cron secret OR service-role JWT (verifyCronSecret).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { verifyCronSecret, logCronRun } from "../_shared/cronAlert.ts";
import {
  SYNC_FIELDS,
  type SyncField,
  fetchVsProduct,
  extractSyncableFields,
} from "../_shared/vinoshipperCatalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SLEEP_MS = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isNonEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.length > 0;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!(await verifyCronSecret(req, "vinoshipper-sync-catalog"))) {
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
  const defensiveSkips: Array<{ wine_product_id: string; field: SyncField; reason: string }> = [];
  let writeThroughCount = 0;
  let pendingCreatedCount = 0;
  let productsProcessed = 0;

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
        const overrides = (row.cms_overrides ?? {}) as Record<string, unknown>;
        const updatePatch: Record<string, unknown> = {};

        for (const field of SYNC_FIELDS) {
          const incoming = proposed[field];
          const current = (row as Record<string, unknown>)[field];

          if (incoming === undefined) {
            if (isNonEmpty(current)) {
              defensiveSkips.push({
                wine_product_id: row.id,
                field,
                reason: "VS returned undefined; preserving existing value",
              });
            }
            continue;
          }

          if (incoming === current) continue;

          if (Object.prototype.hasOwnProperty.call(overrides, field)) {
            // Staged for admin review (no live write).
            if (!dryRun) {
              const { error: upErr } = await admin
                .from("wine_products_pending")
                .upsert(
                  {
                    wine_product_id: row.id,
                    field,
                    proposed_value: incoming as any,
                    current_value: (current ?? null) as any,
                    status: "pending",
                  },
                  { onConflict: "wine_product_id,field" },
                );
              if (upErr) {
                errors.push({ wine_product_id: row.id, vs_id: vsId, error: `pending upsert: ${upErr.message}` });
                continue;
              }
            }
            pendingCreatedCount++;
          } else {
            updatePatch[field] = incoming;
            writeThroughCount++;
          }
        }

        if (Object.keys(updatePatch).length > 0 && !dryRun) {
          updatePatch.last_synced_at = new Date().toISOString();
          const { error: uErr } = await admin.from("wine_products").update(updatePatch).eq("id", row.id);
          if (uErr) errors.push({ wine_product_id: row.id, vs_id: vsId, error: uErr.message });
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
      write_through_count: writeThroughCount,
      pending_created_count: pendingCreatedCount,
      defensive_skips: defensiveSkips,
      errors,
      dry_run: dryRun,
    };

    await logCronRun("vinoshipper-sync-catalog", errors.length > 5 ? "error" : "ok", {
      httpStatus: 200,
      error: errors.length > 5 ? `${errors.length} per-product errors` : undefined,
      metadata: {
        products_processed: productsProcessed,
        write_through_count: writeThroughCount,
        pending_created_count: pendingCreatedCount,
        defensive_skips: defensiveSkips.length,
        errors: errors.length,
        dry_run: dryRun,
      },
    });

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await logCronRun("vinoshipper-sync-catalog", "error", { httpStatus: 500, error: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});