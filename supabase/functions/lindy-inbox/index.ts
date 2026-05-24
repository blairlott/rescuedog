// Stable read endpoint for Lindy + Claude to pull lindy_inbox items.
// Auth: shared bearer (LINDY_EXPORT_TOKEN).
// GET  /lindy-inbox?source=slack&since=ISO&limit=50&workflow_status=open&unread=true
// POST /lindy-inbox  body: { action:"ack", ids:[uuid,...], note? }

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SLACK_CH = "C0B5KT989GT";
const lastPing = new Map<string, number>();

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function redact(v: string | null) {
  if (!v) return null;
  if (v.length <= 8) return "***";
  return `${v.slice(0, 4)}…${v.slice(-4)} (len=${v.length})`;
}

function diag(req: Request, url: URL) {
  const h = req.headers;
  const params: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) params[k] = v;
  return {
    endpoint: "lindy-inbox",
    method: req.method,
    received_headers: {
      authorization: redact(h.get("authorization")),
      "x-api-key": redact(h.get("x-api-key")),
      "user-agent": h.get("user-agent") ?? null,
      "content-type": h.get("content-type") ?? null,
    },
    query_params: params,
    request_id: crypto.randomUUID(),
    at: new Date().toISOString(),
  };
}

async function pingSlack(payload: Record<string, unknown>, dedupeKey: string) {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  if (!token) return;
  const now = Date.now();
  const prev = lastPing.get(dedupeKey) ?? 0;
  if (now - prev < 60_000) return; // 1/min per key
  lastPing.set(dedupeKey, now);
  const text = "⚠️ *lindy-inbox auth failure* — Lindy/Claude self-diagnose:\n```" + JSON.stringify(payload, null, 2) + "```";
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel: SLACK_CH, text }),
    });
  } catch { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  // Auth
  const authHeader = req.headers.get("Authorization") ?? "";
  const apiKey = req.headers.get("x-api-key") ?? "";
  const bearer = /^bearer\s+/i.test(authHeader) ? authHeader.replace(/^bearer\s+/i, "").trim() : "";
  const expected = Deno.env.get("LINDY_EXPORT_TOKEN");

  if (!expected) {
    const d = diag(req, url);
    return j({ error: "server_misconfigured", reason: "LINDY_EXPORT_TOKEN env not set on edge function", ...d }, 500);
  }

  const presented = bearer || apiKey;
  if (!presented) {
    const d = diag(req, url);
    const body = { error: "unauthorized", reason: "no_credential_presented", missing: ["Authorization: Bearer <LINDY_EXPORT_TOKEN>", "or x-api-key: <LINDY_EXPORT_TOKEN>"], hint: "Send Authorization header in the format `Bearer <token>` OR x-api-key header.", ...d };
    await pingSlack(body, `lindy-inbox:nocred:${req.headers.get("user-agent") ?? "unknown"}`);
    return j(body, 401);
  }
  if (presented !== expected) {
    const d = diag(req, url);
    const body = { error: "unauthorized", reason: "token_mismatch", presented_token: redact(presented), expected_len: expected.length, hint: "Token doesn't match LINDY_EXPORT_TOKEN. Verify it's the current token and has no leading/trailing whitespace.", ...d };
    await pingSlack(body, `lindy-inbox:mismatch:${redact(presented)}`);
    return j(body, 401);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (req.method === "GET") {
    const source = url.searchParams.get("source");
    const since = url.searchParams.get("since");
    const workflow = url.searchParams.get("workflow_status");
    const unread = url.searchParams.get("unread") === "true";
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || "50")));

    let q = admin.from("lindy_inbox")
      .select("id,source,type,payload,source_url,confidence,status,workflow_status,owner,thread_ts,external_id,created_at,updated_at")
      .order("created_at", { ascending: false }).limit(limit);
    if (source) q = q.eq("source", source);
    if (since) q = q.gte("created_at", since);
    if (workflow) q = q.eq("workflow_status", workflow);
    // "unread" = anything not yet worked. Includes null, 'open', and 'queued'
    // (slack-events auto-flags new Slack messages as 'queued').
    if (unread) q = q.or("workflow_status.is.null,workflow_status.eq.open,workflow_status.eq.queued");

    const { data, error } = await q;
    if (error) return j({ error: "query_failed", details: error.message, ...diag(req, url) }, 500);
    return j({ ok: true, count: data?.length ?? 0, items: data ?? [] });
  }

  if (req.method === "POST") {
    let body: any;
    try { body = await req.json(); } catch { return j({ error: "invalid_json", ...diag(req, url) }, 400); }
    if (body?.action !== "ack" || !Array.isArray(body?.ids) || body.ids.length === 0) {
      return j({ error: "bad_request", reason: "missing or invalid action/ids", expected: 'POST { action:"ack", ids:[uuid,...], note? }', received: { action: body?.action, ids_type: Array.isArray(body?.ids) ? `array(${body.ids.length})` : typeof body?.ids }, ...diag(req, url) }, 400);
    }
    const { error } = await admin.from("lindy_inbox").update({
      workflow_status: "ack",
      workflow_note: body.note ?? null,
      workflow_updated_at: new Date().toISOString(),
    }).in("id", body.ids);
    if (error) return j({ error: "ack_failed", details: error.message, ...diag(req, url) }, 500);
    return j({ ok: true, acked: body.ids.length });
  }

  return j({ error: "method_not_allowed", ...diag(req, url) }, 405);
});
