// Periodic health check for the Kennel alert pipeline.
// Runs hourly via pg_cron. Reads recent alert_dispatch_log rows; if the success
// ratio over the last 60 minutes is poor (or all recent dispatches failed),
// sends a direct Resend email to ops bypassing the Lindy path that may be down.
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_URL = "https://rescuedog.lovable.app";
const FROM = "Kennel Health <alerts@rescuedogwines.com>";
const FALLBACK_RECIPIENTS = ["blair.lott@rescuedogwines.com"];

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sendDirect(to: string[], subject: string, html: string) {
  if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY missing" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, id: j?.id, error: res.ok ? undefined : `resend ${res.status}: ${JSON.stringify(j)}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from("alert_dispatch_log")
    .select("id, success, error, event_type, channels_sent, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (error) return json({ error: error.message }, 500);

  // Ignore prior health-check rows so we don't loop on ourselves.
  const real = (rows ?? []).filter((r: any) => r.event_type !== "health_check_failed");
  const total = real.length;
  const ok = real.filter((r: any) => r.success).length;
  const failed = total - ok;
  const ratio = total === 0 ? 1 : ok / total;

  // Trigger if: at least 3 attempts AND <50% success, OR last 3 in a row all failed.
  const lastThreeFailed = real.slice(0, 3).length === 3 && real.slice(0, 3).every((r: any) => !r.success);
  const degraded = (total >= 3 && ratio < 0.5) || lastThreeFailed;

  if (!degraded) {
    return json({ ok: true, total, success: ok, ratio, degraded: false });
  }

  // Suppression: don't fire more than once per 6h.
  const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: recentHealth } = await admin
    .from("alert_dispatch_log")
    .select("id")
    .eq("event_type", "health_check_failed")
    .gte("created_at", sixHoursAgo)
    .limit(1);
  if (recentHealth && recentHealth.length > 0) {
    return json({ ok: true, degraded: true, suppressed: true });
  }

  // Get configured recipients (fallback to default).
  let to: string[] = FALLBACK_RECIPIENTS;
  try {
    const { data } = await admin.from("ad_settings").select("value").eq("key", "alert_recipients").maybeSingle();
    const emails = (data?.value as any)?.email;
    if (Array.isArray(emails) && emails.length > 0) to = emails;
  } catch (_) { /* keep fallback */ }

  const lastErrors = real.filter((r: any) => !r.success).slice(0, 5).map((r: any) => `• ${new Date(r.created_at).toLocaleString()} — ${r.event_type} — ${r.error ?? "no error"}`).join("<br/>");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#000;padding:24px;">
  <h2 style="margin:0 0 12px;color:#c30017;text-transform:uppercase;letter-spacing:.05em;font-size:14px;">Kennel Alert Pipeline Degraded</h2>
  <p style="font-size:14px;">In the last 60 minutes: <b>${ok}/${total}</b> dispatches succeeded (${(ratio * 100).toFixed(0)}%).</p>
  <p style="font-size:14px;">This usually means the Lindy email watcher is down. Twilio fallback is opt-in and may not be configured.</p>
  ${lastErrors ? `<p style="font-size:12px;color:#666;">Recent failures:<br/>${lastErrors}</p>` : ""}
  <p style="margin-top:20px;"><a href="${ADMIN_URL}/kennel/log" style="background:#c30017;color:#fff;padding:10px 16px;text-decoration:none;text-transform:uppercase;letter-spacing:.05em;font-size:12px;">Open Execution Log</a></p>
  </body></html>`;

  const send = await sendDirect(to, "Kennel: alert pipeline degraded", html);

  await admin.from("alert_dispatch_log").insert({
    event_type: "health_check_failed",
    channel: "kennel",
    payload: { total, success: ok, failed, ratio, window_min: 60, sent_to: to },
    channels_sent: send.ok ? ["email"] : [],
    email_message_id: send.id ?? null,
    success: send.ok,
    error: send.error ?? null,
  });

  return json({ ok: send.ok, degraded: true, total, success: ok, ratio, send });
});
