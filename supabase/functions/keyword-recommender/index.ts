// Cross-platform keyword recommender. Uses Lovable AI Gateway over the unified
// ad_keywords + ad_search_terms tables to produce ranked, actionable suggestions.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (s: number, b: unknown) => new Response(JSON.stringify(b), {
  status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const SYSTEM = `You optimize paid-search keyword portfolios across Instacart, Google Ads, Microsoft Ads, and Amazon Ads for a small Lodi winery (Rescue Dog Wines, mission: helping dogs find their forever home).

You are given a JSON dataset of keywords (with 30d performance) and search terms (queries that triggered ads). Produce a ranked list of high-impact actions.

Output strict JSON: {"recommendations":[{"platform","keyword","match_type","action","current_bid_cents","suggested_bid_cents","reason","priority","estimated_monthly_impact_cents"}]}

Actions: "raise_bid" | "lower_bid" | "pause" | "add_negative" | "promote_search_term" | "cross_pollinate".
For cross_pollinate, set "reason" to include the source platform.
Priority: 1 (urgent) to 5 (nice-to-have).
Limit to 25 highest-impact recommendations. Be ruthless about ACOS > 100% (pause or lower bid).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const isCron = req.headers.get("x-cron-secret") === Deno.env.get("KENNEL_INGEST_SECRET");
    const auth = req.headers.get("Authorization") ?? "";
    let userId: string | null = null;

    if (!isCron) {
      if (!auth.startsWith("Bearer ")) return J(401, { error: "Unauthorized" });
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } }
      );
      const { data: claims, error } = await supabase.auth.getClaims(auth.replace("Bearer ", ""));
      if (error || !claims?.claims?.sub) return J(401, { error: "Unauthorized" });
      userId = claims.claims.sub;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (!(roles ?? []).some((r: any) => ["owner", "admin", "ad_ops_manager"].includes(r.role))) {
        return J(403, { error: "Forbidden" });
      }
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const [{ data: kws }, { data: terms }] = await Promise.all([
      admin.from("ad_keywords")
        .select("platform_slug,keyword,match_type,status,bid_cents,impressions_30d,clicks_30d,spend_30d_cents,conversions_30d,sales_30d_cents,quality_score")
        .limit(500),
      admin.from("ad_search_terms")
        .select("platform_slug,query,impressions,clicks,spend_cents,conversions,sales_cents")
        .is("resolved_at", null)
        .order("spend_cents", { ascending: false })
        .limit(200),
    ]);

    if (!(kws ?? []).length && !(terms ?? []).length) {
      return J(200, { ok: true, recommendations: [], note: "No keyword data yet — ingest a report first." });
    }

    const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE) return J(500, { error: "LOVABLE_API_KEY missing" });

    const prompt = `KEYWORDS (last 30d):\n${JSON.stringify(kws ?? [])}\n\nSEARCH TERMS (unresolved):\n${JSON.stringify(terms ?? [])}`;

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
    try { parsed = JSON.parse(content); } catch { parsed = { recommendations: [] }; }

    const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

    // Persist as ad_recommendations for the existing review workflow.
    let saved = 0;
    for (const r of recs.slice(0, 25)) {
      const { error } = await admin.from("ad_recommendations").insert({
        kind: "keyword_optimization",
        status: "pending",
        title: `${r.action} • ${r.platform} • "${r.keyword ?? ""}"`,
        summary: r.reason ?? "",
        payload: r,
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      });
      if (!error) saved++;
    }

    return J(200, { ok: true, recommendations: recs, saved });
  } catch (e: any) {
    console.error("keyword-recommender error", e);
    return J(500, { error: e?.message ?? "Server error" });
  }
});