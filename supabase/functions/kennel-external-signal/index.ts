// Webhook for Lindy to push external signals into kennel_insights.
// Auth: x-kennel-signature: sha256=<hex hmac of raw body> using KENNEL_EXTERNAL_SIGNAL_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kennel-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TYPES = new Set([
  "industry_trend", "brand_mention", "creative_opportunity", "regulatory", "competitor",
]);
const ALLOWED_URGENCY = new Set(["low", "medium", "high"]);

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const secret = Deno.env.get("KENNEL_EXTERNAL_SIGNAL_SECRET");
  if (!secret) {
    return new Response(JSON.stringify({ error: "server misconfigured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const raw = await req.text();
  const sigHeader = req.headers.get("x-kennel-signature") ?? "";
  const presented = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;
  const expected = await hmacSha256Hex(secret, raw);
  if (!timingSafeEqual(presented, expected)) {
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: any;
  try { body = JSON.parse(raw); } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const errs: string[] = [];
  if (typeof body.title !== "string" || !body.title.trim()) errs.push("title required");
  if (typeof body.summary !== "string" || !body.summary.trim()) errs.push("summary required");
  if (!ALLOWED_TYPES.has(body.signal_type)) errs.push(`signal_type must be one of ${[...ALLOWED_TYPES].join("|")}`);
  if (!ALLOWED_URGENCY.has(body.urgency)) errs.push(`urgency must be low|medium|high`);
  if (errs.length) return new Response(JSON.stringify({ error: errs }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const severityMap: Record<string, string> = { high: "high", medium: "medium", low: "low" };
  const { data, error } = await admin.from("kennel_insights").insert({
    source: "lindy_external",
    insight_type: `external:${body.signal_type}`,
    scope_key: (body.source_url as string) ?? "global",
    title: body.title.trim(),
    summary: body.summary.trim(),
    signal_type: body.signal_type,
    urgency: body.urgency,
    severity: severityMap[body.urgency],
    source_url: body.source_url ?? null,
    expires_at: body.expires_at ?? null,
    data: { suggested_action: body.suggested_action ?? null },
  }).select().single();

  if (error) {
    if (String(error.code) === "23505") {
      return new Response(JSON.stringify({ ok: true, deduped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ ok: true, insight: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});