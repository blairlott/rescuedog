import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface BuildRequest {
  action: "build" | "list" | "assign_holdout";
  channel?: string;
  destination_url?: string;
  campaign_id?: string;
  ad_group_id?: string;
  ad_id?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  label?: string;
  visitor_id?: string;
  user_id?: string;
}

const CHANNEL_SOURCE_MEDIUM: Record<string, { source: string; medium: string }> = {
  google: { source: "google", medium: "cpc" },
  meta: { source: "meta", medium: "paid_social" },
  instacart: { source: "instacart", medium: "cpc" },
  tiktok: { source: "tiktok", medium: "paid_social" },
  pinterest: { source: "pinterest", medium: "cpc" },
};

function buildTaggedUrl(dest: string, params: Record<string, string | undefined>): string {
  const url = new URL(dest);
  for (const [k, v] of Object.entries(params)) {
    if (v && v.length > 0) url.searchParams.set(k, v);
  }
  return url.toString();
}

// FNV-1a hash → deterministic 0–99 bucket for holdout
function bucket(visitor: string): number {
  let h = 2166136261;
  for (let i = 0; i < visitor.length; i++) {
    h ^= visitor.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h % 100;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = (await req.json()) as BuildRequest;

    if (body.action === "assign_holdout") {
      if (!body.visitor_id) {
        return new Response(JSON.stringify({ error: "visitor_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const b = bucket(body.visitor_id);
      const in_holdout = b < 5;
      const { data, error } = await supabase
        .from("holdout_assignments")
        .upsert(
          {
            visitor_id: body.visitor_id,
            user_id: body.user_id ?? null,
            in_holdout,
            bucket: b,
          },
          { onConflict: "visitor_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ in_holdout, bucket: b, assignment: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "list") {
      const { data, error } = await supabase
        .from("paid_link_tags")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return new Response(JSON.stringify({ tags: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // build
    if (!body.channel || !body.destination_url || !body.utm_campaign) {
      return new Response(
        JSON.stringify({ error: "channel, destination_url, utm_campaign required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const sm = CHANNEL_SOURCE_MEDIUM[body.channel] ?? {
      source: body.channel,
      medium: "cpc",
    };
    const params = {
      utm_source: sm.source,
      utm_medium: sm.medium,
      utm_campaign: body.utm_campaign,
      utm_content: body.utm_content,
      utm_term: body.utm_term,
    };
    const tagged = buildTaggedUrl(body.destination_url, params);

    const { data, error } = await supabase
      .from("paid_link_tags")
      .upsert(
        {
          channel: body.channel,
          campaign_id: body.campaign_id ?? null,
          ad_group_id: body.ad_group_id ?? null,
          ad_id: body.ad_id ?? null,
          destination_url: body.destination_url,
          utm_source: sm.source,
          utm_medium: sm.medium,
          utm_campaign: body.utm_campaign,
          utm_content: body.utm_content ?? null,
          utm_term: body.utm_term ?? null,
          tagged_url: tagged,
          label: body.label ?? null,
        },
        {
          onConflict: "utm_source,utm_medium,utm_campaign,utm_content,utm_term",
        },
      )
      .select()
      .single();
    if (error) throw error;

    return new Response(JSON.stringify({ tagged_url: tagged, tag: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("kennel-utm-tagger error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});