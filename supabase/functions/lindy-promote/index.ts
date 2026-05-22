// Lindy promoter — accepts draft content submissions from Lindy (or any external
// agent) and parks them in public.lindy_inbox for human review. Never writes to
// production tables directly. Auth = shared LINDY_PROXY_TOKEN header.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lindy-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALLOWED_TYPES = new Set([
  "wp_post_draft",
  "rescue_spotlight_draft",
  "email_draft",
  "crm_lead_enrichment",
  "ad_creative_draft",
  "compliance_note",
  "generic_note",
  "lovable_prompt",
  "lovable_response",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return J(405, { error: "Method not allowed" });

  const expected = Deno.env.get("LINDY_PROXY_TOKEN");
  const provided = req.headers.get("x-lindy-token") ?? "";
  if (!expected || provided !== expected) return J(401, { error: "Unauthorized" });

  let body: any;
  try { body = await req.json(); } catch { return J(400, { error: "Invalid JSON" }); }

  const { type, payload, source_url, confidence, submitted_by } = body ?? {};
  if (typeof type !== "string" || !ALLOWED_TYPES.has(type)) {
    return J(400, { error: `type must be one of: ${[...ALLOWED_TYPES].join(", ")}` });
  }
  if (!payload || typeof payload !== "object") return J(400, { error: "payload (object) required" });
  if (confidence && !["low", "medium", "high"].includes(confidence)) {
    return J(400, { error: "confidence must be low|medium|high" });
  }

  // Light hard-guards reflecting brand/compliance rules.
  const text = JSON.stringify(payload).toLowerCase();
  const violations: string[] = [];
  if (text.includes("free shipping")) violations.push("contains 'free shipping' — use 'shipping included'");
  if (/\b\d[\d,]*\s+(homes funded|meals|bottles donated|dogs (saved|rescued))/i.test(JSON.stringify(payload))) {
    violations.push("contains quantified impact claim — qualitative framing only");
  }
  if (violations.length) return J(422, { error: "draft rejected", violations });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await admin
    .from("lindy_inbox")
    .insert({
      type,
      payload,
      source_url: source_url ?? null,
      confidence: confidence ?? null,
      submitted_by: submitted_by ?? "lindy",
      status: "pending",
    })
    .select("id, created_at, status")
    .single();

  if (error) {
    console.error("lindy-promote insert error", error);
    return J(500, { error: error.message });
  }

  return J(200, { ok: true, draft: data });
});