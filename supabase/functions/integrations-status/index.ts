// Returns configuration + lightweight validity for every integration the
// platform supports. CMS-only callers (admins) see this; we never return
// secret values, only booleans + error messages.
//
// Optional ?test=ga4|meta|resend|vinoshipper|stripe runs a non-destructive
// liveness ping for that integration and returns the result.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Status = {
  key: string;
  label: string;
  category: "analytics" | "ads" | "commerce" | "email" | "payments" | "other";
  configured: boolean;
  required_secrets: string[];
  missing_secrets: string[];
  valid?: boolean | null;
  error?: string | null;
  notes?: string;
};

function check(key: string, label: string, category: Status["category"], required: string[], notes?: string): Status {
  const missing = required.filter((k) => !Deno.env.get(k));
  return {
    key,
    label,
    category,
    configured: missing.length === 0 && required.length > 0,
    required_secrets: required,
    missing_secrets: missing,
    valid: null,
    notes,
  };
}

async function pingGa4(): Promise<{ valid: boolean; error?: string; debug?: any }> {
  const id = Deno.env.get("GA4_MEASUREMENT_ID");
  const sec = Deno.env.get("GA4_API_SECRET");
  if (!id || !sec) return { valid: false, error: "missing secrets" };
  const url = `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(sec)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: `ping.${Date.now()}`,
      events: [{ name: "integration_ping", params: { debug_mode: true } }],
    }),
  });
  const txt = await r.text().catch(() => "");
  let parsed: any = txt; try { parsed = JSON.parse(txt); } catch { /**/ }
  const valMsgs = Array.isArray(parsed?.validationMessages) ? parsed.validationMessages : [];
  return { valid: r.ok && valMsgs.length === 0, error: valMsgs[0]?.description, debug: parsed };
}

async function pingMeta(): Promise<{ valid: boolean; error?: string }> {
  const pid = Deno.env.get("META_PIXEL_ID");
  const tok = Deno.env.get("META_CAPI_TOKEN");
  if (!pid || !tok) return { valid: false, error: "missing secrets" };
  // GET pixel metadata — confirms token works for this pixel.
  const r = await fetch(`https://graph.facebook.com/v19.0/${pid}?fields=id,name&access_token=${encodeURIComponent(tok)}`);
  const txt = await r.text().catch(() => "");
  if (!r.ok) return { valid: false, error: `Meta ${r.status} ${txt.slice(0, 200)}` };
  return { valid: true };
}

async function pingResend(): Promise<{ valid: boolean; error?: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { valid: false, error: "missing secret" };
  const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) return { valid: false, error: `Resend ${r.status}` };
  await r.text();
  return { valid: true };
}

async function pingVinoshipper(): Promise<{ valid: boolean; error?: string }> {
  const id = Deno.env.get("VINOSHIPPER_API_KEY_ID");
  const sec = Deno.env.get("VINOSHIPPER_API_SECRET");
  const producer = Deno.env.get("VINOSHIPPER_PRODUCER_ID");
  if (!id || !sec || !producer) return { valid: false, error: "missing secrets" };
  const auth = btoa(`${id}:${sec}`);
  const r = await fetch(`https://vinoshipper.com/api/v3/producer/${producer}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  await r.text();
  if (!r.ok) return { valid: false, error: `Vinoshipper ${r.status}` };
  return { valid: true };
}

async function pingStripe(): Promise<{ valid: boolean; error?: string }> {
  const key = Deno.env.get("STRIPE_SANDBOX_API_KEY");
  if (!key) return { valid: false, error: "missing secret" };
  const r = await fetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${key}` } });
  await r.text();
  if (!r.ok) return { valid: false, error: `Stripe ${r.status}` };
  return { valid: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: must be admin/owner or cms_editor.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsRes, error: claimsErr } = await supa.auth.getClaims(token);
  if (claimsErr || !claimsRes?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const uid = claimsRes.claims.sub as string;
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await service.from("user_roles").select("role").eq("user_id", uid);
  const allowed = (roles ?? []).some((r: any) => ["owner", "admin", "cms_editor"].includes(String(r.role)));
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const url = new URL(req.url);
  const test = url.searchParams.get("test");

  // If a single test is requested, run only that ping.
  if (test) {
    let result: any;
    switch (test) {
      case "ga4": result = await pingGa4(); break;
      case "meta": result = await pingMeta(); break;
      case "resend": result = await pingResend(); break;
      case "vinoshipper": result = await pingVinoshipper(); break;
      case "stripe": result = await pingStripe(); break;
      default:
        return new Response(JSON.stringify({ error: `unknown test: ${test}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, test, result }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Full status report.
  const integrations: Status[] = [
    check("gtm", "Google Tag Manager", "analytics", [], "Container GTM-NHTH66HM hardcoded in index.html"),
    check("ga4", "Google Analytics 4 (Measurement Protocol)", "analytics", ["GA4_MEASUREMENT_ID", "GA4_API_SECRET"]),
    check("meta_capi", "Meta Conversions API", "ads", ["META_PIXEL_ID", "META_CAPI_TOKEN"]),
    check("meta_test", "Meta Test Event Code (optional)", "ads", ["META_TEST_EVENT_CODE"], "Falls back to TEST12345 in debug"),
    check("tiktok", "TikTok Events API (optional)", "ads", ["TIKTOK_PIXEL_ID", "TIKTOK_ACCESS_TOKEN"]),
    check("pinterest", "Pinterest Conversions API (optional)", "ads", ["PINTEREST_TAG_ID", "PINTEREST_ACCESS_TOKEN"]),
    check("vinoshipper", "Vinoshipper", "commerce", ["VINOSHIPPER_API_KEY_ID", "VINOSHIPPER_API_SECRET", "VINOSHIPPER_PRODUCER_ID"]),
    check("vinoshipper_webhook_secret", "Vinoshipper Webhook Secret", "commerce", ["VINOSHIPPER_WEBHOOK_SECRET"], "Optional shared-secret check on inbound webhooks"),
    check("resend", "Resend (email)", "email", ["RESEND_API_KEY"]),
    check("stripe_sandbox", "Stripe (sandbox)", "payments", ["STRIPE_SANDBOX_API_KEY"]),
  ];

  return new Response(JSON.stringify({ ok: true, integrations }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});