import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOPICS = [
  { key: "wine_dtc_shipping", title: "Wine DTC Shipping (state-by-state)", prompt: "Audit a US direct-to-consumer wine shipping program for state-by-state legality, volume caps, license requirements, and recent law changes (last 12 months). The store ships from Oregon under Vinoshipper. Flag states currently restricted or with new 2025/2026 changes." },
  { key: "rewards_loyalty", title: "Rewards / Loyalty Program (alcohol inducement & tied-house)", prompt: "Audit an alcohol DTC rewards/points program for state inducement & tied-house rules. The program currently blocks redemption in: UT, PA, MS, AL, TN, TX, NC, KY, MA, CT, NY, MI, IN, MO. Wine is never redeemable; only merch, experiences, and donations. Validate the block-list is correct and identify any missing states." },
  { key: "age_verification", title: "Age Verification (21+) & COPPA", prompt: "Audit a wine site's age-gate (21+ modal, localStorage persistence) for adequacy under state alcohol laws and COPPA. Flag risks." },
  { key: "ambassador_affiliate", title: "Ambassador / Affiliate Program (FTC + 1099)", prompt: "Audit an affiliate/ambassador program for FTC endorsement disclosure rules, 1099 thresholds, and compliance handling. Commissions and 1099s are issued via impact.com." },
  { key: "email_sms_marketing", title: "Email & SMS Marketing (CAN-SPAM, TCPA)", prompt: "Audit a DTC alcohol brand's email & SMS marketing for CAN-SPAM, TCPA, double-opt-in, and unsubscribe requirements." },
  { key: "donations_intake", title: "Donations Intake (501(c) & charitable solicitation)", prompt: "Audit a 501(c) donation intake form for charitable solicitation registration requirements across US states." },
  { key: "privacy", title: "Privacy (CCPA/CPRA, GDPR, cookie consent)", prompt: "Audit a US ecommerce site for CCPA/CPRA, GDPR, and cookie-consent compliance." },
  { key: "accessibility", title: "Accessibility (WCAG 2.2 AA)", prompt: "Audit common public ecommerce pages for WCAG 2.2 AA conformance risks." },
  { key: "tied_house_retail", title: "Tied-House Rules at Retail (CRM/wholesale)", prompt: "Audit a winery's CRM/wholesale workflow (rep visits, sample tracking, retailer interactions) for tied-house violations." },
];

const SYSTEM = `You are a US alcohol & ecommerce compliance auditor. Respond ONLY with valid JSON matching this schema:
{ "status": "ok"|"warn"|"fail", "summary": string, "findings": string[], "recommendations": string[], "citations": string[] }
Be conservative: if a rule may have changed recently and you cannot verify, return "warn" and say so. Citations should be URLs or named statutes when possible.`;

async function auditTopic(prompt: string, apiKey: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(content); } catch { return { status: "warn", summary: "Parse error", findings: [content], recommendations: [], citations: [] }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let triggered_by = "cron";
  try { const body = await req.json(); if (body?.triggered_by) triggered_by = body.triggered_by; } catch {}

  const { data: audit, error: aErr } = await supabase
    .from("compliance_audits")
    .insert({ status: "running", source: "lovable_ai", triggered_by, topic_count: TOPICS.length })
    .select()
    .single();
  if (aErr || !audit) {
    return new Response(JSON.stringify({ error: aErr?.message ?? "audit insert failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let ok = 0, warn = 0, fail = 0;
  const findings: any[] = [];

  for (const t of TOPICS) {
    try {
      const result = await auditTopic(t.prompt, lovableKey);
      const status = ["ok","warn","fail"].includes(result.status) ? result.status : "warn";
      if (status === "ok") ok++; else if (status === "warn") warn++; else fail++;
      findings.push({
        audit_id: audit.id,
        topic: t.title,
        status,
        summary: result.summary ?? "",
        findings: result.findings ?? [],
        recommendations: result.recommendations ?? [],
        citations: result.citations ?? [],
      });
    } catch (e) {
      fail++;
      findings.push({
        audit_id: audit.id, topic: t.title, status: "fail",
        summary: "Audit error", findings: [String(e)], recommendations: [], citations: [],
      });
    }
  }

  await supabase.from("compliance_findings").insert(findings);
  await supabase.from("compliance_audits").update({
    status: "completed", finished_at: new Date().toISOString(),
    ok_count: ok, warn_count: warn, fail_count: fail,
  }).eq("id", audit.id);

  return new Response(JSON.stringify({ audit_id: audit.id, ok, warn, fail }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});