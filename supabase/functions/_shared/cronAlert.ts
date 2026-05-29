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

/**
 * Returns true if the request has a valid x-cron-secret OR a valid service-role
 * JWT in the Authorization header; otherwise logs+alerts and returns false.
 *
 * The service-role fallback exists so other edge functions (which authenticate
 * with the project service-role key) can invoke cron-gated functions like
 * kennel-alert-dispatch without needing CRON_SECRET.
 */
export async function verifyCronSecret(req: Request, functionName: string): Promise<boolean> {
  // Path 1 — existing cron header (do not alert yet; JWT may still succeed).
  const headerOk = await checkSharedSecret(req, {
    functionName,
    envVar: "CRON_SECRET",
    headers: ["x-cron-secret"],
    alertOnFail: false,
  });
  if (headerOk) return true;

  // Path 2 — service-role JWT in Authorization: Bearer <jwt>.
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token.length > 0) {
      try {
        const { data, error } = await admin().auth.getClaims(token);
        const role = (data?.claims as { role?: string } | undefined)?.role;
        if (!error && role === "service_role") return true;
      } catch (_) { /* fall through to auth_fail */ }
    }
  }

  // Both paths failed — log + alert once.
  await logCronRun(functionName, "auth_fail", {
    httpStatus: 401,
    error: "missing/invalid x-cron-secret and no valid service-role JWT",
    metadata: { ua: req.headers.get("user-agent") ?? null },
  });
  return false;
}

export type SharedSecretOpts = {
  /** Function name used for the cron_run_log entry / Slack alert. */
  functionName: string;
  /** Env var that holds the expected secret value. */
  envVar: string;
  /** Accepted request header names. First entry is canonical. Defaults to ["x-cron-secret"]. */
  headers?: string[];
  /**
   * When true, a failed check writes an `auth_fail` row + Slack alert.
   * Set to false when the caller has a JWT fallback path and a missing/invalid
   * header is NOT yet a failure (only becomes one if JWT also fails).
   */
  alertOnFail?: boolean;
};

/**
 * Single source of truth for shared-secret auth across every cron / admin-gated
 * edge function. Trims both sides, rejects empty env vars, supports multiple
 * accepted header names for backward compatibility with already-scheduled cron
 * jobs that use legacy header names (e.g. `x-kennel-cron-secret`,
 * `x-admin-secret`).
 *
 * Returns true when one of the headers presents the expected secret.
 */
export async function checkSharedSecret(req: Request, opts: SharedSecretOpts): Promise<boolean> {
  const expected = Deno.env.get(opts.envVar)?.trim();
  const headerNames = opts.headers && opts.headers.length > 0 ? opts.headers : ["x-cron-secret"];

  let presented = "";
  for (const h of headerNames) {
    const v = req.headers.get(h)?.trim();
    if (v) { presented = v; break; }
  }

  const ok = !!expected && presented.length > 0 && presented === expected;
  if (!ok && opts.alertOnFail) {
    await logCronRun(opts.functionName, "auth_fail", {
      httpStatus: 401,
      error: `missing or invalid ${headerNames[0]} (env ${opts.envVar})`,
      metadata: { ua: req.headers.get("user-agent") ?? null },
    });
  }
  return ok;
}