// Pulls the producer's Club definitions from Vinoshipper and writes
// vinoshipper_club_id + vinoshipper_join_url back onto matching
// wine_club_tiers rows. Matching is fuzzy by normalized name.
//
// Admin-only (we check the caller's role via the user-scoped supabase client).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const VS_BASE = "https://vinoshipper.com/api/v3/p";

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: require an admin / owner / wine_club_manager.
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

    const keyId = Deno.env.get("VINOSHIPPER_API_KEY_ID");
    const secret = Deno.env.get("VINOSHIPPER_API_SECRET");
    const producerId = Deno.env.get("VINOSHIPPER_PRODUCER_ID");
    if (!keyId || !secret || !producerId) {
      return new Response(JSON.stringify({ error: "VS credentials missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const auth = `Basic ${btoa(`${keyId}:${secret}`)}`;

    // Try the most likely club-listing endpoints in order.
    const candidates = [
      `${VS_BASE}/clubs`,
      `${VS_BASE}/club`,
      `https://vinoshipper.com/api/v3/producers/${producerId}/clubs`,
    ];

    const attempts: Array<{ url: string; status: number; body?: string }> = [];
    let clubs: any[] = [];
    for (const url of candidates) {
      try {
        const r = await fetch(url, {
          headers: { Authorization: auth, "Content-Type": "application/json" },
        });
        const text = await r.text();
        attempts.push({ url, status: r.status, body: r.ok ? undefined : text.slice(0, 200) });
        if (!r.ok) continue;
        let parsed: any;
        try { parsed = JSON.parse(text); } catch { continue; }
        const list = Array.isArray(parsed)
          ? parsed
          : (parsed.clubs ?? parsed.results ?? parsed.data ?? []);
        if (Array.isArray(list)) {
          clubs = list;
          break;
        }
      } catch (e) {
        attempts.push({ url, status: 0, body: String(e).slice(0, 200) });
      }
    }

    // Load all our tiers (active + inactive — admin may be linking historical).
    const service = createClient(SUPABASE_URL, SERVICE);
    const { data: tiers, error: tiersErr } = await service
      .from("wine_club_tiers")
      .select("id, name, slug, frequency, bottle_count, wine_type, vinoshipper_club_id, vinoshipper_join_url");
    if (tiersErr) throw tiersErr;

    const parseClub = (name: string) => {
      const n = name.toLowerCase();
      let freq: string | null = null;
      if (/yearly|annual\b|holiday/.test(n) && !/bi.?annual|bi.?yearly/.test(n)) freq = "yearly";
      else if (/bi.?annual|bi.?yearly|2x.?yearly/.test(n)) freq = "bi-annual";
      else if (/quarter/.test(n)) freq = "quarterly";
      else if (/month/.test(n)) freq = "monthly";
      // Allow words between the number and "bottle" (e.g. "6 Mixed Bottle").
      const m = n.match(/(\d+)[^\d]{0,30}?bottle/);
      const bottles = m ? parseInt(m[1], 10) : null;
      let wineType: string | null = null;
      const isRed = /\bred\b/.test(n);
      const isWhite = /\bwhite\b/.test(n);
      const isSparkling = /sparkling/.test(n);
      const isMixed = /\bmixed\b/.test(n);
      if (isMixed) wineType = "mixed";
      else if (isRed && !isWhite && !isSparkling) wineType = "red";
      else if ((isWhite || isSparkling) && !isRed) wineType = "white_sparkling";
      return { freq, bottles, wineType };
    };

    // Normalize clubs (including parsed structural fields).
    const normalizedClubs = clubs.map((c: any) => {
      const id = String(c.id ?? c.clubId ?? c.club_id ?? "");
      const name = String(c.name ?? c.title ?? c.displayName ?? "");
      const joinUrl =
        c.joinUrl ?? c.join_url ?? c.signupUrl ?? c.signup_url ?? c.url ??
        (id ? `https://vinoshipper.com/shop/${producerId}/club/${id}` : null);
      const parsed = parseClub(name);
      return { id, name, normName: norm(name), joinUrl, parsed, raw: c };
    }).filter((c: any) => c.id);

    // Match tiers → clubs.
    const updates: Array<{ tierId: string; tierName: string; clubId: string; clubName: string; joinUrl: string | null }> = [];
    const unmatchedTiers: Array<{ id: string; name: string }> = [];
    const matchedClubIds = new Set<string>();

    for (const tier of tiers || []) {
      const tn = norm(tier.name);
      let match = normalizedClubs.find((c: any) => c.normName === tn);
      // Structural match: same frequency + bottle count + wine type.
      if (!match) {
        const tierFreq = (tier as any).frequency?.toLowerCase();
        const tierWine = (tier as any).wine_type?.toLowerCase();
        const tierBottles = (tier as any).bottle_count;
        match = normalizedClubs.find((c: any) =>
          c.parsed.freq === tierFreq &&
          c.parsed.bottles === tierBottles &&
          c.parsed.wineType === tierWine
        );
      }
      if (!match) {
        // Fallback: substring match either direction.
        match = normalizedClubs.find((c: any) =>
          c.normName.includes(tn) || tn.includes(c.normName)
        );
      }
      if (match) {
        matchedClubIds.add(match.id);
        const { error: updErr } = await service
          .from("wine_club_tiers")
          .update({
            vinoshipper_club_id: match.id,
            vinoshipper_join_url: match.joinUrl,
            vinoshipper_last_synced_at: new Date().toISOString(),
          })
          .eq("id", tier.id);
        if (updErr) throw updErr;
        updates.push({
          tierId: tier.id,
          tierName: tier.name,
          clubId: match.id,
          clubName: match.name,
          joinUrl: match.joinUrl,
        });
      } else {
        unmatchedTiers.push({ id: tier.id, name: tier.name });
      }
    }

    const unmatchedClubs = normalizedClubs
      .filter((c: any) => !matchedClubIds.has(c.id))
      .map((c: any) => ({ id: c.id, name: c.name, joinUrl: c.joinUrl }));

    return new Response(
      JSON.stringify({
        ok: true,
        clubsFound: normalizedClubs.length,
        matched: updates.length,
        updates,
        unmatchedTiers,
        unmatchedClubs,
        attempts,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});