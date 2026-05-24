// Slack interactivity endpoint — receives button clicks from #lindy-lovable
// digest messages and acts on the Lindy inbox queue.
//
// Set this URL as Interactivity Request URL in your Slack app config:
//   https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/slack-interactivity
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET")!;
const BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;

async function verifySlackSignature(req: Request, rawBody: string): Promise<boolean> {
  const ts = req.headers.get("x-slack-request-timestamp");
  const sig = req.headers.get("x-slack-signature");
  if (!ts || !sig) return false;
  // Reject replays > 5 min
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const base = `v0:${ts}:${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `v0=${hex}` === sig;
}

async function slackPost(method: string, body: Record<string, unknown>) {
  return fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${BOT_TOKEN}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const raw = await req.text();

  if (!(await verifySlackSignature(req, raw))) {
    return new Response("invalid signature", { status: 401 });
  }

  // Slack sends payload as application/x-www-form-urlencoded with payload=<json>
  const params = new URLSearchParams(raw);
  const payloadStr = params.get("payload");
  if (!payloadStr) return new Response("no payload", { status: 400 });
  const payload = JSON.parse(payloadStr);

  const action = payload?.actions?.[0];
  const actionId: string = action?.action_id ?? "";
  const userName: string = payload?.user?.name ?? payload?.user?.username ?? "someone";
  const channelId: string = payload?.channel?.id;
  const messageTs: string = payload?.message?.ts;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ACK fast (must reply within 3s)
  const respond = (text: string) =>
    new Response(JSON.stringify({ response_type: "in_channel", replace_original: false, text }), {
      headers: { "Content-Type": "application/json" },
    });

  if (actionId === "work_queue") {
    // Snapshot current unhandled items and mark them in_progress.
    const { data: items, error: selErr } = await admin
      .from("lindy_inbox")
      .select("id,type,payload,workflow_status")
      .eq("status", "approved")
      .or("workflow_status.is.null,workflow_status.in.(approved,needs_blair,blocked)");
    if (selErr) return respond(`:warning: couldn't read queue: ${selErr.message}`);

    const ids = (items ?? []).map((r: any) => r.id);
    if (ids.length === 0) {
      return respond(`:white_check_mark: queue already clear (clicked by @${userName}).`);
    }

    const { error: upErr } = await admin
      .from("lindy_inbox")
      .update({
        workflow_status: "in_progress",
        owner: "lovable",
        workflow_note: `Picked up via Slack button by @${userName}`,
        workflow_updated_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (upErr) return respond(`:warning: couldn't claim queue: ${upErr.message}`);

    // Threaded confirmation
    if (channelId && messageTs) {
      await slackPost("chat.postMessage", {
        channel: channelId,
        thread_ts: messageTs,
        text: `:hammer_and_wrench: @${userName} claimed *${ids.length}* item(s). Lovable will action them on the next pickup.`,
      });
    }
    return respond(`:hammer_and_wrench: claimed ${ids.length} item(s).`);
  }

  if (actionId === "snooze_queue") {
    // Bump escalation throttle so we don't re-alert immediately.
    await admin
      .from("app_settings")
      .upsert({ key: "slack_escalation_last_at", value: new Date().toISOString() as any }, { onConflict: "key" });
    return respond(`:zzz: queue snoozed by @${userName}. Escalation paused for the throttle window.`);
  }

  return respond(`:question: unknown action: ${actionId}`);
});