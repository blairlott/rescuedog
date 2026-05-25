// Phase 4 #25 — SEO autopilot.
// 1. Fetches a curated list of high-priority public URLs.
// 2. For each URL, scrapes <title> + <meta description> (best-effort).
// 3. Asks Lovable AI for a suggested title/meta/H1 + JSON-LD schema.
// 4. Inserts pending recommendations linked to a single seo_audit_runs row.
// Recommendations require human approval before any code change is applied.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { verifyCronSecret, logCronRun } from "../_shared/cronAlert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const SITE = "https://rescuedog.lovable.app";

const DEFAULT_URLS = [
  "/", "/wines", "/wine-club", "/mission", "/rescue-partners",
  "/merch", "/store-locator", "/blog", "/ambassadors",
];

function pick(re: RegExp, html: string): string | null {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

async function fetchPage(path: string): Promise<{ title: string | null; desc: string | null; bodyText: string }> {
  try {
    const r = await fetch(`${SITE}${path}`, { headers: { "User-Agent": "RDW-SEO-Bot/1.0" } });
    const html = await r.text();
    const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i, html);
    const desc = pick(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i, html);
    const bodyText = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2000);
    return { title, desc, bodyText };
  } catch {
    return { title: null, desc: null, bodyText: "" };
  }
}

async function suggest(apiKey: string, path: string, title: string | null, desc: string | null, body: string) {
  const sys = `You are an SEO editor for Rescue Dog Wines (mission-driven winery, tagline "helping dogs find their forever home"). Never claim free shipping. Return JSON: { suggested_title (<=60ch, keyword first), suggested_meta_desc (<=155ch, includes CTA), suggested_h1 (<=70ch), suggested_schema (a JSON-LD object appropriate for the page, e.g. WebSite, Organization, Product, BreadcrumbList), reason (one sentence why) }.`;
  const user = `Page: ${path}\nCurrent <title>: ${title ?? "(missing)"}\nCurrent meta description: ${desc ?? "(missing)"}\nSnippet: ${body.slice(0, 1200)}\nReturn JSON only.`;
  const r = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}`);
  const j = await r.json();
  return JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!(await verifyCronSecret(req, "seo-autopilot-sweep"))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: setting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "seo_autopilot_enabled")
    .maybeSingle();
  if (setting && setting.value === false) {
    return new Response(JSON.stringify({ ok: true, skipped: "disabled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: "LOVABLE_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* GET / empty */ }
  const urls: string[] = Array.isArray(body.urls) && body.urls.length ? body.urls : DEFAULT_URLS;

  const { data: runRow } = await admin
    .from("seo_audit_runs")
    .insert({ status: "running", page_count: urls.length })
    .select()
    .single();
  const runId = runRow?.id;

  let created = 0;
  const results: any[] = [];
  for (const path of urls) {
    const page = await fetchPage(path);
    try {
      const s = await suggest(apiKey, path, page.title, page.desc, page.bodyText);
      const { error } = await admin.from("seo_page_recommendations").insert({
        run_id: runId,
        url: path,
        current_title: page.title,
        suggested_title: s.suggested_title ?? null,
        current_meta_desc: page.desc,
        suggested_meta_desc: s.suggested_meta_desc ?? null,
        suggested_h1: s.suggested_h1 ?? null,
        suggested_schema: s.suggested_schema ?? null,
        reason: s.reason ?? null,
        status: "pending",
      });
      if (!error) { created++; results.push({ url: path, ok: true }); }
      else results.push({ url: path, error: error.message });
    } catch (e: any) {
      results.push({ url: path, error: e.message });
    }
  }

  await admin.from("seo_audit_runs").update({
    status: "success",
    recommendations_created: created,
    completed_at: new Date().toISOString(),
  }).eq("id", runId);

  await logCronRun("seo-autopilot-sweep", "ok", { httpStatus: 200, metadata: { run_id: runId, created } });
  return new Response(JSON.stringify({ ok: true, run_id: runId, created, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await logCronRun("seo-autopilot-sweep", "error", { httpStatus: 500, error: msg });
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});