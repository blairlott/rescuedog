// Shared cron-run logger + Slack alerter for gated cron-driven functions.
// Logs every invocation into public.cron_run_log and posts to Slack on auth_fail/error.
import { createClient } from "npm:@supabase/supabase-js@2";

const SLACK_ALERT_CHANNEL = "C0B5KT989GT";

export type CronStatus = "ok" | "auth_fail" | "error";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function postSlack(text: string) {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  if (!token) return;
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel: SLACK_ALERT_CHANNEL, text }),
    });
  } catch (_) { /* swallow */ }
}

export async function logCronRun(
  functionName: string,
  status: CronStatus,
  opts: { httpStatus?: number; error?: string; metadata?: Record<string, unknown> } = {},
) {
  try {
    await admin().from("cron_run_log").insert({
      function_name: functionName,
      status,
      http_status: opts.httpStatus ?? null,
      error_message: opts.error ?? null,
      metadata: opts.metadata ?? {},
    });
  } catch (_) { /* never block the function on logging */ }

  if (status !== "ok") {
    const emoji = status === "auth_fail" ? ":lock:" : ":rotating_light:";
    const head = status === "auth_fail" ? "AUTH FAIL" : "ERROR";
    const err = opts.error ? `\n\`\`\`${opts.error.slice(0, 1800)}\`\`\`` : "";
    await postSlack(`${emoji} *${head}* — \`${functionName}\` (HTTP ${opts.httpStatus ?? "?"})${err}`);
  }
}

/** Returns true if the request has a valid x-cron-secret; otherwise logs+alerts and returns false. */
export async function verifyCronSecret(req: Request, functionName: string): Promise<boolean> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    await logCronRun(functionName, "auth_fail", {
      httpStatus: 401,
      error: "missing or invalid x-cron-secret",
      metadata: { ua: req.headers.get("user-agent") ?? null },
    });
    return false;
  }
  return true;
}