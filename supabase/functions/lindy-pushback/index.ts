// Push a Lindy inbox draft back to Lindy via email (parsed by Lindy like the [KENNEL-SMS] trigger).
// Body: { draft_id: string, note: string }
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_URL = "https://rescuedog.lovable.app";
const LINDY_WATCH_ADDRESS = "blair.lott@rescuedogwines.com";
// Lindy Mail inbox watched by Lindy's email trigger — primary parse path.
const LINDY_MAIL_ADDRESS = Deno.env.get("LINDY_MAIL_ADDRESS") ?? "default-blair.lott@lindymail.ai";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { draft_id, note } = await req.json().catch(() => ({}));
    if (!draft_id || typeof draft_id !== "string") return json({ error: "draft_id required" }, 400);
    if (!note || typeof note !== "string" || note.trim().length === 0) return json({ error: "note required" }, 400);
    if (!RESEND_KEY) return json({ error: "RESEND_API_KEY missing" }, 500);

    // Auth: require a logged-in CMS editor
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: isEditor } = await userClient.rpc("is_cms_editor", { _user_id: user.id });
    if (!isEditor) return json({ error: "forbidden" }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: draft, error: dErr } = await admin
      .from("lindy_inbox").select("*").eq("id", draft_id).maybeSingle();
    if (dErr || !draft) return json({ error: "draft not found" }, 404);

    const deep_link = `${ADMIN_URL}/cms/lindy-inbox`;
    const subject = `[LINDY-PUSHBACK] ${draft.type} · ${draft.confidence ?? "—"} · ${String(draft_id).slice(0, 8)}`;
    const payload = {
      event_type: "lindy_pushback",
      draft_id: draft.id,
      type: draft.type,
      confidence: draft.confidence,
      source_url: draft.source_url,
      submitted_by: draft.submitted_by,
      created_at: draft.created_at,
      reviewer_note: note.trim(),
      reviewer_email: user.email,
      draft_payload: draft.payload,
      deep_link,
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#fff;color:#000;padding:24px;">
      <h2 style="margin:0 0 12px;color:#c30017;text-transform:uppercase;letter-spacing:.05em;font-size:14px;">Lindy Pushback · ${esc(draft.type)}</h2>
      <p style="margin:0 0 8px;font-size:14px;"><b>Reviewer note:</b></p>
      <p style="margin:0 0 16px;font-size:14px;white-space:pre-wrap;">${esc(note.trim())}</p>
      <p style="margin:0 0 4px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.05em;">Draft payload (JSON)</p>
      <pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap;background:#f6f6f6;padding:12px;">${esc(jsonStr)}</pre>
      <p style="margin-top:20px;"><a href="${deep_link}" style="background:#c30017;color:#fff;padding:10px 16px;text-decoration:none;text-transform:uppercase;letter-spacing:.05em;font-size:12px;">Open Lindy Inbox</a></p>
      </body></html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Lindy Pushback <alerts@rescuedogwines.com>",
        to: [LINDY_MAIL_ADDRESS],
        cc: [LINDY_WATCH_ADDRESS],
        subject,
        html,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: `resend ${res.status}: ${JSON.stringify(j)}` }, 502);

    const newNotes = `${draft.reviewer_notes ? draft.reviewer_notes + "\n" : ""}[pushed back by ${user.email}] ${note.trim()}`;
    await admin.from("lindy_inbox").update({
      status: "pushed_back",
      reviewer_id: user.id,
      reviewer_notes: newNotes,
      reviewed_at: new Date().toISOString(),
    }).eq("id", draft_id);

    return json({ ok: true, email_id: j.id });
  } catch (e) {
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});