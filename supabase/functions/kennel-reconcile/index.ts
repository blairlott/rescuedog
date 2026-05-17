// Nightly reconciliation: compares Lindy vs native rows and writes discrepancies.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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
  for (const [k, g] of map.entries()) {
    if (!g.lindy || !g.native) continue;
    const [channel_id, date] = k.split("|");
    for (const metric of ["spend", "revenue"] as const) {
      const lv = Number(g.lindy[metric] ?? 0);
      const nv = Number(g.native[metric] ?? 0);
      const base = Math.max(lv, nv);
      const variance = base > 0 ? Math.abs(lv - nv) / base : 0;
      await admin.from("ad_reconciliation_log").insert({
        channel_id, date, metric,
        lindy_value: lv, native_value: nv,
        variance_pct: Number((variance * 100).toFixed(3)),
        flagged: variance > 0.05,
      });
      inserted++;
    }
  }
  return new Response(JSON.stringify({ checked: map.size, inserted }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});