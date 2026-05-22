// Daily web sweep so Graz stays current on the DTC wine, dog-welfare, and
// e-commerce competitive landscape. Uses Firecrawl /search for fresh results
// across a rotating set of topics, asks Lovable AI to distill 3-5 bullets per
// topic that are actionable for Rescue Dog Wines, and writes them into
// public.graz_knowledge (kind = industry_scan) where every Graz prompt picks
// them up automatically. Older industry_scan rows older than 30 days are
// auto-deactivated so the prompt stays compact.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const FIRECRAWL = "https://api.firecrawl.dev/v2";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const TOPICS: Array<{ kind: string; title: string; query: string }> = [
  { kind: "industry_scan", title: "DTC wine market signals",        query: "DTC wine direct to consumer sales trends 2026 club retention" },
  { kind: "industry_scan", title: "Wine club retention & churn",    query: "wine club subscription churn rate benchmarks 2026" },
  { kind: "industry_scan", title: "Wine compliance & shipping",     query: "wine direct shipping compliance state regulations changes 2026" },
  { kind: "competitor",    title: "Cause-driven wine brands",       query: "cause-driven dog rescue charity wine brand competitor news" },
  { kind: "consumer",      title: "Wine + dog parent consumer",     query: "millennial gen-z wine buyer dog owner premiumization 2026" },
  { kind: "industry_scan", title: "Meta + Google wine ad policy",   query: "Meta Google ads alcohol wine policy update 2026" },
];

async function firecrawlSearch(query: string, key: string) {
  const r = await fetch(`${FIRECRAWL}/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit: 6,
      tbs: "qdr:w", // past week
      scrapeOptions: { formats: ["markdown"] },
    }),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`firecrawl ${r.status}: ${JSON.stringify(j)}`);
  const items = (j?.data ?? j?.web ?? []) as any[];
  return items.slice(0, 6).map((it) => ({
    url: it.url ?? it.link ?? "",
    title: it.title ?? "",
    snippet: (it.markdown ?? it.description ?? "").slice(0, 1500),
  }));
}

async function distill(apiKey: string, topic: { title: string; query: string }, hits: any[]) {
  const sys = `You are Graz, the in-house Consumer Insights + Competitive Intelligence + BI + wine-industry analyst for Rescue Dog Wines (a small DTC wine + merch business whose mission is helping dogs find their forever home). Distill the supplied web results into 3-5 ULTRA-tight bullets that are USEFUL for running RDW this week. No fluff, no source-laundering, no "the article says". Each bullet must imply a lever (pricing, club cadence, ads, COGS, wholesale, retention, compliance, brand). Add a final one-line "So what for RDW:" that names the lever and a timeframe. A single dry wink of humor is allowed if it earns its keep — never at the expense of brevity.`;
  const userMsg = `Topic: ${topic.title}\nQuery: ${topic.query}\n\nWeb results (already filtered to the past week):\n${hits.map((h, i) => `[${i+1}] ${h.title} — ${h.url}\n${h.snippet}`).join("\n\n---\n\n")}`;
  const r = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
    }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}: ${await r.text().catch(() => "")}`);
  const j: any = await r.json();
  return String(j?.choices?.[0]?.message?.content ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const fcKey = Deno.env.get("FIRECRAWL_API_KEY");
  const aiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!fcKey) return J(500, { error: "FIRECRAWL_API_KEY missing" });
  if (!aiKey) return J(500, { error: "LOVABLE_API_KEY missing" });

  // Decay old scans so the prompt stays compact.
  await admin
    .from("graz_knowledge")
    .update({ active: false })
    .in("kind", ["industry_scan", "competitor", "consumer"])
    .lt("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
    .eq("active", true);

  const results: any[] = [];
  for (const topic of TOPICS) {
    try {
      const hits = await firecrawlSearch(topic.query, fcKey);
      if (!hits.length) { results.push({ topic: topic.title, ok: false, reason: "no hits" }); continue; }
      const summary = await distill(aiKey, topic, hits);
      if (!summary) { results.push({ topic: topic.title, ok: false, reason: "empty summary" }); continue; }
      const sourceList = hits.map((h) => `- ${h.title}: ${h.url}`).join("\n");
      const content = `${summary}\n\nSources:\n${sourceList}`;
      const { error } = await admin.from("graz_knowledge").insert({
        kind: topic.kind,
        title: `${topic.title} — ${new Date().toISOString().slice(0, 10)}`,
        content,
        source_url: hits[0]?.url ?? null,
        priority: 5,
      });
      if (error) results.push({ topic: topic.title, ok: false, reason: error.message });
      else results.push({ topic: topic.title, ok: true });
    } catch (e: any) {
      results.push({ topic: topic.title, ok: false, reason: String(e?.message ?? e) });
    }
  }
  return J(200, { ran_at: new Date().toISOString(), results });
});
