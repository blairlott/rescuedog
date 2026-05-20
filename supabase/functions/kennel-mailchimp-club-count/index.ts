// Returns count of Mailchimp audience members tagged as wine club members.
// Tag name configurable via app_settings.mailchimp_club_tag (default "Wine Club").
// Used by the Kennel Wine Club Growth panel to blend Mailchimp signal into the
// active members tile alongside Vinoshipper transactions and native app signups.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("MAILCHIMP_API_KEY");
    const server = Deno.env.get("MAILCHIMP_SERVER_PREFIX");
    const audienceId = Deno.env.get("MAILCHIMP_AUDIENCE_ID");
    if (!apiKey || !server || !audienceId) {
      return new Response(JSON.stringify({ count: 0, skipped: true, reason: "mailchimp_env_missing" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: tagRow } = await supabase
      .from("app_settings").select("value").eq("key", "mailchimp_club_tag").maybeSingle();
    const tagName = ((tagRow as any)?.value ?? "Wine Club").toString();

    const auth = "Basic " + btoa(`anystring:${apiKey}`);
    const base = `https://${server}.api.mailchimp.com/3.0`;

    // 1) Look up the segment/tag id by name.
    const segRes = await fetch(`${base}/lists/${audienceId}/segments?type=static&count=1000`, {
      headers: { Authorization: auth },
    });
    if (!segRes.ok) {
      return new Response(JSON.stringify({ count: 0, error: `segments ${segRes.status}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const segJson = await segRes.json();
    const seg = (segJson.segments ?? []).find((s: any) => (s.name ?? "").toLowerCase() === tagName.toLowerCase());
    if (!seg) {
      return new Response(JSON.stringify({ count: 0, tag: tagName, found: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ count: Number(seg.member_count ?? 0), tag: tagName, segment_id: seg.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ count: 0, error: String((e as Error)?.message ?? e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});