// kennel-google-customer-match
// Builds a Google Ads Customer Match userlist from paid buyers + top-20% lookalikes
// (SHA-256 hashed), uploads via OfflineUserDataJobService, logs to kennel_audience_uploads,
// and alerts on failure.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { getGoogleAdsAccessToken, buildGoogleAdsHeaders, isAuthError } from "../_shared/googleAdsAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LIST_NAME = "kennel_buyers_plus_lookalikes";
const LIST_DESCRIPTION = "RDW paid DTC buyers + top 20% Kennel lookalike scores";
const ALERT_EMAIL = "blair.lott@rescuedogwines.com";
const ADS_API = "https://googleads.googleapis.com/v20";

function normEmail(e: unknown): string | null {
  if (typeof e !== "string") return null;
  const t = e.trim().toLowerCase();
  return t.length > 3 && t.includes("@") ? t : null;
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendAlert(admin: any, subject: string, body: string) {
  try {
    await admin.functions.invoke("kennel-alert-dispatch", {
      body: { to: ALERT_EMAIL, subject, body, source: "kennel-google-customer-match" },
    });
  } catch (e) {
    console.error("[kennel-google-customer-match] alert dispatch failed", e);
  }
}

async function findOrCreateUserList(headers: Record<string, string>, customerId: string): Promise<string> {
  // Search for existing list by name.
  const searchRes = await fetch(`${ADS_API}/customers/${customerId}/googleAds:search`, {
    method: "POST", headers,
    body: JSON.stringify({
      query: `SELECT user_list.resource_name, user_list.name FROM user_list WHERE user_list.name = '${LIST_NAME}' LIMIT 1`,
    }),
  });
  const searchJson = await searchRes.json();
  if (!searchRes.ok) throw new Error(`search user_list failed: ${JSON.stringify(searchJson).slice(0, 400)}`);
  const existing = searchJson?.results?.[0]?.userList?.resourceName;
  if (existing) return existing;

  // Create new CRM-based user list.
  const createRes = await fetch(`${ADS_API}/customers/${customerId}/userLists:mutate`, {
    method: "POST", headers,
    body: JSON.stringify({
      operations: [{
        create: {
          name: LIST_NAME,
          description: LIST_DESCRIPTION,
          membershipLifeSpan: 540,
          crmBasedUserList: { uploadKeyType: "CONTACT_INFO" },
        },
      }],
    }),
  });
  const createJson = await createRes.json();
  if (!createRes.ok) throw new Error(`create user_list failed: ${JSON.stringify(createJson).slice(0, 400)}`);
  return createJson?.results?.[0]?.resourceName;
}

async function uploadHashedEmails(headers: Record<string, string>, customerId: string, userListResource: string, hashedEmails: string[]) {
  // 1) Create OfflineUserDataJob of type CUSTOMER_MATCH_USER_LIST.
  const jobRes = await fetch(`${ADS_API}/customers/${customerId}/offlineUserDataJobs:create`, {
    method: "POST", headers,
    body: JSON.stringify({
      job: {
        type: "CUSTOMER_MATCH_USER_LIST",
        customerMatchUserListMetadata: { userList: userListResource },
      },
    }),
  });
  const jobJson = await jobRes.json();
  if (!jobRes.ok) throw new Error(`create job failed: ${JSON.stringify(jobJson).slice(0, 400)}`);
  const jobResource: string = jobJson.resourceName;

  // 2) Add operations in chunks of 5000.
  const CHUNK = 5000;
  for (let i = 0; i < hashedEmails.length; i += CHUNK) {
    const chunk = hashedEmails.slice(i, i + CHUNK);
    const ops = chunk.map((h) => ({ create: { userIdentifiers: [{ hashedEmail: h }] } }));
    const addRes = await fetch(`${ADS_API}/${jobResource}:addOperations`, {
      method: "POST", headers,
      body: JSON.stringify({ operations: ops, enablePartialFailure: true }),
    });
    const addJson = await addRes.json();
    if (!addRes.ok) throw new Error(`addOperations failed: ${JSON.stringify(addJson).slice(0, 400)}`);
  }

  // 3) Run the job (async on Google's side).
  const runRes = await fetch(`${ADS_API}/${jobResource}:run`, { method: "POST", headers });
  if (!runRes.ok) {
    const t = await runRes.text();
    throw new Error(`run job failed: ${t.slice(0, 400)}`);
  }
  return jobResource;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Pre-create log row so we always have a record.
  const { data: logRow } = await admin
    .from("kennel_audience_uploads")
    .insert({ platform: "google", list_name: LIST_NAME, email_count: 0, status: "pending" })
    .select().single();
  const uploadId = logRow?.upload_id;

  const fail = async (msg: string, status = 500) => {
    if (uploadId) {
      await admin.from("kennel_audience_uploads").update({ status: "failed", error_message: msg.slice(0, 1000) }).eq("upload_id", uploadId);
    }
    await sendAlert(admin, "Kennel Google Customer Match upload FAILED", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  try {
    // 1) Gather buyer emails (paged).
    const buyers = new Set<string>();
    {
      const PAGE = 1000; let from = 0;
      while (true) {
        const { data, error } = await admin
          .from("vs_transactions")
          .select("customer_email,order_type")
          .not("customer_email", "is", null)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        for (const r of data) {
          const ot = String(r.order_type ?? "").toUpperCase();
          if (ot === "WINE_CLUB" || ot === "WHOLESALE") continue;
          const e = normEmail(r.customer_email);
          if (e) buyers.add(e);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }

    // 2) Top 20% of lookalike scores.
    const { count: totalScored } = await admin
      .from("kennel_lookalike_scores")
      .select("email", { count: "exact", head: true });
    const topN = Math.max(0, Math.floor((totalScored ?? 0) * 0.20));
    const lookalikes = new Set<string>();
    if (topN > 0) {
      const PAGE = 1000;
      for (let from = 0; from < topN; from += PAGE) {
        const to = Math.min(from + PAGE - 1, topN - 1);
        const { data, error } = await admin
          .from("kennel_lookalike_scores")
          .select("email")
          .order("score", { ascending: false })
          .range(from, to);
        if (error) throw error;
        for (const r of data ?? []) {
          const e = normEmail(r.email);
          if (e) lookalikes.add(e);
        }
      }
    }

    // 3) Dedupe + hash.
    const all = new Set<string>([...buyers, ...lookalikes]);
    const hashed: string[] = [];
    for (const e of all) hashed.push(await sha256Hex(e));
    if (hashed.length === 0) return await fail("no emails to upload", 400);

    // 4) Google Ads auth + upload.
    const auth = await getGoogleAdsAccessToken();
    if (isAuthError(auth)) return await fail(`google ads auth: ${auth.error}`, 502);
    const headers = buildGoogleAdsHeaders(auth.accessToken, auth.config);
    const userListResource = await findOrCreateUserList(headers, auth.config.customerId);
    const jobResource = await uploadHashedEmails(headers, auth.config.customerId, userListResource, hashed);

    // 5) Mark success.
    await admin.from("kennel_audience_uploads").update({
      status: "success",
      email_count: hashed.length,
      metadata: {
        buyers: buyers.size,
        lookalikes: lookalikes.size,
        user_list: userListResource,
        job: jobResource,
      },
    }).eq("upload_id", uploadId);

    return new Response(JSON.stringify({
      ok: true, upload_id: uploadId, email_count: hashed.length,
      buyers: buyers.size, lookalikes: lookalikes.size,
      user_list: userListResource, job: jobResource,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return await fail((e as Error).message);
  }
});