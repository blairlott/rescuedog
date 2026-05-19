// Captures today's daily_budget per campaign + MTD spend per channel into guardrail_baseline.
// Flips prior is_current=true rows to false. Run via pg_cron at 08:00 UTC (00:00 PT) or manually from Settings.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const META_GRAPH_VERSION = "v21.0";

async function fetchMetaBudgets(): Promise<Array<{ campaign_id: string; daily_budget_cents: number | null }>> {
  const token = Deno.env.get("META_ADS_ACCESS_TOKEN");
  const rawAccount = Deno.env.get("META_ADS_ACCOUNT_ID");
  if (!token || !rawAccount) return [];
  // Normalize: accept "act_123" or "123" — always send "act_123" to Graph.
  const adAccount = `act_${rawAccount.replace(/^act_/, "")}`;
  try {
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccount}/campaigns?fields=id,name,daily_budget,status&limit=200&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const j = await res.json();
    if (!res.ok) return [];
    return (j.data ?? []).map((c: any) => ({
      campaign_id: c.id,
      daily_budget_cents: c.daily_budget ? Number(c.daily_budget) : null,
    }));
  } catch { return []; }
}

async function fetchChannelMtdSpend(admin: any, platform: string): Promise<number> {
  const first = new Date(); first.setUTCDate(1); first.setUTCHours(0,0,0,0);
  const since = first.toISOString().slice(0, 10);
  const { data } = await admin
    .from("ad_performance_daily")
    .select("spend_cents")
    .eq("channel", platform)
    .gte("day", since);
  return (data ?? []).reduce((s: number, r: any) => s + (r.spend_cents ?? 0), 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Flip all current baselines to is_current=false; new ones will be inserted as current.
  await admin.from("guardrail_baseline").update({ is_current: false }).eq("is_current", true);

  const platforms = ["meta", "google", "instacart"];
  const inserted: any[] = [];

  for (const platform of platforms) {
    const mtd = await fetchChannelMtdSpend(admin, platform);
    // Channel-level row (campaign_id null)
    const { data: chanRow } = await admin.from("guardrail_baseline").insert({
      platform, campaign_id: null,
      baseline_daily_budget_cents: null,
      baseline_mtd_spend_cents: mtd,
      source: "auto_daily",
      is_current: true,
    }).select().single();
    if (chanRow) inserted.push(chanRow);

    if (platform === "meta") {
      const budgets = await fetchMetaBudgets();
      for (const b of budgets) {
        if (b.daily_budget_cents == null) continue;
        const { data: row } = await admin.from("guardrail_baseline").insert({
          platform, campaign_id: b.campaign_id,
          baseline_daily_budget_cents: b.daily_budget_cents,
          baseline_mtd_spend_cents: null,
          source: "auto_daily", is_current: true,
        }).select().single();
        if (row) inserted.push(row);
      }
    }
    // Google + Instacart: budget capture stub until their APIs are wired here too.
  }

  return json({ ok: true, captured: inserted.length, baselines: inserted });
});
