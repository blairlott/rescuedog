// Slack Events API receiver for #lindy-lovable (C0B5KT989GT).
// - Verifies X-Slack-Signature using SLACK_SIGNING_SECRET (HMAC SHA256).
// - Handles url_verification challenge.
// - Ingests message events from the allowed channel into public.lindy_inbox.
// - Skips bot messages and message_changed/deleted subtypes to avoid loops.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-slack-signature, x-slack-request-timestamp",
};

const ALLOWED_CHANNEL = "C0B5KT989GT"; // #lindy-lovable

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function verifySlack(req: Request, rawBody: string, secret: string): Promise<boolean> {
  const ts = req.headers.get("x-slack-request-timestamp");
  const sig = req.headers.get("x-slack-signature");
  if (!ts || !sig) return false;
  // Reject replays older than 5 minutes
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 5) return false;
  const base = `v0:${ts}:${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const macBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base));
  const hex = [...new Uint8Array(macBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(`v0=${hex}`, sig);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  }

  const secret = Deno.env.get("SLACK_SIGNING_SECRET");
  if (!secret) {
    return new Response(JSON.stringify({ error: "SLACK_SIGNING_SECRET not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();

  if (!(await verifySlack(req, rawBody, secret))) {
    return new Response("invalid signature", { status: 401, headers: corsHeaders });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("bad json", { status: 400, headers: corsHeaders });
  }

  // URL verification handshake
  if (payload.type === "url_verification") {
    return new Response(JSON.stringify({ challenge: payload.challenge }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (payload.type !== "event_callback" || !payload.event) {
    return new Response(JSON.stringify({ ok: true, ignored: "non-event" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ev = payload.event;

  // Only message events in the allowed channel
  if (ev.type !== "message" || ev.channel !== ALLOWED_CHANNEL) {
    return new Response(JSON.stringify({ ok: true, ignored: "channel/type" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // Skip bot echoes, edits, deletes, channel joins, etc.
  if (ev.bot_id || ev.subtype) {
    return new Response(JSON.stringify({ ok: true, ignored: `subtype:${ev.subtype ?? "bot"}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const externalId = `slack:${ev.channel}:${ev.ts}`;
  const threadTs = ev.thread_ts ?? ev.ts;

  const { error } = await admin
    .from("lindy_inbox")
    .upsert(
      {
        type: "slack_message",
        source: "slack",
        external_id: externalId,
        thread_ts: threadTs,
        submitted_by: ev.user ?? "unknown",
        status: "pending",
        payload: {
          channel: ev.channel,
          channel_name: "lindy-lovable",
          user: ev.user,
          ts: ev.ts,
          thread_ts: threadTs,
          text: ev.text ?? "",
          team: payload.team_id,
          event_id: payload.event_id,
          raw: ev,
        },
      },
      { onConflict: "source,external_id", ignoreDuplicates: true },
    );

  if (error) {
    console.error("lindy_inbox insert failed", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, external_id: externalId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});