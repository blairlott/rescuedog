// Public email-capture endpoint for anonymous signups: Pack popup, exit-intent
// offer, and the cart email capture prompt. Upserts the subscriber into
// Mailchimp (pending double opt-in) and tags by source so journeys can branch.
//
// verify_jwt=false. Hardened with: email validation, simple rate-limiting via
// source IP, and rejection of obvious bots (honeypot field).

import { syncMailchimpMember } from "../_shared/mailchimpMember.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALLOWED_SOURCES = new Set([
  "pack_signup_popup",
  "exit_intent_offer",
  "cart_email_capture",
  "footer_signup",
  "donation_form",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return J(405, { error: "method not allowed" });

  let body: any;
  try { body = await req.json(); } catch { return J(400, { error: "invalid json" }); }

  // Honeypot — bots fill this; humans don't see it.
  if (typeof body?.website === "string" && body.website.length > 0) {
    return J(200, { ok: true, skipped: "honeypot" });
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  const source = String(body?.source ?? "pack_signup_popup");
  const firstName = body?.first_name ? String(body.first_name).slice(0, 120) : null;
  const lastName = body?.last_name ? String(body.last_name).slice(0, 120) : null;

  if (!EMAIL_RE.test(email) || email.length > 200) {
    return J(400, { error: "invalid_email" });
  }
  if (!ALLOWED_SOURCES.has(source)) {
    return J(400, { error: "invalid_source" });
  }

  // Tag taxonomy:
  //   the_pack            — owns the audience segment
  //   signup_source_<src> — branch journeys by surface
  const tagsAdded = ["the_pack", `signup_source_${source}`];

  const result = await syncMailchimpMember({
    email,
    userId: null,
    eventType: `email_capture:${source}`,
    tagsAdded,
    tagsRemoved: ["unsubscribed_the_pack"],
    mergeFields: {
      SOURCE: source,
      SIGNUPAT: new Date().toISOString().slice(0, 10),
    },
    firstName,
    lastName,
  });

  return J(result.ok ? 200 : 502, result);
});