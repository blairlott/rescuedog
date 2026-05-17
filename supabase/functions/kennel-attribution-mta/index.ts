// Multi-touch attribution: stitches ad-platform click/impression events
// (channel_attribution_events + ad_performance_facts) to vs_transactions
// orders by customer_email/utm, then distributes order revenue across
// touchpoints using last-touch, position-based (40/20/40), and time-decay.
// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const sb: SupabaseClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function authorized(req: Request): Promise<boolean> {
  if (req.headers.get("apikey") === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
  if (!user) return false;
  const { data } = await sb.rpc("is_executive", { _user_id: user.id });
  if (data) return true;
  const { data: ops } = await sb.rpc("is_ad_ops", { _user_id: user.id });
  return !!ops;
}

type Touch = { platform: string; campaign: string | null; ts: string; weight_lt: number; weight_pb: number; weight_td: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await authorized(req))) return J(401, { error: "unauthorized" });
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const days = Math.max(1, Math.min(Number(body.days ?? 30), 365));
  const since = new Date(Date.now() - days * 86400000);
  const sinceDay = since.toISOString().slice(0, 10);

  // 1) Orders in window
  const { data: orders, error: oerr } = await sb.from("vs_transactions")
    .select("invoice, customer_email, transaction_date, order_total, customer_state")
    .gte("transaction_date", sinceDay)
    .not("customer_email", "is", null)
    .not("invoice", "is", null)
    .limit(20000);
  if (oerr) return J(500, { error: oerr.message });

  // 2) All touchpoints in window (channel_attribution_events: click + view)
  const { data: events } = await sb.from("channel_attribution_events")
    .select("user_email, platform, campaign_name, event_type, event_at")
    .gte("event_at", new Date(since.getTime() - 30 * 86400000).toISOString())
    .limit(100000);
  const eventsByEmail = new Map<string, any[]>();
  for (const e of events ?? []) {
    const k = (e.user_email as string | null)?.toLowerCase();
    if (!k) continue;
    const arr = eventsByEmail.get(k) ?? [];
    arr.push(e);
    eventsByEmail.set(k, arr);
  }

  let written = 0;
  const platformTotals: Record<string, { lt: number; pb: number; td: number }> = {};

  for (const o of orders ?? []) {
    const email = (o.customer_email as string).toLowerCase();
    const orderTs = new Date(o.transaction_date as string).getTime();
    const revCents = Math.round(Number(o.order_total ?? 0) * 100);
    const path = (eventsByEmail.get(email) ?? [])
      .filter(e => new Date(e.event_at).getTime() <= orderTs)
      .sort((a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime());
    if (!path.length) continue;

    // Compute weights
    const n = path.length;
    const touches: Touch[] = path.map((p, i) => {
      const lt = i === n - 1 ? 1 : 0;
      let pb = 0;
      if (n === 1) pb = 1;
      else if (n === 2) pb = 0.5;
      else if (i === 0 || i === n - 1) pb = 0.4;
      else pb = 0.2 / (n - 2);
      const ageDays = Math.max(0, (orderTs - new Date(p.event_at).getTime()) / 86400000);
      const td = Math.pow(0.5, ageDays / 7); // half-life 7 days
      return { platform: p.platform, campaign: p.campaign_name ?? null, ts: p.event_at, weight_lt: lt, weight_pb: pb, weight_td: td };
    });
    const tdSum = touches.reduce((s, t) => s + t.weight_td, 0) || 1;
    touches.forEach(t => { t.weight_td = t.weight_td / tdSum; });

    const aggregate = (k: "weight_lt" | "weight_pb" | "weight_td") => {
      const out: Record<string, number> = {};
      for (const t of touches) {
        out[t.platform] = (out[t.platform] ?? 0) + t[k] * revCents;
      }
      return out;
    };
    const lt = aggregate("weight_lt"), pb = aggregate("weight_pb"), td = aggregate("weight_td");
    for (const k of Object.keys({ ...lt, ...pb, ...td })) {
      const r = platformTotals[k] ?? { lt: 0, pb: 0, td: 0 };
      r.lt += lt[k] ?? 0; r.pb += pb[k] ?? 0; r.td += td[k] ?? 0;
      platformTotals[k] = r;
    }

    const { error } = await sb.from("attribution_paths").upsert({
      order_id: o.invoice,
      order_date: new Date(o.transaction_date as string).toISOString(),
      order_revenue_cents: revCents,
      touchpoints: touches,
      last_touch_credit: lt,
      position_based_credit: pb,
      time_decay_credit: td,
      computed_at: new Date().toISOString(),
    }, { onConflict: "order_id" });
    if (!error) written += 1;
  }

  return J(200, {
    ok: true,
    paths_written: written,
    orders_scanned: orders?.length ?? 0,
    platform_totals_cents: platformTotals,
  });
});