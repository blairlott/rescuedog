// Confirms wine club membership against Vinoshipper for the logged-in user.
// Called after sign-in / returning visitor so our local
// wine_club_memberships row reflects the source of truth in VS.
//
// Flow:
//   1. Resolve vinoshipper_customer_id from customer_profiles (link if missing
//      via vsFindCustomerByEmail; we do NOT create here — purely read-only).
//   2. GET /p/customers/{id}/memberships from Vinoshipper.
//   3. For each ACTIVE membership, map clubId -> wine_club_tiers row and
//      upsert wine_club_memberships keyed on vinoshipper_membership_id.
//   4. Mark any local non-cancelled memberships for this user that no longer
//      appear in VS as cancelled (VS is source of truth).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { vsFindCustomerByEmail, VinoshipperError } from "../_shared/vinoshipper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VS_KEY_ID = Deno.env.get("VINOSHIPPER_API_KEY_ID") ?? "";
const VS_SECRET = Deno.env.get("VINOSHIPPER_API_SECRET") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface VsMembership {
  id: string | number;
  clubId?: string | number;
  club?: { id?: string | number; name?: string };
  status?: string; // ACTIVE / CANCELLED / etc
  active?: boolean;
  startDate?: string;
  nextShipmentDate?: string;
}

async function fetchVsMemberships(customerId: string): Promise<VsMembership[]> {
  const url = `https://vinoshipper.com/api/v3/p/customers/${customerId}/memberships`;
  const auth = "Basic " + btoa(`${VS_KEY_ID}:${VS_SECRET}`);
  const res = await fetch(url, {
    headers: { Authorization: auth, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new VinoshipperError(res.status, `VS memberships fetch ${res.status}`, text);
  }
  const parsed = await res.json();
  if (Array.isArray(parsed)) return parsed as VsMembership[];
  if (parsed && Array.isArray((parsed as any).memberships)) {
    return (parsed as any).memberships as VsMembership[];
  }
  return [];
}

function isActive(m: VsMembership): boolean {
  if (typeof m.active === "boolean") return m.active;
  const s = String(m.status ?? "").toUpperCase();
  return s === "" || s === "ACTIVE" || s === "PENDING";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    if (!VS_KEY_ID || !VS_SECRET) {
      return json({ ok: true, source: "simulation", synced: 0 });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Resolve Vinoshipper customer id (read-only — do not create)
    const { data: profile } = await admin
      .from("customer_profiles")
      .select("vinoshipper_customer_id, email")
      .eq("id", user.id)
      .maybeSingle();

    let vsCustomerId = profile?.vinoshipper_customer_id ?? null;
    if (!vsCustomerId) {
      const email = profile?.email ?? user.email;
      if (!email) return json({ ok: true, synced: 0, reason: "no email" });
      const existing = await vsFindCustomerByEmail(email).catch(() => null);
      if (!existing) {
        return json({ ok: true, synced: 0, reason: "no vinoshipper customer" });
      }
      vsCustomerId = String(existing.id);
      await admin.from("customer_profiles").upsert({
        id: user.id,
        email,
        vinoshipper_customer_id: vsCustomerId,
        vinoshipper_linked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>);
    }

    // 2. Fetch memberships from VS
    const vsMemberships = await fetchVsMemberships(vsCustomerId);
    const activeVs = vsMemberships.filter(isActive);

    // 3. Load tier map (vinoshipper_club_id -> our tier id)
    const { data: tiers } = await admin
      .from("wine_club_tiers")
      .select("id, vinoshipper_club_id")
      .not("vinoshipper_club_id", "is", null);
    const tierByVsClub = new Map<string, string>();
    for (const t of tiers ?? []) {
      if (t.vinoshipper_club_id) tierByVsClub.set(String(t.vinoshipper_club_id), t.id);
    }

    // 4. Upsert each active VS membership
    let synced = 0;
    const seenLocalIds = new Set<string>();
    for (const m of activeVs) {
      const vsClubId = String(m.clubId ?? m.club?.id ?? "");
      const tierId = tierByVsClub.get(vsClubId);
      if (!tierId) continue; // unmapped club — skip silently

      const vsMembershipId = String(m.id);
      const { data: existing } = await admin
        .from("wine_club_memberships")
        .select("id")
        .eq("vinoshipper_membership_id", vsMembershipId)
        .maybeSingle();

      if (existing) {
        seenLocalIds.add(existing.id);
        await admin.from("wine_club_memberships").update({
          status: "active",
          tier_id: tierId,
          vinoshipper_customer_id: vsCustomerId,
          next_shipment_date: m.nextShipmentDate ?? null,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        const { data: inserted } = await admin.from("wine_club_memberships")
          .insert({
            user_id: user.id,
            tier_id: tierId,
            status: "active",
            payment_status: "vinoshipper",
            origin: "vinoshipper_legacy",
            vinoshipper_customer_id: vsCustomerId,
            vinoshipper_membership_id: vsMembershipId,
            next_shipment_date: m.nextShipmentDate ?? null,
            joined_at: m.startDate ?? new Date().toISOString(),
            claimed_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (inserted) seenLocalIds.add(inserted.id);
      }
      synced++;
    }

    // 5. Cancel any local non-cancelled memberships not present in VS
    const { data: localActive } = await admin
      .from("wine_club_memberships")
      .select("id, vinoshipper_membership_id")
      .eq("user_id", user.id)
      .eq("is_gift", false)
      .neq("status", "cancelled");
    for (const row of localActive ?? []) {
      if (seenLocalIds.has(row.id)) continue;
      // only auto-cancel rows that were linked to VS in the first place
      if (!row.vinoshipper_membership_id) continue;
      await admin.from("wine_club_memberships").update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_source: "vinoshipper_sync",
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
    }

    return json({
      ok: true,
      vinoshipperCustomerId: vsCustomerId,
      vs_total: vsMemberships.length,
      vs_active: activeVs.length,
      synced,
    });
  } catch (err) {
    console.error("vinoshipper-sync-membership error", err);
    if (err instanceof VinoshipperError) {
      return json({ error: err.message, details: err.details }, err.status);
    }
    return json({ error: String(err) }, 500);
  }
});