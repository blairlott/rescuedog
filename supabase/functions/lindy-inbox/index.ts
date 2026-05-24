// Stable read endpoint for Lindy + Claude to pull lindy_inbox items.
//
// Auth: shared bearer (LINDY_EXPORT_TOKEN) so Lindy doesn't need a Supabase JWT
// and doesn't get coupled to anon-key rotation.
//
// GET  /lindy-inbox?source=slack&since=2026-05-24T00:00:00Z&limit=50
//        &workflow_status=open&unread=true
//   → { ok, count, items: [...] }
//
// POST /lindy-inbox  body: { action:"ack", ids:[uuid,...], note?:string }
//   → marks workflow_status='ack' so polled items aren't re-served.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const expected = Deno.env.get("LINDY_EXPORT_TOKEN");
  if (!expected || token !== expected) {
    return j({ error: "unauthorized", hint: "send `Authorization: Bearer <LINDY_EXPORT_TOKEN>`" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (req.method === "GET") {
    const url = new URL(req.url);
    const source = url.searchParams.get("source");
    const since = url.searchParams.get("since");
    const workflow = url.searchParams.get("workflow_status");
    const unread = url.searchParams.get("unread") === "true";
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || "50")));

    let q = admin
      .from("lindy_inbox")
      .select("id,source,type,payload,source_url,confidence,status,workflow_status,owner,thread_ts,external_id,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (source) q = q.eq("source", source);
    if (since) q = q.gte("created_at", since);
    if (workflow) q = q.eq("workflow_status", workflow);
    if (unread) q = q.or("workflow_status.is.null,workflow_status.eq.open");

    const { data, error } = await q;
    if (error) return j({ error: "query_failed", details: error.message }, 500);
    return j({ ok: true, count: data?.length ?? 0, items: data ?? [] });
  }

  if (req.method === "POST") {
    let body: any;
    try { body = await req.json(); } catch { return j({ error: "invalid json" }, 400); }
    if (body?.action !== "ack" || !Array.isArray(body?.ids) || body.ids.length === 0) {
      return j({ error: "bad_request", hint: 'POST { action:"ack", ids:[uuid,...], note? }' }, 400);
    }
    const { error } = await admin
      .from("lindy_inbox")
      .update({
        workflow_status: "ack",
        workflow_note: body.note ?? null,
        workflow_updated_at: new Date().toISOString(),
        workflow_updated_by: "lindy",
      })
      .in("id", body.ids);
    if (error) return j({ error: "ack_failed", details: error.message }, 500);
    return j({ ok: true, acked: body.ids.length });
  }

  return j({ error: "method_not_allowed" }, 405);
});