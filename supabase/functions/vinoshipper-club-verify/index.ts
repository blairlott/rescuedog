// Diagnostic-only: probes Vinoshipper club/membership endpoints we'd use
// for curation (next-shipment, skip, pause, swap). Read-only — no writes
// to VS, no writes to our DB. Gated behind `vs_club_curation_enabled`
// feature flag (off by default). Admin/wine-club-manager only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const VS = "https://vinoshipper.com/api/v3";

type Probe = {
  label: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  contentType?: string;
  snippet?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isMgr } = await userClient.rpc("is_wine_club_manager", { _user_id: user.id });
    if (!isMgr) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Feature flag gate (read-only probe is still allowed but we surface the flag).
    const { data: flag } = await userClient
      .from("feature_flags")
      .select("enabled")
      .eq("key", "vs_club_curation_enabled")
      .maybeSingle();

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

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const membershipId: string | undefined = body.membershipId;
    const customerId: string | undefined = body.customerId;

    const probes: Array<{ label: string; method: string; url: string }> = [
      { label: "list_clubs", method: "GET", url: `${VS}/p/clubs` },
      { label: "list_clubs_alt", method: "GET", url: `${VS}/clubs` },
    ];
    if (customerId) {
      probes.push(
        { label: "customer_memberships", method: "GET", url: `${VS}/p/customers/${customerId}/memberships` },
        { label: "customer_memberships_alt", method: "GET", url: `${VS}/customers/${customerId}/memberships` },
      );
    }
    if (membershipId) {
      probes.push(
        { label: "membership_get", method: "GET", url: `${VS}/p/memberships/${membershipId}` },
        { label: "membership_next_shipment", method: "GET", url: `${VS}/p/memberships/${membershipId}/next-shipment` },
        { label: "membership_shipments", method: "GET", url: `${VS}/p/memberships/${membershipId}/shipments` },
      );
    }

    const results: Probe[] = [];
    for (const p of probes) {
      try {
        const r = await fetch(p.url, {
          method: p.method,
          headers: { Authorization: auth, "Content-Type": "application/json" },
        });
        const text = await r.text();
        results.push({
          label: p.label,
          method: p.method,
          url: p.url,
          status: r.status,
          ok: r.ok,
          contentType: r.headers.get("content-type") || undefined,
          snippet: text.slice(0, 400),
        });
      } catch (e) {
        results.push({
          label: p.label,
          method: p.method,
          url: p.url,
          status: 0,
          ok: false,
          snippet: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return new Response(
      JSON.stringify({
        feature_enabled: !!flag?.enabled,
        note: "Diagnostic only. No writes performed. Toggle vs_club_curation_enabled to activate curation flows.",
        producerId,
        probes: results,
      }, null, 2),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});