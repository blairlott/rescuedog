// Imports a Vinoshipper member CSV export into wine_club_legacy_members.
// Admin-only. Accepts JSON: { rows: Array<Record<string,string>>, status: string, source_file?: string }
// Status must be one of: current | inactive | on_hold | archived.
// Idempotent: rows with a vinoshipper_membership_id are upserted on that key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_STATUSES = ["current", "inactive", "on_hold", "archived"] as const;
type LegacyStatus = (typeof VALID_STATUSES)[number];

// Flexible header matching — VS exports vary across tabs.
function pick(row: Record<string, string>, ...keys: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const lookup: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) lookup[norm(k)] = v;
  for (const k of keys) {
    const v = lookup[norm(k)];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseDateOnly(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: ok } = await userClient.rpc("is_wine_club_manager", { _user_id: user.id });
    if (!ok) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    const body = await req.json().catch(() => ({}));
    const status = body?.status as LegacyStatus;
    const rows = body?.rows as Array<Record<string, string>> | undefined;
    const sourceFile = (body?.source_file as string) || null;

    if (!status || !VALID_STATUSES.includes(status)) {
      return new Response(
        JSON.stringify({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "rows array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (rows.length > 10000) {
      return new Response(JSON.stringify({ error: "max 10,000 rows per import" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Preload tiers for fuzzy mapping by club name.
    const { data: tiers } = await admin
      .from("wine_club_tiers")
      .select("id, name, vinoshipper_club_id");
    const tierByVsId = new Map<string, string>();
    const tierByNormName = new Map<string, string>();
    const normName = (s: string) =>
      (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    for (const t of tiers || []) {
      if (t.vinoshipper_club_id) tierByVsId.set(String(t.vinoshipper_club_id), t.id);
      tierByNormName.set(normName(t.name), t.id);
    }

    const inserts: any[] = [];
    const errors: any[] = [];
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const email = pick(r, "email", "email address", "customer email");
        const firstName = pick(r, "first name", "firstname", "first");
        const lastName = pick(r, "last name", "lastname", "last");
        const vsCustId = pick(r, "customer id", "customer_id", "vinoshipper customer id");
        const vsMembId =
          pick(r, "membership id", "membership_id", "club membership id", "id");
        const clubName = pick(r, "club", "club name", "membership", "tier");
        const vsClubId = pick(r, "club id", "club_id");

        if (!email && !vsMembId && !vsCustId) {
          skipped++;
          continue;
        }

        let tierId: string | null = null;
        if (vsClubId && tierByVsId.has(String(vsClubId))) {
          tierId = tierByVsId.get(String(vsClubId))!;
        } else if (clubName) {
          tierId = tierByNormName.get(normName(clubName)) || null;
        }

        inserts.push({
          vinoshipper_customer_id: vsCustId,
          vinoshipper_membership_id: vsMembId,
          email: email?.toLowerCase() || null,
          first_name: firstName,
          last_name: lastName,
          phone: pick(r, "phone", "phone number", "mobile"),
          club_name: clubName,
          tier_id: tierId,
          status,
          shipping_address_line1: pick(r, "address", "address line 1", "address1", "shipping address"),
          shipping_address_line2: pick(r, "address line 2", "address2"),
          shipping_city: pick(r, "city", "shipping city"),
          shipping_state: pick(r, "state", "shipping state", "region"),
          shipping_zip: pick(r, "zip", "zip code", "postal code", "postcode"),
          shipping_country: pick(r, "country"),
          joined_at: parseDate(pick(r, "joined", "join date", "signup date", "created", "created at")),
          last_shipment_date: parseDateOnly(pick(r, "last shipment", "last shipment date", "last ship date")),
          next_shipment_date: parseDateOnly(pick(r, "next shipment", "next shipment date", "next ship date")),
          notes: pick(r, "notes", "note", "comments"),
          raw: r,
          source_file: sourceFile,
        });
      } catch (e: any) {
        errors.push({ row: i + 1, error: e.message });
      }
    }

    // Split: rows WITH vs_membership_id can be upserted; rows without -> plain insert
    const withId = inserts.filter((x) => x.vinoshipper_membership_id);
    const withoutId = inserts.filter((x) => !x.vinoshipper_membership_id);

    let inserted = 0;
    let updated = 0;

    if (withId.length) {
      // Check existing to count update vs insert
      const ids = withId.map((x) => x.vinoshipper_membership_id);
      const { data: existing } = await admin
        .from("wine_club_legacy_members")
        .select("vinoshipper_membership_id")
        .in("vinoshipper_membership_id", ids);
      const existingSet = new Set((existing || []).map((e: any) => e.vinoshipper_membership_id));

      const { error } = await admin
        .from("wine_club_legacy_members")
        .upsert(withId, { onConflict: "vinoshipper_membership_id" });
      if (error) {
        errors.push({ batch: "with_id", error: error.message });
      } else {
        for (const x of withId) {
          if (existingSet.has(x.vinoshipper_membership_id)) updated++;
          else inserted++;
        }
      }
    }

    if (withoutId.length) {
      const { error } = await admin
        .from("wine_club_legacy_members")
        .insert(withoutId);
      if (error) errors.push({ batch: "without_id", error: error.message });
      else inserted += withoutId.length;
    }

    await admin.from("wine_club_legacy_import_runs").insert({
      status,
      source_file: sourceFile,
      rows_received: rows.length,
      rows_inserted: inserted,
      rows_updated: updated,
      rows_skipped: skipped,
      errors: errors.length ? errors : null,
      created_by: user.id,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        status,
        received: rows.length,
        inserted,
        updated,
        skipped,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
