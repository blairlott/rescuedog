// Phase 4 #23 — Auto-pause underperforming campaigns/adsets/keywords.
// For each enabled rule:
//   1. Pull last N-day metrics from the platform (Meta/Google/Instacart).
//   2. Compare against threshold.
//   3. If breached AND spend >= min_spend, either dry_run-log OR PAUSE.
// Dry-run defaults to true. Every evaluation is logged to auto_pause_events.
// NOTE: keeps platform calls best-effort. If a platform API isn't wired,
// it logs a 'skipped' event rather than failing.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GRAPH = "https://graph.facebook.com/v21.0";

type Rule = {
  id: string; rule_key: string; platform: string; entity_scope: string;
  metric: string; comparator: string; threshold: number; window_days: number;
  min_spend_cents: number; dry_run: boolean; enabled: boolean;
};

function breach(metric: number, comp: string, threshold: number): boolean {
  switch (comp) {
    case "lt": return metric < threshold;
    case "lte": return metric <= threshold;
    case "gt": return metric > threshold;
    case "gte": return metric >= threshold;
  }
  return false;
}

async function metaFetchInsights(token: string, accountId: string, level: string, days: number) {
  const url = new URL(`${GRAPH}/act_${accountId}/insights`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("level", level);
  url.searchParams.set("date_preset", days <= 7 ? "last_7d" : days <= 14 ? "last_14d" : "last_30d");
  url.searchParams.set("fields", "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,actions,ctr,purchase_roas");
  url.searchParams.set("limit", "200");
  const r = await fetch(url.toString());
  const j = await r.json();
  return j.data ?? [];
}

async function metaPause(token: string, entityId: string) {
  const url = new URL(`${GRAPH}/${entityId}`);
  url.searchParams.set("access_token", token);
  const r = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "status=PAUSED",
  });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: setting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "auto_pause_enabled")
    .maybeSingle();
  if (setting && setting.value === false) {
    return new Response(JSON.stringify({ ok: true, skipped: "disabled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: rules } = await admin
    .from("auto_pause_rules")
    .select("*")
    .eq("enabled", true);

  const metaToken = Deno.env.get("META_ADS_ACCESS_TOKEN") ?? Deno.env.get("META_SYSTEM_USER_TOKEN");
  const metaAccount = (Deno.env.get("META_ADS_ACCOUNT_ID") ?? "").replace(/^act_/, "");

  const summary: any[] = [];

  for (const rule of (rules ?? []) as Rule[]) {
    if (rule.platform !== "meta") {
      await admin.from("auto_pause_events").insert({
        rule_id: rule.id, platform: rule.platform, entity_type: rule.entity_scope,
        entity_id: "n/a", action: "skipped",
        reason: `${rule.platform} integration not wired in sweep yet`,
        dry_run: true,
      });
      summary.push({ rule: rule.rule_key, skipped: "platform_not_wired" });
      continue;
    }
    if (!metaToken || !metaAccount) {
      await admin.from("auto_pause_events").insert({
        rule_id: rule.id, platform: "meta", entity_type: rule.entity_scope,
        entity_id: "n/a", action: "error", reason: "missing META token/account", dry_run: true,
      });
      continue;
    }
    const level = rule.entity_scope === "campaign" ? "campaign"
                 : rule.entity_scope === "ad" ? "ad" : "adset";
    const rows = await metaFetchInsights(metaToken, metaAccount, level, rule.window_days);
    for (const r of rows) {
      const spendCents = Math.round((Number(r.spend ?? 0)) * 100);
      if (spendCents < (rule.min_spend_cents ?? 0)) continue;
      let value = 0;
      if (rule.metric === "roas") {
        value = Number(r.purchase_roas?.[0]?.value ?? 0);
      } else if (rule.metric === "ctr") {
        value = Number(r.ctr ?? 0);
      } else if (rule.metric === "cpa") {
        const purch = Number(r.actions?.find((a: any) => a.action_type === "purchase")?.value ?? 0);
        value = purch > 0 ? spendCents / 100 / purch : Number.POSITIVE_INFINITY;
      } else if (rule.metric === "spend_no_conv") {
        const purch = Number(r.actions?.find((a: any) => a.action_type === "purchase")?.value ?? 0);
        value = purch > 0 ? 0 : spendCents / 100;
      }
      if (!breach(value, rule.comparator, Number(rule.threshold))) continue;

      const entityId = level === "campaign" ? r.campaign_id : level === "ad" ? r.ad_id : r.adset_id;
      const entityName = level === "campaign" ? r.campaign_name : level === "ad" ? r.ad_name : r.adset_name;
      if (rule.dry_run) {
        await admin.from("auto_pause_events").insert({
          rule_id: rule.id, platform: "meta", entity_type: level,
          entity_id: String(entityId), entity_name: entityName,
          action: "dry_run", metric_observed: value, spend_cents: spendCents,
          reason: `${rule.metric} ${rule.comparator} ${rule.threshold}`,
          dry_run: true,
        });
      } else {
        const res = await metaPause(metaToken, String(entityId));
        await admin.from("auto_pause_events").insert({
          rule_id: rule.id, platform: "meta", entity_type: level,
          entity_id: String(entityId), entity_name: entityName,
          action: res.ok ? "paused" : "error",
          metric_observed: value, spend_cents: spendCents,
          reason: `${rule.metric} ${rule.comparator} ${rule.threshold}`,
          dry_run: false, response: res.body,
        });
      }
    }
    summary.push({ rule: rule.rule_key, rows: rows.length });
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});