// Cron-driven digest: posts unhandled lindy_inbox items to #lindy-lovable
// so Lovable picks them up next time Blair opens chat. Runs 4x/day per CRON.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const CHANNEL = "C0B5KT989GT";

Deno.serve(async (req) => {
  const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
  if (!slackToken) return new Response("no SLACK_BOT_TOKEN", { status: 500 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Honor configurable schedule unless explicitly forced.
  let force = false;
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    force = body?.force === true;
  } catch { /* ignore */ }

  if (!force) {
    const { data: setting } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "slack_digest_hours_utc")
      .maybeSingle();
    const hours: number[] = Array.isArray(setting?.value) ? setting!.value as number[] : [14, 18, 22, 6];
    const currentHour = new Date().getUTCHours();
    if (!hours.includes(currentHour)) {
      return new Response(JSON.stringify({ ok: true, skipped: true, currentHour, hours }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Unhandled = approved but no workflow_status of done/in_progress
  const unhandledFilter = (q: any) =>
    q.eq("status", "approved")
     .or("workflow_status.is.null,workflow_status.in.(approved,needs_blair,blocked)");

  // Full count for escalation threshold
  const { count: totalCount, error: countErr } = await unhandledFilter(
    admin.from("lindy_inbox").select("id", { count: "exact", head: true })
  );
  if (countErr) return new Response(countErr.message, { status: 500 });

  const { data: items, error } = await unhandledFilter(
    admin.from("lindy_inbox").select("id,type,submitted_by,payload,created_at,workflow_status")
  ).order("created_at", { ascending: false }).limit(15);
  if (error) return new Response(error.message, { status: 500 });

  const now = new Date().toISOString();
  const count = totalCount ?? items?.length ?? 0;
  const lines = (items ?? []).map((r: any, i: number) => {
    const txt = (r.payload?.text ?? r.payload?.title ?? r.type ?? "").toString().slice(0, 140);
    return `${i + 1}. _${r.workflow_status ?? "approved"}_ — ${txt}`;
  });

  const text = count === 0
    ? `:white_check_mark: Lovable scheduled check (${now}): inbox clear, nothing queued.`
    : `:mag: Lovable scheduled check (${now}) — *${count}* item(s) waiting${count > lines.length ? ` (showing top ${lines.length})` : ""}:\n${lines.join("\n")}\n\n_Blair: open Lovable chat and say "work the queue" to action these._`;

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Authorization": `Bearer ${slackToken}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: CHANNEL, text }),
  });
  const j = await res.json();

  // ---- Escalation: if backlog exceeds threshold, post a loud @-mention ----
  let escalated = false;
  let escalationSkipReason: string | null = null;
  try {
    const { data: rows } = await admin
      .from("app_settings")
      .select("key,value")
      .in("key", [
        "slack_escalation_threshold",
        "slack_escalation_throttle_minutes",
        "slack_escalation_user_ids",
        "slack_escalation_last_at",
      ]);
    const map: Record<string, any> = {};
    (rows ?? []).forEach((r: any) => (map[r.key] = r.value));

    const threshold = Number(map.slack_escalation_threshold ?? 10);
    const throttleMin = Number(map.slack_escalation_throttle_minutes ?? 240);
    const mentionIds: string[] = Array.isArray(map.slack_escalation_user_ids) ? map.slack_escalation_user_ids : [];
    const lastAtRaw = typeof map.slack_escalation_last_at === "string" ? map.slack_escalation_last_at : null;
    const lastAt = lastAtRaw ? new Date(lastAtRaw).getTime() : 0;
    const sinceLastMin = (Date.now() - lastAt) / 60000;

    if (count < threshold) {
      escalationSkipReason = "below_threshold";
    } else if (sinceLastMin < throttleMin) {
      escalationSkipReason = `throttled (${Math.round(throttleMin - sinceLastMin)}m left)`;
    } else {
      const mentions = mentionIds.length
        ? mentionIds.map((id) => `<@${id}>`).join(" ") + " "
        : "";
      const escalationText =
        `:rotating_light: *ESCALATION* — unhandled Lindy inbox has *${count}* items ` +
        `(threshold: ${threshold}). ${mentions}Please clear the queue.\n` +
        `Action: open Lovable chat → "work the queue".`;
      const esc = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Authorization": `Bearer ${slackToken}`, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ channel: CHANNEL, text: escalationText, link_names: true }),
      });
      const ej = await esc.json();
      escalated = !!ej.ok;
      if (escalated) {
        await admin
          .from("app_settings")
          .upsert({ key: "slack_escalation_last_at", value: new Date().toISOString() as any }, { onConflict: "key" });
      } else {
        escalationSkipReason = `slack_error:${ej.error}`;
      }
    }
  } catch (e) {
    escalationSkipReason = `error:${(e as Error).message}`;
  }

  return new Response(JSON.stringify({ ok: j.ok, count, escalated, escalationSkipReason }), {
    headers: { "Content-Type": "application/json" },
  });
});