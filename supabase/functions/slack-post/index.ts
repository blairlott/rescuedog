// Posts messages to Slack (#lindy-lovable) on behalf of Lovable via bot token.
// Requires SLACK_BOT_TOKEN with chat:write scope, and the bot invited to the channel.
// Auth: caller must be a reviewer (admin/cms/ad_ops) OR service role.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ALLOWED_CHANNEL = "C0B5KT989GT";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = Deno.env.get("SLACK_BOT_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ error: "SLACK_BOT_TOKEN not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Auth: service-role OR signed-in reviewer
  const auth = req.headers.get("Authorization") ?? "";
  const isServiceRole = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!isServiceRole) {
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims } = await userClient.auth.getClaims(auth.slice(7));
    const uid = claims?.claims?.sub as string | undefined;
    if (!uid) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const [{ data: isAdmin }, { data: isOps }, { data: isCms }] = await Promise.all([
      admin.rpc("is_admin_or_owner", { _user_id: uid }),
      admin.rpc("is_ad_ops", { _user_id: uid }),
      admin.rpc("is_cms_editor", { _user_id: uid }),
    ]);
    if (!isAdmin && !isOps && !isCms) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const text: string = (body.text ?? "").toString();
  const thread_ts: string | undefined = body.thread_ts;
  const channel: string = body.channel ?? ALLOWED_CHANNEL;
  const blocks = body.blocks;

  if (!text && !blocks) {
    return new Response(JSON.stringify({ error: "text or blocks required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (channel !== ALLOWED_CHANNEL) {
    return new Response(JSON.stringify({ error: "channel not allowed" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text, thread_ts, blocks }),
  });
  const j = await res.json();
  return new Response(JSON.stringify(j), {
    status: j.ok ? 200 : 502,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});