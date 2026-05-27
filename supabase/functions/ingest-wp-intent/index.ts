// Public ingestion endpoint for legacy WordPress checkout gclid capture.
// Mirrors what recordCheckoutIntent() does on the Lovable side, so the
// existing gclid-oci-loop pipeline can stitch ad-clicks → VS sales for
// traffic that lands on the legacy WP site.
//
// verify_jwt = false (set in config.toml). CORS open. Service-role insert.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Simple per-instance IP rate limit. Cold starts reset; good enough for now.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const ipHits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    ipHits.set(ip, arr);
    return true;
  }
  arr.push(now);
  ipHits.set(ip, arr);
  return false;
}

const GCLID_RE = /^[A-Za-z0-9_-]{20,200}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
  if (rateLimited(ip)) return json({ error: "rate_limited" }, 429);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // gclid is required — the whole point of this endpoint
  const rawGclid: unknown = body?.gclid;
  if (typeof rawGclid !== "string") return json({ error: "gclid_required" }, 400);
  // Unwrap GCL.{seconds}.{gclid} wrapper if WP sent the cookie value
  let gclid = rawGclid.trim();
  if (gclid.startsWith("GCL.")) {
    const parts = gclid.split(".");
    if (parts.length >= 3) gclid = parts.slice(2).join(".");
  }
  if (!GCLID_RE.test(gclid)) return json({ error: "invalid_gclid_format" }, 400);

  const rawEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;
  const email = rawEmail && EMAIL_RE.test(rawEmail) && rawEmail.length <= 320 ? rawEmail : null;

  const ga4 = typeof body?.ga4_client_id === "string" && body.ga4_client_id.length <= 100
    ? body.ga4_client_id
    : null;
  const ua = typeof body?.user_agent === "string" ? body.user_agent.slice(0, 500) : null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await admin
    .from("ab_checkout_intents")
    .insert({
      email,
      cart_id: null,
      site_variant: "legacy",
      ab_test: "rdw_replatform_dev",
      ga4_client_id: ga4,
      gclid,
      user_agent: ua,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[ingest-wp-intent] insert failed", error);
    return json({ error: "insert_failed", details: error.message }, 500);
  }

  return json({ ok: true, id: data?.id });
});