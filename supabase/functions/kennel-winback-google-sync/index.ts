// Syncs winback tiers into Google Ads Customer Match user lists.
// Auto-creates one CRM_BASED user list per tier on first run and persists IDs in
// app_settings (`winback_google_userlist_<tier>`). Emails are SHA256 hashed
// (lowercased, trimmed) per Google's normalization. Uses OfflineUserDataJobs.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CLIENT_ID = Deno.env.get("GOOGLE_ADS_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") ?? "";
const REFRESH_TOKEN = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN") ?? "";
const DEV_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";
const CUSTOMER_ID = (Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "").replace(/-/g, "");
const LOGIN_CID = (Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "").replace(/-/g, "");
const ADS_API = "https://googleads.googleapis.com/v18";

type Tier = "tier_60" | "tier_120" | "tier_240" | "tier_365";
const TIERS: Tier[] = ["tier_60", "tier_120", "tier_240", "tier_365"];
const TIER_NAME: Record<Tier, string> = {
  tier_60:  "RDW Winback 60-120",
  tier_120: "RDW Winback 120-240",
  tier_240: "RDW Winback 240-365",
  tier_365: "RDW Winback 365+",
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

async function accessToken(): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`google oauth: ${r.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data.access_token;
}

async function ads(path: string, token: string, body?: unknown) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "developer-token": DEV_TOKEN,
  };
  if (LOGIN_CID) headers["login-customer-id"] = LOGIN_CID;
  const r = await fetch(`${ADS_API}${path}`, {
    method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`google-ads ${path}: ${r.status} ${JSON.stringify(data).slice(0, 400)}`);
  return data;
}

async function getOrCreateUserList(admin: any, token: string, tier: Tier): Promise<string> {
  const key = `winback_google_userlist_${tier}`;
  const { data: existing } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
  const cached: any = existing?.value;
  const cachedId = typeof cached === "string" ? cached : cached?.resource_name;
  if (cachedId) return cachedId;

  const res: any = await ads(`/customers/${CUSTOMER_ID}/userLists:mutate`, token, {
    operations: [{
      create: {
        name: TIER_NAME[tier],
        description: `Auto-managed by Kennel — ${tier}`,
        membership_life_span: 540,
        crm_based_user_list: { upload_key_type: "CONTACT_INFO", data_source_type: "FIRST_PARTY" },
      },
    }],
  });
  const resourceName = res?.results?.[0]?.resourceName;
  if (!resourceName) throw new Error(`Google user list create returned no resourceName: ${JSON.stringify(res)}`);
  await admin.from("app_settings").upsert({ key, value: { resource_name: resourceName } }, { onConflict: "key" });
  return resourceName;
}

async function runOfflineJob(token: string, userListResource: string, hashedEmails: string[]) {
  // 1. Create job
  const created: any = await ads(`/customers/${CUSTOMER_ID}/offlineUserDataJobs:create`, token, {
    job: { type: "CUSTOMER_MATCH_USER_LIST", customer_match_user_list_metadata: { user_list: userListResource } },
  });
  const resourceName = created?.resourceName;
  if (!resourceName) throw new Error(`No job resourceName: ${JSON.stringify(created)}`);

  // 2. Add operations (in chunks of 1000)
  const CHUNK = 1000;
  for (let i = 0; i < hashedEmails.length; i += CHUNK) {
    const ops = hashedEmails.slice(i, i + CHUNK).map((h) => ({
      create: { user_identifiers: [{ hashed_email: h }] },
    }));
    await ads(`/${resourceName}:addOperations`, token, {
      enable_partial_failure: true, operations: ops,
    });
  }

  // 3. Run
  await ads(`/${resourceName}:run`, token, {});
  return resourceName;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";
  const headerSecret = req.headers.get("x-kennel-ingest-secret") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const isService = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!isService && (!secret || headerSecret !== secret)) return J(401, { error: "unauthorized" });

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !DEV_TOKEN || !CUSTOMER_ID) {
    return J(400, { error: "google ads credentials missing" });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = await accessToken();

  // Pull emails + bucket (same logic)
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
      const userList = await getOrCreateUserList(admin, token, tier);
      let jobResource: string | null = null;
      if (emails.length > 0) {
        const hashed = await Promise.all(emails.map((e) => sha256Hex(e)));
        jobResource = await runOfflineJob(token, userList, hashed);
      }
      result[tier] = { user_list: userList, members: emails.length, job: jobResource };
      await admin.from("winback_snapshots").insert({
        tier, channel: "google", member_count: emails.length, payload: result[tier],
      });
    } catch (e: any) {
      result[tier] = { error: String(e?.message ?? e) };
    }
  }

  return J(200, { ok: true, tiers: result });
});