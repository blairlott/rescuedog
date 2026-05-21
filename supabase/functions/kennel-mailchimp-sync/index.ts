// Tiered winback sync. Buckets every consumer email by days-since-last-order and
// applies Mailchimp tags per tier so journeys can branch on `signal_winback_60`,
// `signal_winback_120`, `signal_winback_240`, `signal_winback_365`. Also writes a
// suppression tag `exclude_active_30d` for anyone who bought in the last 30 days.
// Snapshots tier sizes into public.winback_snapshots for auto-recs + dashboard.
// Tied-house compliant: audience sync only — humans launch the campaigns.
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const API = Deno.env.get("MAILCHIMP_API_KEY") ?? "";
const SERVER = Deno.env.get("MAILCHIMP_SERVER_PREFIX") ?? "";
const LIST = Deno.env.get("MAILCHIMP_AUDIENCE_ID") ?? "";

type Tier = "active_30d" | "tier_60" | "tier_120" | "tier_240" | "tier_365";
const TIER_TAG: Record<Tier, string> = {
  active_30d: "exclude_active_30d",
  tier_60: "signal_winback_60",
  tier_120: "signal_winback_120",
  tier_240: "signal_winback_240",
  tier_365: "signal_winback_365",
};

function bucket(daysAgo: number): Tier | null {
  if (daysAgo < 30) return "active_30d";
  if (daysAgo >= 60 && daysAgo < 120) return "tier_60";
  if (daysAgo >= 120 && daysAgo < 240) return "tier_120";
  if (daysAgo >= 240 && daysAgo < 365) return "tier_240";
  if (daysAgo >= 365 && daysAgo <= 730) return "tier_365";
  return null;
}

async function mc(path: string, method: string, body?: unknown) {
  const r = await fetch(`https://${SERVER}.api.mailchimp.com/3.0${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`anystring:${API}`)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`mailchimp ${method} ${path}: ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";
  const headerSecret = req.headers.get("x-kennel-ingest-secret") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const isService = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!isService && (!secret || headerSecret !== secret)) return J(401, { error: "unauthorized" });

  // Fast short-circuit for self-health probes — avoids the 50-page Vinoshipper
  // pull and Mailchimp batch and blowing the probe's 20s timeout.
  const probeBody = req.method === "POST" ? await req.clone().json().catch(() => ({})) : {};
  if (probeBody?.dry_run === true || probeBody?.probe === true) {
    return J(200, { ok: true, dry_run: true, function: "kennel-mailchimp-sync" });
  }

  if (!API || !SERVER || !LIST) {
    return J(400, { error: "MAILCHIMP_API_KEY / MAILCHIMP_SERVER_PREFIX / MAILCHIMP_AUDIENCE_ID missing" });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Pull all consumer orders in the last 730 days, then dedupe to last_order per email.
  const sinceIso = new Date(Date.now() - 730 * 86400_000).toISOString();
  // Pull in pages of 1000 to bypass the default limit.
  const last: Map<string, { state: string | null; lastTs: number }> = new Map();
  let from = 0;
  const PAGE = 1000;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await admin
      .from("vs_transactions")
      .select("customer_email, ship_to_state, transaction_date")
      .eq("transaction_type", "ORDER")
      .eq("order_type", "CONSUMER")
      .gt("order_total", 0)
      .not("customer_email", "is", null)
      .gte("transaction_date", sinceIso)
      .order("transaction_date", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return J(500, { error: error.message });
    const rows = (data ?? []) as any[];
    for (const r of rows) {
      const e = String(r.customer_email ?? "").trim().toLowerCase();
      if (!e || !e.includes("@")) continue;
      const ts = new Date(r.transaction_date).getTime();
      const prev = last.get(e);
      if (!prev || ts > prev.lastTs) last.set(e, { state: r.ship_to_state ?? null, lastTs: ts });
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  // Bucket into tiers.
  const buckets: Record<Tier, Array<{ email: string; state: string | null }>> = {
    active_30d: [], tier_60: [], tier_120: [], tier_240: [], tier_365: [],
  };
  const now = Date.now();
  for (const [email, v] of last) {
    const daysAgo = Math.floor((now - v.lastTs) / 86400_000);
    const t = bucket(daysAgo);
    if (t) buckets[t].push({ email, state: v.state });
  }

  // Upsert each tier to Mailchimp with its tag.
  const CHUNK = 500;
  const perTier: Record<string, any> = {};
  for (const tier of Object.keys(buckets) as Tier[]) {
    const audience = buckets[tier];
    const tag = TIER_TAG[tier];
    let nw = 0, upd = 0, errors = 0;
    const errSamples: string[] = [];
    for (let i = 0; i < audience.length; i += CHUNK) {
      const slice = audience.slice(i, i + CHUNK);
      const members = slice.map((m) => ({
        email_address: m.email,
        status_if_new: "subscribed",
        tags: [tag],
        merge_fields: m.state ? { STATE: m.state } : {},
      }));
      try {
        const res: any = await mc(`/lists/${LIST}`, "POST", {
          members,
          update_existing: true,
          skip_merge_validation: true,
        });
        nw += res?.new_members?.length ?? 0;
        upd += res?.updated_members?.length ?? 0;
        errors += res?.errors?.length ?? 0;
        if (res?.errors?.length) errSamples.push(...res.errors.slice(0, 2).map((e: any) => `${e.email_address}: ${e.error}`));
      } catch (e: any) {
        errors += slice.length;
        errSamples.push(String(e?.message ?? e));
      }
    }
    perTier[tier] = { tag, members: audience.length, new: nw, updated: upd, errors, errSamples: errSamples.slice(0, 3) };

    // Snapshot every tier (including suppression) for the dashboard + auto-recs.
    await admin.from("winback_snapshots").insert({
      tier, channel: "mailchimp", member_count: audience.length,
      payload: { tag, new: nw, updated: upd, errors },
    });
  }

  return J(200, { ok: true, source: "vs_transactions", lookback_days: 730, tiers: perTier });
});