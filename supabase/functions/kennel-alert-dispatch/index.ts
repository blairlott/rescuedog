// Single entry point for Kennel ops alerts. Fans out to Resend (email) + Twilio (SMS).
// Body: { event_type, channel?, action, spend_impact_cents?, confidence?, deep_link?, message? }
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyCronSecret } from "../_shared/cronAlert.ts";
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const TWILIO_KEY = Deno.env.get("TWILIO_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const ADMIN_URL = "https://rescuedog.lovable.app";
const LINDY_WATCH_ADDRESS = "blair.lott@rescuedogwines.com";

const ALLOWED_EVENTS = ["anomaly","recommendation","auto_executed","rollback","pacing","manual_test"];

async function getRecipients(admin: any): Promise<{ email: string[]; sms: string[] }> {
  const { data } = await admin.from("ad_settings").select("value").eq("key", "alert_recipients").maybeSingle();
  const v = data?.value ?? {};
  return {
    email: Array.isArray(v.email) ? v.email : ["blair.lott@rescuedogwines.com"],
    sms: Array.isArray(v.sms) ? v.sms : ["+14043120550"],
  };
}

function fmtUsd(cents?: number) {
  if (cents == null) return "—";
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${Math.abs(cents / 100).toFixed(2)}`;
}

function buildEmailHtml(p: any): string {
  const link = p.deep_link ?? `${ADMIN_URL}/kennel`;
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#fff;color:#000;padding:24px;">
  <h2 style="margin:0 0 12px;color:#c30017;text-transform:uppercase;letter-spacing:.05em;font-size:14px;">Kennel Alert · ${p.event_type}</h2>
  <table style="border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Channel</td><td><b>${p.channel ?? "—"}</b></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Action</td><td>${p.action ?? "—"}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Spend impact</td><td>${fmtUsd(p.spend_impact_cents)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Confidence</td><td>${p.confidence != null ? Number(p.confidence).toFixed(2) : "—"}</td></tr>
  </table>
  ${p.message ? `<p style="margin:16px 0;font-size:14px;">${p.message}</p>` : ""}
  <p style="margin-top:20px;"><a href="${link}" style="background:#c30017;color:#fff;padding:10px 16px;text-decoration:none;text-transform:uppercase;letter-spacing:.05em;font-size:12px;">Open in Kennel</a></p>
  </body></html>`;
}

function buildSmsBody(p: any): string {
  const link = p.deep_link ?? `${ADMIN_URL}/kennel`;
  const parts = [
    `KENNEL ${String(p.event_type).toUpperCase()}`,
    p.channel ? `[${p.channel}]` : "",
    p.action ?? "",
    p.spend_impact_cents != null ? fmtUsd(p.spend_impact_cents) : "",
    p.confidence != null ? `conf ${Number(p.confidence).toFixed(2)}` : "",
  ].filter(Boolean).join(" ");
  return `${parts}\n${link}`.slice(0, 320);
}

async function sendEmail(to: string[], subject: string, html: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY missing" };
  if (to.length === 0) return { ok: false, error: "no email recipients" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Kennel Alerts <alerts@rescuedogwines.com>",
        to, subject, html,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `resend ${res.status}: ${JSON.stringify(j)}` };
    return { ok: true, id: j.id };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

async function sendSmsViaLindyEmail(to: string[], smsBody: string, payload: any): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY missing" };
  if (to.length === 0) return { ok: false, error: "no sms recipients" };
  const event_type = payload?.event_type ?? "alert";
  const channel = payload?.channel ?? "—";
  const action = payload?.action ?? "—";
  const subject = `[KENNEL-SMS] ${event_type} · ${channel} · ${action}`;
  const json = {
    event_type,
    channel: payload?.channel ?? null,
    action: payload?.action ?? null,
    spend_impact_cents: payload?.spend_impact_cents ?? null,
    confidence: payload?.confidence ?? null,
    recipients: to,
    sms_body: smsBody,
    deep_link: payload?.deep_link ?? `${ADMIN_URL}/kennel`,
  };
  const jsonStr = JSON.stringify(json, null, 2);
  const html = `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap;">${jsonStr.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))}</pre>`;
  const text = `\`\`\`json\n${jsonStr}\n\`\`\``;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Kennel Alerts <alerts@rescuedogwines.com>",
        to: [LINDY_WATCH_ADDRESS],
        subject,
        html,
        text,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `lindy_email ${res.status}: ${JSON.stringify(j)}` };
    return { ok: true, id: j.id };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

async function sendSmsViaTwilio(to: string[], body: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
  if (!TWILIO_KEY || !LOVABLE_API_KEY) return { ok: false, error: "Twilio not connected (TWILIO_API_KEY/LOVABLE_API_KEY missing)" };
  if (to.length === 0) return { ok: false, error: "no sms recipients" };
  const from = Deno.env.get("TWILIO_FROM_NUMBER") ?? "";
  if (!from) return { ok: false, error: "TWILIO_FROM_NUMBER missing" };
  try {
    const sids: string[] = [];
    for (const num of to) {
      const params = new URLSearchParams({ To: num, From: from, Body: body });
      const res = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TWILIO_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: `twilio ${res.status}: ${JSON.stringify(j)}` };
      if (j.sid) sids.push(j.sid);
    }
    return { ok: true, sid: sids.join(",") };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// Lindy-watched email inbox is the sole SMS dispatch path. Twilio remains as opt-in fallback only if configured.
async function sendSms(to: string[], body: string, payload: any): Promise<{ ok: boolean; sid?: string; id?: string; provider: string; error?: string; fallback_error?: string }> {
  const lindy = await sendSmsViaLindyEmail(to, body, payload);
  if (lindy.ok) return { ok: true, id: lindy.id, provider: "lindy_email" };
  if (TWILIO_KEY && LOVABLE_API_KEY) {
    const tw = await sendSmsViaTwilio(to, body);
    if (tw.ok) return { ok: true, sid: tw.sid, provider: "twilio_fallback", fallback_error: lindy.error };
    return { ok: false, provider: "twilio_fallback", error: tw.error, fallback_error: lindy.error };
  }
  return { ok: false, provider: "lindy_email", error: lindy.error };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  if (!(await verifyCronSecret(req, "kennel-alert-dispatch"))) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const event_type = String(body?.event_type ?? "");
  if (!ALLOWED_EVENTS.includes(event_type)) return json({ error: `invalid event_type (expected one of ${ALLOWED_EVENTS.join(",")})` }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const recipients = await getRecipients(admin);

  const subject = `Kennel · ${event_type}${body.channel ? ` · ${body.channel}` : ""}${body.action ? ` · ${body.action}` : ""}`;
  const html = buildEmailHtml(body);
  const smsBody = buildSmsBody(body);

  const [emailRes, smsRes] = await Promise.all([
    sendEmail(recipients.email, subject, html),
    sendSms(recipients.sms, smsBody, body),
  ]);

  const channels_sent: string[] = [];
  if (emailRes.ok) channels_sent.push("email");
  if (smsRes.ok) channels_sent.push(`sms:${smsRes.provider}`);

  const success = emailRes.ok || smsRes.ok;
  const error = [
    !emailRes.ok ? `email: ${emailRes.error}` : null,
    !smsRes.ok ? `sms: ${smsRes.error}` : null,
  ].filter(Boolean).join(" | ") || null;

  await admin.from("alert_dispatch_log").insert({
    event_type,
    channel: body.channel ?? null,
    payload: body,
    channels_sent,
    email_message_id: emailRes.id ?? null,
    sms_sid: smsRes.sid ?? null,
    success,
    error,
  });

  return json({ ok: success, email: emailRes, sms: smsRes });
});
