// Cron-driven digest: posts unhandled lindy_inbox items to #lindy-lovable
// so Lovable picks them up next time Blair opens chat. Runs 4x/day per CRON.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const CHANNEL = "C0B5KT989GT";

Deno.serve(async (_req) => {
  const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
  if (!slackToken) return new Response("no SLACK_BOT_TOKEN", { status: 500 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Unhandled = approved but no workflow_status of done/in_progress
  const { data: items, error } = await admin
    .from("lindy_inbox")
    .select("id,type,submitted_by,payload,created_at,workflow_status")
    .eq("status", "approved")
    .or("workflow_status.is.null,workflow_status.in.(approved,needs_blair,blocked)")
    .order("created_at", { ascending: false })
    .limit(15);

  if (error) return new Response(error.message, { status: 500 });

  const now = new Date().toISOString();
  const count = items?.length ?? 0;
  const lines = (items ?? []).map((r: any, i: number) => {
    const txt = (r.payload?.text ?? r.payload?.title ?? r.type ?? "").toString().slice(0, 140);
    return `${i + 1}. _${r.workflow_status ?? "approved"}_ — ${txt}`;
  });

  const text = count === 0
    ? `:white_check_mark: Lovable scheduled check (${now}): inbox clear, nothing queued.`
    : `:mag: Lovable scheduled check (${now}) — *${count}* item(s) waiting:\n${lines.join("\n")}\n\n_Blair: open Lovable chat and say "work the queue" to action these._`;

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Authorization": `Bearer ${slackToken}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: CHANNEL, text }),
  });
  const j = await res.json();
  return new Response(JSON.stringify({ ok: j.ok, count }), {
    headers: { "Content-Type": "application/json" },
  });
});