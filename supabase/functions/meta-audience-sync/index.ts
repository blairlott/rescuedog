// Syncs a Meta audience: pulls segment, hashes PII, pushes in 10k batches.
// Body: { segment_id?: string, segment_key?: string, cadence?: 'weekly'|'monthly' }
// If cadence given, loops all enabled segments matching that cadence.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH = "https://graph.facebook.com/v21.0";
const BATCH = 10000;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function normEmail(e: any): string | null {
  if (typeof e !== "string") return null;
  const t = e.trim().toLowerCase();
  return t.length > 3 && t.includes("@") ? t : null;
}
function normPhone(p: any): string | null {
  if (typeof p !== "string") return null;
  const d = p.replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.length === 10 ? "1" + d : d; // US default
}

async function metaCall(path: string, token: string, method = "GET", body?: any) {
  const url = `${GRAPH}${path}`;
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (method === "GET") {
    const u = new URL(url);
    u.searchParams.set("access_token", token);
    const r = await fetch(u.toString());
    return { status: r.status, body: await r.json() };
  }
  init.body = JSON.stringify({ ...(body ?? {}), access_token: token });
  const r = await fetch(url, init);
  return { status: r.status, body: await r.json() };
}

async function syncOne(admin: any, seg: any, token: string | null, accountId: string) {
  const runIns = await admin.from("meta_audience_sync_runs").insert({
    segment_id: seg.id, status: "running", executed_sql: seg.segment_query ?? null,
  }).select().single();
  const runId = runIns.data?.id;
  const finish = async (patch: Record<string, unknown>) => {
    if (runId) await admin.from("meta_audience_sync_runs").update({ ...patch, completed_at: new Date().toISOString() }).eq("id", runId);
  };

  if (!seg.enabled) return finish({ status: "skipped_disabled", error_message: seg.disabled_reason });
  if (!token) return finish({ status: "skipped_no_token", error_message: "META_SYSTEM_USER_TOKEN missing" });
  if (seg.segment_kind === "meta_rule_based") {
    // Just ensure audience exists Meta-side; no user push.
    return finish({ status: "success", error_message: "rule-based audience: nothing to push" });
  }

  // Create audience if needed
  let audId: string | null = seg.meta_audience_id;
  if (!audId) {
    const created = await metaCall(`/act_${accountId}/customaudiences`, token, "POST", {
      name: seg.segment_name,
      subtype: "CUSTOM",
      description: `RDW segment: ${seg.segment_key}`,
      customer_file_source: "USER_PROVIDED_ONLY",
    });
    if (created.status >= 300 || !created.body?.id) {
      return finish({ status: "error", error_message: `create audience failed: ${JSON.stringify(created.body)}` });
    }
    audId = created.body.id;
    await admin.from("meta_audiences").update({ meta_audience_id: audId, meta_audience_name: seg.segment_name }).eq("id", seg.id);
  }

  // Pull rows via secure executor
  const { data: rows, error: sqlErr } = await admin.rpc("run_meta_segment_sql", { _sql: seg.segment_query, _limit: null });
  if (sqlErr) return finish({ status: "error", error_message: `sql failed: ${sqlErr.message}` });
  const total = rows?.length ?? 0;

  // Hash + batch
  const hashed: string[][] = [];
  for (const r of rows ?? []) {
    const e = normEmail(r.email);
    const p = normPhone(r.phone);
    if (!e && !p) continue;
    hashed.push([e ? await sha256Hex(e) : "", p ? await sha256Hex(p) : ""]);
  }

  let pushed = 0;
  for (let i = 0; i < hashed.length; i += BATCH) {
    const chunk = hashed.slice(i, i + BATCH);
    const res = await metaCall(`/${audId}/users`, token, "POST", {
      payload: { schema: ["EMAIL_SHA256", "PHONE_SHA256"], data: chunk },
    });
    if (res.status >= 300) {
      return finish({ status: "error", records_pushed: pushed, error_message: `batch failed: ${JSON.stringify(res.body)}` });
    }
    pushed += chunk.length;
  }

  // LAL guard
  let lalCreated = false;
  if (seg.create_lal && !seg.meta_lookalike_id) {
    if (hashed.length < 100) {
      await admin.from("meta_audiences").update({ last_sync_at: new Date().toISOString(), member_count: hashed.length }).eq("id", seg.id);
      return finish({ status: "skipped_too_small", records_pushed: pushed, error_message: `LAL needs >=100 matched users (have ${hashed.length})` });
    }
    const lal = await metaCall(`/act_${accountId}/customaudiences`, token, "POST", {
      name: `${seg.segment_name} — LAL ${Math.round(Number(seg.lal_ratio) * 100)}% US`,
      subtype: "LOOKALIKE",
      origin_audience_id: audId,
      lookalike_spec: JSON.stringify({ ratio: Number(seg.lal_ratio), country: "US", type: "similarity" }),
    });
    if (lal.status < 300 && lal.body?.id) {
      await admin.from("meta_audiences").update({ meta_lookalike_id: lal.body.id }).eq("id", seg.id);
      lalCreated = true;
    }
  }

  await admin.from("meta_audiences").update({ last_sync_at: new Date().toISOString(), member_count: hashed.length }).eq("id", seg.id);
  await finish({ status: "success", records_pushed: pushed, lal_created: lalCreated, details: { total_rows: total, matched: hashed.length } });
  return { ok: true, pushed, matched: hashed.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Auth: either ad_ops user OR service-role (cron)
  const auth = req.headers.get("Authorization") ?? "";
  const isServiceRole = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!isServiceRole) {
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await userClient.auth.getClaims(auth.slice(7));
    const uid = claims?.claims?.sub as string | undefined;
    if (!uid) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: isOps } = await admin.rpc("is_ad_ops", { _user_id: uid });
    if (!isOps) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const token = Deno.env.get("META_SYSTEM_USER_TOKEN") ?? null;
  const accountId = (Deno.env.get("META_ADS_ACCOUNT_ID") ?? "").replace(/^act_/, "");

  let body: any = {};
  try { body = await req.json(); } catch { /* ok */ }

  let segments: any[] = [];
  if (body.segment_id) {
    const { data } = await admin.from("meta_audiences").select("*").eq("id", body.segment_id);
    segments = data ?? [];
  } else if (body.segment_key) {
    const { data } = await admin.from("meta_audiences").select("*").eq("segment_key", body.segment_key);
    segments = data ?? [];
  } else if (body.cadence) {
    const { data } = await admin.from("meta_audiences").select("*").eq("sync_cadence", body.cadence).eq("enabled", true);
    segments = data ?? [];
  } else {
    const { data } = await admin.from("meta_audiences").select("*").eq("enabled", true);
    segments = data ?? [];
  }

  const results: any[] = [];
  for (const seg of segments) {
    try {
      const r = await syncOne(admin, seg, token, accountId);
      results.push({ segment: seg.segment_key, ...r });
    } catch (e: any) {
      results.push({ segment: seg.segment_key, error: e?.message ?? String(e) });
    }
  }
  return new Response(JSON.stringify({ ok: true, count: segments.length, results, token_configured: !!token }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});