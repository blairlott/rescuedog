// Nightly reconciliation: compares Lindy vs native rows and writes discrepancies.
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
async function fireAlert(body: Record<string, unknown>) {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/kennel-alert-dispatch`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify(body),
    });
  } catch (_) { /* non-fatal */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const since = new Date(); since.setDate(since.getDate() - 7);
  const { data: rows, error } = await admin
    .from("ad_performance_daily")
    .select("channel_id,date,spend,revenue,source")
    .gte("date", since.toISOString().slice(0, 10));
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const map = new Map<string, { lindy?: any; native?: any }>();
  for (const r of rows ?? []) {
    const k = `${r.channel_id}|${r.date}`;
    const g = map.get(k) ?? {};
    if (r.source === "lindy") g.lindy = r;
    else if (r.source === "backup_cron") g.native = r;
    map.set(k, g);
  }
  let inserted = 0;
  let flagged = 0;
  const flaggedDetails: Array<{ channel_id: string; date: string; metric: string; variance_pct: number; lindy: number; native: number }> = [];
  for (const [k, g] of map.entries()) {
    if (!g.lindy || !g.native) continue;
    const [channel_id, date] = k.split("|");
    for (const metric of ["spend", "revenue"] as const) {
      const lv = Number(g.lindy[metric] ?? 0);
      const nv = Number(g.native[metric] ?? 0);
      const base = Math.max(lv, nv);
      const variance = base > 0 ? Math.abs(lv - nv) / base : 0;
      const isFlagged = variance > 0.05;
      await admin.from("ad_reconciliation_log").insert({
        channel_id, date, metric,
        lindy_value: lv, native_value: nv,
        variance_pct: Number((variance * 100).toFixed(3)),
        flagged: isFlagged,
      });
      inserted++;
      if (isFlagged) {
        flagged++;
        flaggedDetails.push({ channel_id, date, metric, variance_pct: Number((variance * 100).toFixed(2)), lindy: lv, native: nv });
      }
    }
  }

  // Page on-call if any drift exceeds threshold. One alert per run, summarized.
  if (flagged > 0) {
    const worst = [...flaggedDetails].sort((a, b) => b.variance_pct - a.variance_pct)[0];
    const spendImpact = flaggedDetails
      .filter(d => d.metric === "spend")
      .reduce((s, d) => s + Math.round(Math.abs(d.lindy - d.native) * 100), 0);
    await fireAlert({
      event_type: "anomaly",
      channel: worst.channel_id,
      action: `reconciliation_drift · ${flagged} flagged`,
      spend_impact_cents: -spendImpact,
      confidence: 0.9,
      deep_link: `https://rescuedog.lovable.app/kennel/methodology`,
      message: `Worst: ${worst.channel_id} ${worst.date} ${worst.metric} variance ${worst.variance_pct}% (lindy=${worst.lindy} native=${worst.native})`,
    });
  }

  return new Response(JSON.stringify({ checked: map.size, inserted }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});