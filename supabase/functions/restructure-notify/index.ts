import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendEmail(to: string, subject: string, html: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-transactional-email`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      to,
      subject,
      html,
      template_name: "restructure-decision",
      purpose: "transactional",
      idempotency_key: `restructure-${subject}-${Date.now()}`,
    }),
  }).catch(() => null);
}

function recipients(): string[] {
  const raw = Deno.env.get("RESTRUCTURE_NOTIFY_EMAILS") || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function renderProposal(p: any, baseUrl: string) {
  const approve = `${baseUrl}/kennel/restructures?focus=${p.id}`;
  return `
    <div style="border:1px solid #ddd;padding:16px;margin:12px 0">
      <div style="font-size:12px;text-transform:uppercase;color:#888">${p.category} · risk ${p.risk_level}</div>
      <div style="font-size:18px;font-weight:700;margin-top:4px">${p.title}</div>
      <div style="margin-top:8px;color:#333">${p.summary}</div>
      ${p.rationale ? `<div style="margin-top:8px;color:#555;font-size:13px"><strong>Why:</strong> ${p.rationale}</div>` : ""}
      <div style="margin-top:12px"><a href="${approve}" style="background:#c30017;color:#fff;padding:8px 14px;text-decoration:none">Review &amp; decide →</a></div>
    </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "daily";
    const baseUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://rescuedog.lovable.app";
    const to = recipients();
    if (!to.length) {
      return new Response(JSON.stringify({ skipped: "no recipients (set RESTRUCTURE_NOTIFY_EMAILS secret)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "immediate" && body.proposal_id) {
      const { data: p } = await db.from("restructure_proposals").select("*").eq("id", body.proposal_id).maybeSingle();
      if (!p) return new Response(JSON.stringify({ skipped: "missing proposal" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const html = `<h2>New restructure proposal needs go/no-go</h2>${renderProposal(p, baseUrl)}`;
      for (const r of to) await sendEmail(r, `[Go/No-Go] ${p.title}`, html);
      return new Response(JSON.stringify({ sent: to.length, mode }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Daily digest
    const { data: pending } = await db
      .from("restructure_proposals")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!pending?.length) {
      return new Response(JSON.stringify({ skipped: "no pending" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const html = `<h2>${pending.length} restructure decision${pending.length > 1 ? "s" : ""} pending</h2>${pending.map((p) => renderProposal(p, baseUrl)).join("")}`;
    for (const r of to) await sendEmail(r, `[Daily] ${pending.length} restructure go/no-go pending`, html);
    return new Response(JSON.stringify({ sent: to.length, count: pending.length, mode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});