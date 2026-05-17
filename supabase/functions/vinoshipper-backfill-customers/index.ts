// Vinoshipper Phase 2 backfill — admin-triggered.
// Walks Vinoshipper customers (and optionally club memberships), and for each
// one where a Supabase auth user already exists with the same email, stamps:
//   - profiles.vinoshipper_customer_id
//   - wine_club_memberships (origin='vinoshipper_legacy') if there's a VS membership
//
// Idempotent: re-runs are safe; rows already linked are skipped.
// Resumable: progress is recorded in vinoshipper_backfill_runs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { vsFetch } from "../_shared/vinoshipper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VsCustomer {
  id: string | number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  createdAt?: string | null;
}

interface VsCustomersPage {
  data?: VsCustomer[];
  items?: VsCustomer[];
  results?: VsCustomer[];
  totalPages?: number;
  pageCount?: number;
}

function extractCustomers(payload: unknown): VsCustomer[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as VsCustomer[];
  const p = payload as VsCustomersPage;
  return (p.data ?? p.items ?? p.results ?? []) as VsCustomer[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Caller auth: must be admin/owner.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const callerId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin } = await admin.rpc("is_admin_or_owner", { _user_id: callerId });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden: admin role required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { page_size?: number; max_pages?: number; start_page?: number; dry_run?: boolean } = {};
  try {
    body = req.method === "POST" ? await req.json() : {};
  } catch {
    body = {};
  }
  const pageSize = Math.min(Math.max(body.page_size ?? 100, 1), 200);
  const maxPages = Math.min(Math.max(body.max_pages ?? 10, 1), 50);
  const startPage = Math.max(body.start_page ?? 1, 1);
  const dryRun = !!body.dry_run;

  // Open a run record.
  const { data: run, error: runErr } = await admin
    .from("vinoshipper_backfill_runs")
    .insert({
      kind: "customers",
      cursor: String(startPage),
      created_by: callerId,
    })
    .select()
    .single();
  if (runErr) {
    return new Response(JSON.stringify({ error: runErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let seen = 0;
  let linked = 0;
  let skipped = 0;
  let errors = 0;
  let lastPage = startPage - 1;
  let stopReason: string | null = null;

  try {
    for (let page = startPage; page < startPage + maxPages; page++) {
      let payload: unknown;
      try {
        payload = await vsFetch("/customers", { query: { page, size: pageSize } });
      } catch (err) {
        errors++;
        stopReason = `fetch failed on page ${page}: ${(err as Error).message}`;
        break;
      }
      const customers = extractCustomers(payload);
      if (customers.length === 0) {
        stopReason = `no more customers at page ${page}`;
        break;
      }

      for (const c of customers) {
        seen++;
        const email = (c.email ?? "").trim().toLowerCase();
        if (!email) { skipped++; continue; }

        // Find matching profile by email (must already have a Supabase auth user).
        const { data: profile, error: pErr } = await admin
          .from("profiles")
          .select("id, vinoshipper_customer_id")
          .ilike("email", email)
          .maybeSingle();
        if (pErr) { errors++; continue; }
        if (!profile) { skipped++; continue; }

        if (profile.vinoshipper_customer_id === String(c.id)) {
          skipped++; continue;
        }

        if (dryRun) { linked++; continue; }

        const { error: updErr } = await admin
          .from("profiles")
          .update({ vinoshipper_customer_id: String(c.id) })
          .eq("id", profile.id);
        if (updErr) { errors++; continue; }
        linked++;
      }

      lastPage = page;
      // Persist progress after each page.
      await admin
        .from("vinoshipper_backfill_runs")
        .update({
          cursor: String(page + 1),
          total_seen: seen,
          total_linked: linked,
          total_skipped: skipped,
          total_errors: errors,
        })
        .eq("id", run.id);
    }
  } catch (err) {
    stopReason = (err as Error).message;
  }

  await admin
    .from("vinoshipper_backfill_runs")
    .update({
      status: stopReason?.startsWith("fetch failed") ? "failed" : "completed",
      cursor: String(lastPage + 1),
      total_seen: seen,
      total_linked: linked,
      total_skipped: skipped,
      total_errors: errors,
      error_message: stopReason,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  return new Response(
    JSON.stringify({
      run_id: run.id,
      pages_processed: lastPage - startPage + 1,
      next_page: lastPage + 1,
      seen,
      linked,
      skipped,
      errors,
      stop_reason: stopReason,
      dry_run: dryRun,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});