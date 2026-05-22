// Curate the NEXT shipment for a VS club membership.
// SCAFFOLD ONLY — gated behind `vs_club_curation_enabled` feature flag.
// When the flag is OFF (default), this function returns 200 with a
// dry-run payload and does NOT call Vinoshipper. Once endpoints are
// confirmed via vinoshipper-club-verify and the flag is enabled, this
// will PUT the curated SKU set to VS.
//
// Body: { membershipId: string, items: Array<{ sku: string, qty: number }>, note?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VS = "https://vinoshipper.com/api/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isMgr } = await userClient.rpc("is_wine_club_manager", { _user_id: user.id });
    if (!isMgr) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { membershipId, items, note } = body as {
      membershipId?: string;
      items?: Array<{ sku: string; qty: number }>;
      note?: string;
    };

    if (!membershipId || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "membershipId and non-empty items required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: flag } = await userClient
      .from("feature_flags").select("enabled")
      .eq("key", "vs_club_curation_enabled").maybeSingle();
    const enabled = !!flag?.enabled;

    // Audit row (no PII beyond membershipId).
    await userClient.from("vinoshipper_club_curation_log").insert({
      membership_id: membershipId,
      items,
      note: note ?? null,
      executed: enabled,
      actor_user_id: user.id,
    });

    if (!enabled) {
      return new Response(JSON.stringify({
        ok: true,
        dry_run: true,
        message: "Feature flag vs_club_curation_enabled is OFF. Payload logged but not sent to Vinoshipper.",
        wouldSend: { membershipId, items, note },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const keyId = Deno.env.get("VINOSHIPPER_API_KEY_ID");
    const secret = Deno.env.get("VINOSHIPPER_API_SECRET");
    if (!keyId || !secret) {
      return new Response(JSON.stringify({ error: "VS credentials missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const auth = `Basic ${btoa(`${keyId}:${secret}`)}`;

    // NOTE: Exact endpoint shape to be confirmed via vinoshipper-club-verify.
    // Placeholder uses the most likely RESTful pattern.
    const url = `${VS}/p/memberships/${encodeURIComponent(membershipId)}/next-shipment`;
    const vsRes = await fetch(url, {
      method: "PUT",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ items, note }),
    });
    const text = await vsRes.text();

    return new Response(JSON.stringify({
      ok: vsRes.ok,
      status: vsRes.status,
      vs_response: text.slice(0, 1000),
    }), {
      status: vsRes.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});