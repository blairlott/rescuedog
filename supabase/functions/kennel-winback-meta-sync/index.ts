// Syncs winback tiers (60/120/240/365) into Meta Custom Audiences.
// Same bucketing logic as the Mailchimp sync. Emails are SHA256-hashed per
// Meta's normalization rules (lowercase, trimmed) before upload. Audiences are
// auto-created on first run; their IDs are persisted in app_settings as
// `winback_meta_audience_<tier>`. Snapshots tier sizes into winback_snapshots.
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const META_TOKEN = Deno.env.get("META_ADS_ACCESS_TOKEN") ?? "";
const META_ACCOUNT = Deno.env.get("META_ADS_ACCOUNT_ID") ?? "";
const GRAPH = "https://graph.facebook.com/v22.0";

type Tier = "tier_60" | "tier_120" | "tier_240" | "tier_365";
const TIERS: Tier[] = ["tier_60", "tier_120", "tier_240", "tier_365"];
const TIER_NAME: Record<Tier, string> = {
  tier_60:  "RDW Winback — 60-120 day",
  tier_120: "RDW Winback — 120-240 day",
  tier_240: "RDW Winback — 240-365 day",
  tier_365: "RDW Winback — 365+ day",
};

function bucket(daysAgo: number): Tier | null {
  if (daysAgo >= 60 && daysAgo < 120) return "tier_60";
  if (daysAgo >= 120 && daysAgo < 240) return "tier_120";
  if (daysAgo >= 240 && daysAgo < 365) return "tier_240";
  if (daysAgo >= 365 && daysAgo <= 730) return "tier_365";
  return null;
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function metaFetch(path: string, init: RequestInit = {}) {
  const url = `${GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(META_TOKEN)}`;
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`meta ${init.method ?? "GET"} ${path}: ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function getOrCreateAudience(admin: any, tier: Tier): Promise<string> {
  const key = `winback_meta_audience_${tier}`;
  const { data: existing } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
  const cached = existing?.value;
  if (cached && typeof cached === "string") return cached;
  if (cached && typeof cached === "object" && cached.id) return cached.id;

  const acct = META_ACCOUNT.startsWith("act_") ? META_ACCOUNT : `act_${META_ACCOUNT}`;
  const created: any = await metaFetch(`/${acct}/customaudiences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: TIER_NAME[tier],
      subtype: "CUSTOM",
      description: `Auto-managed by Kennel — ${tier}`,
      customer_file_source: "USER_PROVIDED_ONLY",
    }),
  });
  const id = created?.id as string;
  if (!id) throw new Error(`Meta audience creation returned no id: ${JSON.stringify(created)}`);
  await admin.from("app_settings").upsert({ key, value: id }, { onConflict: "key" });
  return id;
}

async function uploadEmails(audienceId: string, sessionId: number, hashed: string[], batchSeq: number, lastBatch: boolean) {
  return await metaFetch(`/${audienceId}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payload: { schema: ["EMAIL_SHA256"], data: hashed.map((h) => [h]) },
      session: {
        session_id: sessionId,
        estimated_num_total: hashed.length,
        batch_seq: batchSeq,
        last_batch_flag: lastBatch,
      },
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";
  const headerSecret = req.headers.get("x-kennel-ingest-secret") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const isService = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!isService && (!secret || headerSecret !== secret)) return J(401, { error: "unauthorized" });

  if (!META_TOKEN || !META_ACCOUNT) return J(400, { error: "META_ADS_ACCESS_TOKEN / META_ADS_ACCOUNT_ID missing" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Pull consumer orders last 730d → last_order per email.
  const sinceIso = new Date(Date.now() - 730 * 86400_000).toISOString();
  const last: Map<string, number> = new Map();
  let from = 0; const PAGE = 1000;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await admin
      .from("vs_transactions")
      .select("customer_email, transaction_date")
      .eq("transaction_type", "ORDER").eq("order_type", "CONSUMER").gt("order_total", 0)
      .not("customer_email", "is", null).gte("transaction_date", sinceIso)
      .order("transaction_date", { ascending: false }).range(from, from + PAGE - 1);
    if (error) return J(500, { error: error.message });
    const rows = (data ?? []) as any[];
    for (const r of rows) {
      const e = String(r.customer_email ?? "").trim().toLowerCase();
      if (!e || !e.includes("@")) continue;
      const ts = new Date(r.transaction_date).getTime();
      const prev = last.get(e);
      if (!prev || ts > prev) last.set(e, ts);
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  const buckets: Record<Tier, string[]> = { tier_60: [], tier_120: [], tier_240: [], tier_365: [] };
  const now = Date.now();
  for (const [email, ts] of last) {
    const d = Math.floor((now - ts) / 86400_000);
    const t = bucket(d);
    if (t) buckets[t].push(email);
  }

  const result: Record<string, any> = {};
  for (const tier of TIERS) {
    const emails = buckets[tier];
    try {
      const audienceId = await getOrCreateAudience(admin, tier);
      const hashed = await Promise.all(emails.map((e) => sha256Hex(e)));
      let batchSeq = 1; const CHUNK = 1000; let uploaded = 0;
      if (hashed.length === 0) {
        result[tier] = { audience_id: audienceId, members: 0, uploaded: 0 };
      } else {
        const sessionId = Math.floor(Date.now() / 1000);
        for (let i = 0; i < hashed.length; i += CHUNK) {
          const slice = hashed.slice(i, i + CHUNK);
          const isLast = i + CHUNK >= hashed.length;
          await uploadEmails(audienceId, sessionId, slice, batchSeq++, isLast);
          uploaded += slice.length;
        }
        result[tier] = { audience_id: audienceId, members: emails.length, uploaded };
      }
      await admin.from("winback_snapshots").insert({
        tier, channel: "meta", member_count: emails.length, payload: result[tier],
      });
    } catch (e: any) {
      result[tier] = { error: String(e?.message ?? e) };
    }
  }

  return J(200, { ok: true, tiers: result });
});