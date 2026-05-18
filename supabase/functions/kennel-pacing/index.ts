// Daily EOM spend projection per channel.
// Reads channel_performance_daily MTD spend, projects to EOM via simple
// run-rate (mtd_spend / days_elapsed * days_in_month). Compares against
// ad_settings.monthly_budget_cents (global) and ad_settings.monthly_budget_<channel>_cents.
// When projected > budget * threshold (default 1.10), fires a pacing alert
// via kennel-alert-dispatch.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SB = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CHANNELS = ["meta", "google", "instacart"] as const;
type Channel = typeof CHANNELS[number];

async function getSetting(key: string): Promise<any> {
  const { data } = await SB.from("ad_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

function daysInMonth(d: Date): number {
  return new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getUTCDate();
}

async function dispatchAlert(payload: Record<string, unknown>) {
  try {
    await SB.functions.invoke("kennel-alert-dispatch", { body: payload });
  } catch (e) {
    console.error("[pacing] alert dispatch failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";
    const thresholdRaw = await getSetting("pacing_alert_threshold");
    const threshold = typeof thresholdRaw === "number" ? thresholdRaw : 1.10;

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const daysElapsed = now.getUTCDate(); // 1..31
    const dim = daysInMonth(now);

    // Pull MTD spend per channel
    const { data: rows, error } = await SB
      .from("channel_performance_daily")
      .select("channel, spend_cents")
      .gte("day", monthStart.toISOString().slice(0, 10));
    if (error) throw error;

    const mtdByChannel = new Map<string, number>();
    let mtdTotal = 0;
    for (const r of rows ?? []) {
      const c = String(r.channel);
      const s = Number(r.spend_cents ?? 0);
      mtdByChannel.set(c, (mtdByChannel.get(c) ?? 0) + s);
      mtdTotal += s;
    }

    const globalBudget = Number((await getSetting("monthly_budget_cents")) ?? 0);
    const fired: Array<Record<string, unknown>> = [];
    const summary: Array<Record<string, unknown>> = [];

    async function evaluate(label: string, mtd: number, budgetCents: number) {
      if (!budgetCents || budgetCents <= 0) return null;
      const projected = Math.round((mtd / Math.max(1, daysElapsed)) * dim);
      const ratio = projected / budgetCents;
      const row = {
        scope: label,
        mtd_cents: mtd,
        days_elapsed: daysElapsed,
        days_in_month: dim,
        projected_eom_cents: projected,
        budget_cents: budgetCents,
        ratio: Number(ratio.toFixed(3)),
        breached: ratio > threshold,
      };
      summary.push(row);
      if (row.breached && !dryRun) {
        await dispatchAlert({
          event_type: "pacing",
          channel: label === "global" ? "kennel" : label,
          action: `Projected EOM spend ${(ratio * 100).toFixed(0)}% of monthly budget`,
          spend_impact_cents: projected - budgetCents,
          confidence: 0.9,
          message:
            `MTD ${(mtd / 100).toFixed(2)} after ${daysElapsed}/${dim} days. ` +
            `Projected EOM ${(projected / 100).toFixed(2)} vs budget ${(budgetCents / 100).toFixed(2)}.`,
        });
        fired.push(row);
      }
      return row;
    }

    await evaluate("global", mtdTotal, globalBudget);
    for (const ch of CHANNELS) {
      const ch_budget = Number((await getSetting(`monthly_budget_${ch}_cents`)) ?? 0);
      await evaluate(ch, mtdByChannel.get(ch) ?? 0, ch_budget);
    }

    return J(200, {
      ok: true,
      threshold,
      dry_run: dryRun,
      summary,
      alerts_fired: fired.length,
    });
  } catch (e: any) {
    console.error("kennel-pacing", e);
    return J(500, { error: String(e?.message ?? e) });
  }
});