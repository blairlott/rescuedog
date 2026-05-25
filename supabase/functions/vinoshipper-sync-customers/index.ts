// Mirrors the Vinoshipper customer list into public.vs_customers.
// Triggered manually from /admin/customers (button) or nightly via pg_cron.
// Auth: admin/owner JWT (manual) OR x-kennel-ingest-secret header (cron).
// Pagination: walks /customers with page/size until VS returns an empty page.

import { createClient } from "npm:@supabase/supabase-js@2";
import { vsFetch } from "../_shared/vinoshipper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kennel-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface VsCustomer {
  id: string | number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  businessName?: string | null;
  address?: Record<string, unknown> | null;
  createdAt?: string | null;
  club?: { name?: string | null } | null;
  membership?: { clubName?: string | null } | null;
}

function extractCustomers(payload: unknown): VsCustomer[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as VsCustomer[];
  const p = payload as Record<string, unknown>;
  return (p.data ?? p.items ?? p.results ?? p.customers ?? []) as VsCustomer[];
}

function mapRow(c: VsCustomer) {
  const addr = (c.address ?? {}) as Record<string, unknown>;
  const clubName =
    (c.club?.name as string | null | undefined) ??
    (c.membership?.clubName as string | null | undefined) ??
    null;
  return {
    vs_customer_id: String(c.id),
    email: c.email ? String(c.email).toLowerCase() : null,
    first_name: c.firstName ?? null,
    last_name: c.lastName ?? null,
    phone: c.phone ?? null,
    business_name: c.businessName ?? null,
    address: (addr.street1 ?? addr.address1 ?? null) as string | null,
    city: (addr.city ?? null) as string | null,
    state: ((addr.state ?? addr.stateCode ?? null) as string | null),
    zip: ((addr.zip ?? addr.postalCode ?? null) as string | null),
    country: ((addr.country ?? "US") as string | null),
    is_club_member: !!clubName,
    club_name: clubName,
    vs_created_at: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    last_synced_at: new Date().toISOString(),
    raw: c,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Auth: secret (cron) OR admin/owner JWT.
  const ingestSecret = req.headers.get("x-kennel-ingest-secret");
  const expectedSecret = Deno.env.get("KENNEL_INGEST_SECRET");
  let triggeredBy = "cron";
  if (!expectedSecret || ingestSecret !== expectedSecret) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);
    const { data: ok } = await admin.rpc("is_admin_or_owner", { _user_id: userData.user.id });
    if (!ok) return json({ error: "forbidden" }, 403);
    triggeredBy = userData.user.id;
  }

  let body: { page_size?: number; max_pages?: number } = {};
  try { body = await req.json(); } catch { /* default */ }
  const pageSize = Math.min(Math.max(body.page_size ?? 100, 1), 200);
  const maxPages = Math.min(Math.max(body.max_pages ?? 100, 1), 500);

  const { data: logRow } = await admin
    .from("vs_customer_sync_log")
    .insert({ triggered_by: triggeredBy })
    .select("id")
    .single();
  const logId = logRow?.id;

  let seen = 0;
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  let pages = 0;
  let errorMessage: string | null = null;

  try {
    for (let page = 1; page <= maxPages; page++) {
      let payload: unknown;
      try {
        payload = await vsFetch("/customers", { query: { page, size: pageSize } });
      } catch (err) {
        errors++;
        errorMessage = `fetch page ${page}: ${(err as Error).message}`;
        break;
      }
      const customers = extractCustomers(payload);
      if (customers.length === 0) break;
      pages = page;
      seen += customers.length;

      const rows = customers.map(mapRow);
      // Get current state for diff
      const ids = rows.map((r) => r.vs_customer_id);
      const { data: existing } = await admin
        .from("vs_customers")
        .select("vs_customer_id")
        .in("vs_customer_id", ids);
      const existingSet = new Set((existing ?? []).map((r: any) => r.vs_customer_id));

      const { error: upErr } = await admin
        .from("vs_customers")
        .upsert(rows, { onConflict: "vs_customer_id" });
      if (upErr) { errors++; errorMessage = `upsert page ${page}: ${upErr.message}`; break; }

      for (const r of rows) {
        if (existingSet.has(r.vs_customer_id)) updated++;
        else inserted++;
      }

      if (customers.length < pageSize) break;
    }
  } catch (e) {
    errorMessage = (e as Error).message;
    errors++;
  }

  await admin.from("vs_customer_sync_log").update({
    finished_at: new Date().toISOString(),
    pages,
    seen,
    inserted,
    updated,
    errors,
    error_message: errorMessage,
  }).eq("id", logId);

  return json({ ok: errors === 0, pages, seen, inserted, updated, errors, error: errorMessage });
});