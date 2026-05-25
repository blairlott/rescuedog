// Platform Radar — scans the canonical ad-platform catalog plus the open web for
// new/changing ad platforms relevant to a small wine brand. Emits platform_radar_alerts.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkSharedSecret } from "../_shared/cronAlert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (s: number, b: unknown) => new Response(JSON.stringify(b), {
  status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const SYSTEM = `You scan the ad-platform landscape for a small Lodi winery (Rescue Dog Wines, mission: helping dogs find their forever home).
You will receive (a) the brand's current platform catalog and (b) snippets from recent industry sources.

Identify 1-5 actionable items, each one of:
- a NEW emerging ad platform we should evaluate
- a POLICY change (alcohol/age-gate) that opens or closes an existing platform
- a beta / opportunity (e.g. lower CPC region, new format) on a platform we already use

Output strict JSON:
{"alerts":[{"platform_slug","alert_type":"new_platform|policy_change|opportunity|risk","severity":"info|low|medium|high","title","summary","recommended_action","projected_value":{"est_cpc_cents":int|null,"est_monthly_reach":int|null,"est_minimum_spend_cents":int|null},"source_url"}]}

Be conservative — only surface items with real evidence. Prefer specificity over volume.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const isCron = await checkSharedSecret(req, {
      functionName: "platform-radar-scan",
      envVar: "KENNEL_INGEST_SECRET",
      headers: ["x-cron-secret"],
      alertOnFail: false,
    });
    const auth = req.headers.get("Authorization") ?? "";
    if (!isCron) {
      if (!auth.startsWith("Bearer ")) return J(401, { error: "Unauthorized" });
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } }
      );
      const { data: claims, error } = await supabase.auth.getClaims(auth.replace("Bearer ", ""));
      if (error || !claims?.claims?.sub) return J(401, { error: "Unauthorized" });
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", claims.claims.sub);
      if (!(roles ?? []).some((r: any) => ["owner", "admin", "ad_ops_manager"].includes(r.role))) {
        return J(403, { error: "Forbidden" });
      }
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: platforms } = await admin
      .from("ad_platforms")
      .select("slug,display_name,category,status,fit_score,alcohol_compliant,api_maturity,notes");

    // Optional: pull a couple of fresh industry snippets via Firecrawl Search.
    let snippets: string[] = [];
    const fcKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (fcKey) {
      try {
        const queries = [
          "new retail media ad platform wine alcohol 2026",
          "Microsoft Ads retail media new beta wine",
          "Spotify ads alcohol policy 2026",
        ];
        for (const q of queries) {
          const r = await fetch("https://api.firecrawl.dev/v2/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query: q, limit: 3, tbs: "qdr:m" }),
          });
          if (r.ok) {
            const d = await r.json();
            const items: any[] = d?.data?.web ?? d?.data ?? [];
            for (const it of items.slice(0, 3)) {
              snippets.push(`[${q}] ${it.title ?? ""}: ${it.description ?? ""} (${it.url ?? ""})`);
            }
          }
        }
      } catch (e) {
        console.warn("Firecrawl search failed", e);
      }
    }

    const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE) return J(500, { error: "LOVABLE_API_KEY missing" });

    const prompt = `CURRENT CATALOG:\n${JSON.stringify(platforms ?? [])}\n\nRECENT INDUSTRY SNIPPETS:\n${snippets.join("\n") || "(none — Firecrawl not configured or returned nothing)"}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return J(502, { error: `AI gateway error ${aiRes.status}: ${t}` });
    }
    const ai = await aiRes.json();
    const content = ai.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { alerts: [] }; }

    const alerts = Array.isArray(parsed.alerts) ? parsed.alerts : [];
    let saved = 0;
    for (const a of alerts) {
      // Avoid spam: skip if an open alert with same title already exists.
      const { data: existing } = await admin
        .from("platform_radar_alerts")
        .select("id")
        .eq("title", a.title)
        .is("dismissed_at", null)
        .limit(1);
      if (existing && existing.length) continue;
      const { error } = await admin.from("platform_radar_alerts").insert({
        platform_slug: a.platform_slug || "unknown",
        alert_type: a.alert_type || "opportunity",
        severity: a.severity || "info",
        title: a.title,
        summary: a.summary,
        recommended_action: a.recommended_action,
        projected_value: a.projected_value ?? null,
        source_url: a.source_url ?? null,
      });
      if (!error) saved++;
    }

    await admin.from("ad_platforms").update({ last_evaluated_at: new Date().toISOString() }).neq("id", "00000000-0000-0000-0000-000000000000");

    return J(200, { ok: true, alerts, saved });
  } catch (e: any) {
    console.error("platform-radar-scan error", e);
    return J(500, { error: e?.message ?? "Server error" });
  }
});