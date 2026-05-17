// Generates an executive morning brief: top open decisions, key KPIs vs prior
// week, anomalies, and a 5-bullet AI narrative. Sends via Resend (through the
// Lovable connector gateway). Recipients come from `users` with the
// `executive`, `owner`, or `admin` role.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
const GATEWAY = "https://connector-gateway.lovable.dev/resend";
const FROM = Deno.env.get("BRIEF_FROM_EMAIL") ?? "Rescue Dog Wines <onboarding@resend.dev>";

function fmtMoney(n: number) { return `$${Math.round(n).toLocaleString()}`; }
function dayBefore(days: number) { return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10); }

async function fetchRecipients(): Promise<string[]> {
  const override = Deno.env.get("BRIEF_TO_EMAILS");
  if (override) return override.split(",").map(s => s.trim()).filter(Boolean);
  // Fall back to executive-role profiles
  const { data: roles } = await sb.from("user_roles").select("user_id, role").in("role", ["executive", "owner", "admin"]);
  const ids = [...new Set((roles ?? []).map((r: any) => r.user_id))];
  if (!ids.length) return [];
  const { data: profs } = await sb.from("profiles").select("email").in("id", ids);
  return (profs ?? []).map((p: any) => p.email).filter(Boolean);
}

async function gatherSignal() {
  const today = new Date().toISOString().slice(0, 10);
  const w1 = dayBefore(7);
  const w2 = dayBefore(14);

  const [decRes, bizRes, adRes, anomRes] = await Promise.all([
    sb.from("executive_decisions").select("*").eq("status", "pending").order("priority", { ascending: false }).limit(10),
    sb.from("business_revenue_facts").select("date, channel, gross_revenue_cents, orders").gte("date", w2),
    sb.from("ad_performance_daily").select("date, spend, revenue, conversions").gte("date", w2),
    sb.from("ad_anomalies").select("*").is("resolved_at", null).order("detected_at", { ascending: false }).limit(8),
  ]);

  const sumRange = (rows: any[], field: string, from: string, to: string) =>
    (rows ?? []).filter(r => (r.date as string) >= from && (r.date as string) < to)
      .reduce((s, r) => s + Number(r[field] ?? 0), 0);

  const rev7 = sumRange(bizRes.data ?? [], "gross_revenue_cents", w1, today) / 100;
  const revP = sumRange(bizRes.data ?? [], "gross_revenue_cents", w2, w1) / 100;
  const spend7 = sumRange(adRes.data ?? [], "spend", w1, today);
  const spendP = sumRange(adRes.data ?? [], "spend", w2, w1);
  const adRev7 = sumRange(adRes.data ?? [], "revenue", w1, today);

  return {
    decisions: decRes.data ?? [],
    anomalies: anomRes.data ?? [],
    kpis: {
      revenue_7d: rev7, revenue_prev_7d: revP, revenue_delta_pct: revP > 0 ? ((rev7 - revP) / revP) * 100 : 0,
      spend_7d: spend7, spend_prev_7d: spendP,
      blended_roas: spend7 > 0 ? rev7 / spend7 : 0,
      attributed_roas: spend7 > 0 ? adRev7 / spend7 : 0,
    },
  };
}

async function aiBullets(signal: any): Promise<string[]> {
  if (!LOVABLE_KEY) return [];
  const prompt = `You are a CFO-grade analyst for Rescue Dog Wines. Write exactly 5 single-sentence executive bullets summarizing the day. Be specific with numbers. Plain text, no markdown, no preamble.\n\nSIGNAL:\n${JSON.stringify(signal).slice(0, 6000)}`;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_KEY}` },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: prompt }] }),
    });
    const b = await r.json();
    const text: string = b?.choices?.[0]?.message?.content ?? "";
    return text.split(/\n+/).map(s => s.replace(/^[\-\*\d\.\s]+/, "").trim()).filter(Boolean).slice(0, 5);
  } catch { return []; }
}

function renderHtml(bullets: string[], signal: any): string {
  const k = signal.kpis;
  const dec = (signal.decisions as any[]).slice(0, 5);
  const anom = (signal.anomalies as any[]).slice(0, 5);
  const row = (label: string, value: string, sub?: string) => `
    <tr><td style="padding:6px 12px;border-bottom:1px solid #eee;font-family:Nunito Sans,Arial,sans-serif;text-transform:uppercase;font-size:11px;letter-spacing:.05em;color:#666">${label}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #eee;font-family:Nunito Sans,Arial,sans-serif;font-weight:700;text-align:right">${value}${sub ? `<div style='font-size:11px;color:#999;font-weight:400'>${sub}</div>` : ""}</td></tr>`;
  const deltaPct = `${k.revenue_delta_pct >= 0 ? "+" : ""}${k.revenue_delta_pct.toFixed(1)}% WoW`;
  return `<!doctype html><html><body style="margin:0;background:#fafafa;padding:24px;font-family:Nunito Sans,Arial,sans-serif;color:#111">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e5e5">
      <div style="background:#c30017;color:#fff;padding:18px 20px"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;opacity:.8">The Kennel · Executive Brief</div>
        <div style="font-size:22px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div></div>
      <table style="width:100%;border-collapse:collapse">
        ${row("Revenue (7d)", fmtMoney(k.revenue_7d), deltaPct)}
        ${row("Ad spend (7d)", fmtMoney(k.spend_7d))}
        ${row("Blended ROAS", `${k.blended_roas.toFixed(2)}x`, `Attributed ${k.attributed_roas.toFixed(2)}x`)}
      </table>
      ${bullets.length ? `<div style="padding:18px 20px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#666;margin-bottom:8px">AI summary</div>
        <ul style="padding-left:18px;margin:0;line-height:1.5">${bullets.map(b => `<li>${b}</li>`).join("")}</ul></div>` : ""}
      ${dec.length ? `<div style="padding:18px 20px;border-top:1px solid #eee"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#666;margin-bottom:8px">Decisions waiting</div>
        ${dec.map(d => `<div style="padding:8px 0;border-bottom:1px solid #f4f4f4"><div style="font-weight:700">${d.title}</div><div style="font-size:13px;color:#444">${d.recommended_action ?? ""}</div></div>`).join("")}</div>` : ""}
      ${anom.length ? `<div style="padding:18px 20px;border-top:1px solid #eee"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#666;margin-bottom:8px">Open anomalies</div>
        ${anom.map(a => `<div style="padding:4px 0;font-size:13px">⚠ ${a.scope_label ?? a.platform}: ${a.metric} (${a.severity})</div>`).join("")}</div>` : ""}
      <div style="padding:14px 20px;border-top:1px solid #eee;font-size:11px;color:#999">Open the Command Center for full detail.</div>
    </div></body></html>`;
}

async function sendEmail(to: string[], html: string, subject: string) {
  if (!to.length) return { skipped: "no recipients" };
  if (!RESEND_KEY || !LOVABLE_KEY) return { error: "RESEND_API_KEY or LOVABLE_API_KEY missing" };
  const r = await fetch(`${GATEWAY}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_KEY}`,
      "X-Connection-Api-Key": RESEND_KEY,
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  const b = await r.json().catch(() => ({}));
  return { status: r.status, body: b };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const isService = req.headers.get("apikey") === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!isService) {
    const auth = req.headers.get("authorization");
    if (!auth) return J(401, { error: "unauthorized" });
    const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return J(401, { error: "unauthorized" });
    const { data: ok } = await sb.rpc("is_executive", { _user_id: user.id });
    if (!ok) return J(403, { error: "forbidden" });
  }

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const signal = await gatherSignal();
  const bullets = await aiBullets(signal);
  const html = renderHtml(bullets, signal);
  const subject = `Kennel brief · ${signal.decisions.length} decisions · ${signal.kpis.blended_roas.toFixed(2)}x ROAS`;

  const recipients: string[] = Array.isArray(body.to) && body.to.length
    ? body.to : await fetchRecipients();
  const send = await sendEmail(recipients, html, subject);

  return J(200, { ok: true, recipients: recipients.length, bullets, send });
});