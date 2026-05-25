import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SLACK_CHANNEL = "C0B5KT989GT"; // #lindy-lovable

async function postSlack(blocks: any[], text: string) {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  if (!token) return { ok: false, error: "SLACK_BOT_TOKEN missing" };
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: SLACK_CHANNEL, text, blocks }),
  });
  return await r.json();
}

function proposalBlocks(p: any, baseUrl: string) {
  const url = `${baseUrl}/crm/restructures`;
  return [
    {
      type: "section",
      text: { type: "mrkdwn",
        text: `*Go/No-Go: ${p.title}*\n_${p.category.replace(/_/g, " ")} · ${p.risk_level} risk · source: ${p.source}_\n\n${p.summary}${p.rationale ? `\n\n*Why:* ${p.rationale}` : ""}` },
    },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "Review & decide" }, url, style: "primary" },
      ],
    },
    { type: "context", elements: [{ type: "mrkdwn", text: `target_kind: \`${p.target_kind}\` · id: \`${p.id}\`` }] },
    { type: "divider" },
  ];
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

    if (mode === "immediate" && body.proposal_id) {
      const { data: p } = await db.from("restructure_proposals").select("*").eq("id", body.proposal_id).maybeSingle();
      if (!p) return new Response(JSON.stringify({ skipped: "missing proposal" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const header = [{ type: "header", text: { type: "plain_text", text: "🚦 Restructure needs go/no-go" } }];
      const result = await postSlack([...header, ...proposalBlocks(p, baseUrl)], `Go/No-Go: ${p.title}`);
      return new Response(JSON.stringify({ mode, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Daily digest
    const { data: pending } = await db
      .from("restructure_proposals")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!pending?.length) {
      return new Response(JSON.stringify({ skipped: "no pending" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const header = [{ type: "header", text: { type: "plain_text", text: `🚦 ${pending.length} restructure decision${pending.length > 1 ? "s" : ""} pending` } }];
    const all = pending.flatMap((p) => proposalBlocks(p, baseUrl));
    const result = await postSlack([...header, ...all], `${pending.length} restructure go/no-go pending`);
    return new Response(JSON.stringify({ mode, count: pending.length, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});