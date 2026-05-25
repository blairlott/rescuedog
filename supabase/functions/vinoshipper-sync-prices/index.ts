// Vinoshipper → wine_products price sync. Vinoshipper is the source of truth
// for all wine pricing site-wide. This function pulls the producer catalog and
// updates price_cents, club_price_cents, in_stock, last_synced_at on every
// matching row in public.wine_products (matched by vinoshipper_product_id).
//
// Defensive on VS response shape: probes several known price field paths.
// Returns a per-row diff so the admin UI can show what changed.
//
// Auth: shared cron secret OR admin/owner JWT (verifyCronSecret accepts JWT
// fallback for internal calls).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { checkSharedSecret, logCronRun } from "../_shared/cronAlert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VS_BASE = "https://vinoshipper.com/api/v3/p";

type RawProduct = Record<string, any>;

/** Try every known VS price field path; return cents or null. */
function extractCents(p: RawProduct, kind: "regular" | "club"): number | null {
  const candidates: any[] = kind === "regular"
    ? [
        p?.price?.unitPrice, p?.price?.msrp, p?.price?.price,
        p?.pricing?.regular, p?.pricing?.consumer, p?.pricing?.retail, p?.pricing?.price,
        p?.prices?.regular, p?.prices?.consumer, p?.prices?.retail,
        p?.detail?.price, p?.summary?.price, p?.price, p?.unitPrice, p?.retailPrice,
        p?.priceBreaks?.[0]?.price,
      ]
    : [
        p?.price?.clubPrice, p?.price?.memberPrice, p?.price?.club,
        p?.pricing?.club, p?.pricing?.member, p?.pricing?.wineClub,
        p?.prices?.club, p?.prices?.member, p?.prices?.wineClub,
        p?.detail?.clubPrice, p?.summary?.clubPrice, p?.clubPrice, p?.memberPrice,
        p?.priceBreaks?.find?.((b: any) => /club|member/i.test(String(b?.label ?? "")))?.price,
      ];
  for (const v of candidates) {
    if (v == null) continue;
    if (typeof v === "object") continue;
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    // Heuristic: VS returns dollars (e.g. 29.99). Anything < 1000 we treat as dollars.
    return n < 1000 ? Math.round(n * 100) : Math.round(n);
  }
  return null;
}

function extractInStock(p: RawProduct): boolean {
  const status = String(p?.status ?? p?.summary?.status ?? "").toUpperCase();
  if (status === "SOLD_OUT" || status === "HIDDEN" || status === "INACTIVE" || status === "DRAFT") return false;
  if (p?.inventory?.soldOut === true) return false;
  if (typeof p?.inventory?.amount === "number" && p.inventory.amount <= 0) return false;
  if (status === "LIVE" || status === "ACTIVE" || status === "AVAILABLE") return true;
  if (typeof p?.inStock === "boolean") return p.inStock;
  if (typeof p?.available === "boolean") return p.available;
  return true;
}

async function fetchVsCatalog(auth: string, producerId: string | null) {
  const candidates = [
    `${VS_BASE}/products`,
    producerId ? `https://vinoshipper.com/api/v3/producers/${producerId}/products` : null,
  ].filter(Boolean) as string[];
  for (const url of candidates) {
    const r = await fetch(url, {
      method: "GET",
      headers: { Authorization: auth, "Content-Type": "application/json" },
    });
    if (!r.ok) continue;
    const text = await r.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { continue; }
    const list = Array.isArray(parsed) ? parsed : (parsed.products ?? parsed.results ?? parsed.data ?? []);
    if (Array.isArray(list) && list.length > 0) return { url, list: list as RawProduct[] };
  }
  return { url: null, list: [] as RawProduct[] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Auth: admin/owner JWT OR service-role bearer OR x-cron-secret header.
  const authHeader = req.headers.get("Authorization") || "";
  let isAuthorized = false;
  if (await checkSharedSecret(req, { functionName: "vinoshipper-sync-prices", envVar: "CRON_SECRET", headers: ["x-cron-secret"], alertOnFail: false })) {
    isAuthorized = true;
  } else if (authHeader.includes(SERVICE)) {
    isAuthorized = true;
  } else if (authHeader) {
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (user) {
      const { data: ok } = await userClient.rpc("is_admin_or_owner", { _user_id: user.id });
      if (ok) isAuthorized = true;
    }
  }
  if (!isAuthorized) {
    await logCronRun("vinoshipper-sync-prices", "auth_fail", { httpStatus: 401, error: "unauthorized" });
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const keyId = Deno.env.get("VINOSHIPPER_API_KEY_ID");
  const secret = Deno.env.get("VINOSHIPPER_API_SECRET");
  const producerId = Deno.env.get("VINOSHIPPER_PRODUCER_ID") ?? null;
  if (!keyId || !secret) {
    await logCronRun("vinoshipper-sync-prices", "error", { httpStatus: 500, error: "VS credentials missing" });
    return new Response(JSON.stringify({ ok: false, error: "VS credentials missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const auth = `Basic ${btoa(`${keyId}:${secret}`)}`;

  let dryRun = false;
  let returnSample = false;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
    returnSample = body?.return_sample === true;
  } catch { /* GET / no body */ }

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  try {
    const { url, list } = await fetchVsCatalog(auth, producerId);
    if (list.length === 0) {
      await logCronRun("vinoshipper-sync-prices", "error", { httpStatus: 502, error: "empty VS catalog" });
      return new Response(JSON.stringify({ ok: false, error: "empty VS catalog", source_url: url }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rows, error: rErr } = await admin
      .from("wine_products")
      .select("id,handle,vinoshipper_product_id,price_cents,club_price_cents,in_stock");
    if (rErr) throw rErr;

    const byId = new Map<string, RawProduct>();
    for (const p of list) byId.set(String(p.id ?? p.productId ?? p.product_id ?? ""), p);

    const changes: Array<Record<string, unknown>> = [];
    const unmatched: string[] = [];
    const missingPrice: string[] = [];

    for (const row of rows ?? []) {
      const vsId = row.vinoshipper_product_id;
      if (!vsId) { unmatched.push(row.handle); continue; }
      const vs = byId.get(String(vsId));
      if (!vs) { unmatched.push(row.handle); continue; }
      const newPrice = extractCents(vs, "regular");
      // Club price is always 20% off retail (business rule, not from VS).
      const newClub = newPrice != null ? Math.round(newPrice * 0.80) : null;
      const newStock = extractInStock(vs);
      if (newPrice == null) { missingPrice.push(row.handle); continue; }

      const diff: Record<string, unknown> = { handle: row.handle, vinoshipper_product_id: vsId };
      let dirty = false;
      if (newPrice !== row.price_cents) {
        diff.price_cents = { from: row.price_cents, to: newPrice };
        dirty = true;
      }
      if (newClub != null && newClub !== row.club_price_cents) {
        diff.club_price_cents = { from: row.club_price_cents, to: newClub };
        dirty = true;
      }
      if (newStock !== row.in_stock) {
        diff.in_stock = { from: row.in_stock, to: newStock };
        dirty = true;
      }
      if (dirty) changes.push(diff);

      if (!dryRun) {
        // Always stamp last_synced_at on matched rows to prove freshness,
        // even when no field changed.
        const patch: Record<string, unknown> = {
          price_cents: newPrice,
          in_stock: newStock,
          last_synced_at: new Date().toISOString(),
        };
        if (newClub != null) patch.club_price_cents = newClub;
        const { error: uErr } = await admin.from("wine_products").update(patch).eq("id", row.id);
        if (uErr) {
          (diff as any).error = uErr.message;
        }
      }
    }

    const result: Record<string, unknown> = {
      ok: true,
      source_url: url,
      vs_product_count: list.length,
      wine_products_count: (rows ?? []).length,
      changed: changes.length,
      unmatched_handles: unmatched,
      missing_price_handles: missingPrice,
      changes,
      dry_run: dryRun,
    };
    if (returnSample) result.vs_sample = list[0];

    await logCronRun("vinoshipper-sync-prices", "ok", {
      httpStatus: 200,
      metadata: { changed: changes.length, unmatched: unmatched.length, missing_price: missingPrice.length, dry_run: dryRun },
    });
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await logCronRun("vinoshipper-sync-prices", "error", { httpStatus: 500, error: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});