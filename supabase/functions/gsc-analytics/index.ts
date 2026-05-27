// Google Search Console proxy for the CMS dashboard.
//
// Auth: must be a logged-in owner/admin/cms_editor.
// Endpoints (via ?action=):
//   sites       → GET  /webmasters/v3/sites
//   query       → POST /webmasters/v3/sites/{siteUrl}/searchAnalytics/query
//
// Calls Google Search Console through the Lovable connector gateway so OAuth
// tokens are refreshed automatically.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GSC_KEY = Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY");
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);
  if (!GSC_KEY) return json({ error: "Google Search Console not connected" }, 500);

  // Auth check (mirrors integrations-status pattern).
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsRes, error: claimsErr } = await supa.auth.getClaims(token);
  if (claimsErr || !claimsRes?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = claimsRes.claims.sub as string;

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: roles } = await service.from("user_roles").select("role").eq("user_id", uid);
  const allowed = (roles ?? []).some((r: any) =>
    ["owner", "admin", "cms_editor"].includes(String(r.role)),
  );
  if (!allowed) return json({ error: "Forbidden" }, 403);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "sites";

  const headers = {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GSC_KEY,
    "Content-Type": "application/json",
  };

  try {
    if (action === "sites") {
      const r = await fetch(`${GATEWAY}/webmasters/v3/sites`, { headers });
      const text = await r.text();
      if (!r.ok) return json({ error: `GSC sites ${r.status}`, detail: text.slice(0, 500) }, 502);
      return json(JSON.parse(text));
    }

    if (action === "query") {
      const body = await req.json().catch(() => ({}));
      const siteUrl: string = body.siteUrl;
      if (!siteUrl) return json({ error: "siteUrl required" }, 400);
      const today = new Date();
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const defaultStart = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000);
      const payload = {
        startDate: body.startDate || fmt(defaultStart),
        endDate: body.endDate || fmt(today),
        dimensions: Array.isArray(body.dimensions) && body.dimensions.length
          ? body.dimensions
          : ["query"],
        rowLimit: Math.min(Math.max(parseInt(body.rowLimit) || 25, 1), 1000),
        startRow: 0,
        dataState: "all",
      };
      const r = await fetch(
        `${GATEWAY}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        { method: "POST", headers, body: JSON.stringify(payload) },
      );
      const text = await r.text();
      if (!r.ok) return json({ error: `GSC query ${r.status}`, detail: text.slice(0, 500) }, 502);
      return json(JSON.parse(text));
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});