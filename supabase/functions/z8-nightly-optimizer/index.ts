// Z8 — Nightly Meta optimizer.
// Runs at 09:00 UTC (~04:00 ET) daily via pg_cron.
// Auto-executes ad-level kills, +20% adset scales, creative rotation, retargeting
// frequency kills, checkout-dropoff detection, and 48h ROAS rollback.
// All actions log to ad_execution_log with executor='z8_auto'.
// Kill switch: row 1 of public.z8_kill_switch must be enabled=true.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const META_API_VERSION = "v20.0";
const META_GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;
const ADMIN_URL = "https://rescuedog.lovable.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---------- Rule constants ----------
const KILL_MIN_SPEND_CENTS = 2500;        // $25
const KILL_MIN_AGE_HOURS = 48;
const KILL_MAX_PER_NIGHT = 5;
const KILL_LINK_CLICK_MIN_SPEND_CENTS = 1500; // $15 + 0 link clicks → kill ad
const SCALE_MIN_PURCHASES = 2;
const SCALE_MIN_ROAS = 3.0;
const SCALE_MAX_BUDGET_CENTS = 15000;     // $150
const SCALE_STEP_PCT = 0.20;
const SCALE_MAX_PER_NIGHT = 3;
const SCALE_COOLDOWN_HOURS = 48;
const RTG_MIN_FREQUENCY = 3.0;
const ROLLBACK_ROAS_DROP_PCT = 0.30;
const ROLLBACK_WINDOW_HOURS = 48;
const CHECKOUT_DROPOFF_MIN_ATC = 10;
const CHECKOUT_DROPOFF_MIN_IC = 2;
const WC_NAME_PREFIX = "WC-";
const RTG_NAME_RE = /(^|[^A-Z])(RTG|RMK|RETARGET|REMARKETING)/i;

type AdRow = {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  adset_name: string;
  status: string;
  created_time: string;
  spend_cents: number;
  purchases: number;
  revenue_cents: number;
  add_to_cart: number;
  initiate_checkout: number;
  link_clicks: number;
  frequency: number;
  is_retargeting: boolean;
  is_wine_club: boolean;
  age_hours: number;
  roas: number;
};

type AdSetRow = {
  adset_id: string;
  adset_name: string;
  status: string;
  daily_budget_cents: number;
  is_retargeting: boolean;
};

function actionCount(actions: any[] | undefined, type: string): number {
  if (!Array.isArray(actions)) return 0;
  const m = actions.find((a) => a?.action_type === type);
  return m ? Number(m.value) || 0 : 0;
}
function actionValue(actions: any[] | undefined, type: string): number {
  if (!Array.isArray(actions)) return 0;
  const m = actions.find((a) => a?.action_type === type);
  return m ? Number(m.value) || 0 : 0;
}

async function metaFetch(path: string, token: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; body: any }> {
  const url = path.startsWith("http") ? path : `${META_GRAPH}${path}`;
  const headers = { ...(init.headers || {}), Authorization: `Bearer ${token}` };
  const res = await fetch(url, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function fetchAdInsights(token: string, accountId: string): Promise<AdRow[]> {
  const fields = [
    "ad_id", "ad_name", "adset_id", "adset_name", "spend", "frequency",
    "actions", "action_values", "inline_link_clicks",
  ].join(",");
  const params = new URLSearchParams({
    level: "ad",
    date_preset: "last_14d",
    fields,
    limit: "500",
  });
  const path = `/${accountId}/insights?${params.toString()}`;
  const out: AdRow[] = [];
  let next: string | null = `${META_GRAPH}${path}`;
  // Pull ad metadata (status + created_time) in a second pass keyed by ad_id.
  const insightsByAd = new Map<string, any>();
  while (next) {
    const r = await metaFetch(next, token);
    if (!r.ok) throw new Error(`insights HTTP ${r.status}: ${JSON.stringify(r.body)}`);
    for (const row of r.body.data || []) insightsByAd.set(row.ad_id, row);
    next = r.body?.paging?.next ?? null;
  }
  if (insightsByAd.size === 0) return out;

  // Fetch status + created_time for these ads in batches of 50.
  const ids = Array.from(insightsByAd.keys());
  const meta = new Map<string, { status: string; created_time: string }>();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const r = await metaFetch(`/?ids=${batch.join(",")}&fields=effective_status,created_time`, token);
    if (!r.ok) continue;
    for (const id of batch) {
      const m = r.body?.[id];
      if (m) meta.set(id, { status: String(m.effective_status || ""), created_time: String(m.created_time || "") });
    }
  }

  const now = Date.now();
  for (const [id, ins] of insightsByAd.entries()) {
    const m = meta.get(id) || { status: "", created_time: "" };
    const spendCents = Math.round((Number(ins.spend) || 0) * 100);
    const purchases = actionCount(ins.actions, "omni_purchase") || actionCount(ins.actions, "purchase");
    const revenue = actionValue(ins.action_values, "omni_purchase") || actionValue(ins.action_values, "purchase");
    const adsetName = String(ins.adset_name || "");
    const adName = String(ins.ad_name || "");
    const createdMs = m.created_time ? Date.parse(m.created_time) : NaN;
    out.push({
      ad_id: id,
      ad_name: adName,
      adset_id: String(ins.adset_id || ""),
      adset_name: adsetName,
      status: m.status,
      created_time: m.created_time,
      spend_cents: spendCents,
      purchases,
      revenue_cents: Math.round(revenue * 100),
      add_to_cart: actionCount(ins.actions, "add_to_cart") || actionCount(ins.actions, "omni_add_to_cart"),
      initiate_checkout: actionCount(ins.actions, "initiate_checkout") || actionCount(ins.actions, "omni_initiated_checkout"),
      link_clicks: Number(ins.inline_link_clicks) || 0,
      frequency: Number(ins.frequency) || 0,
      is_retargeting: RTG_NAME_RE.test(adsetName) || RTG_NAME_RE.test(adName),
      is_wine_club: adName.startsWith(WC_NAME_PREFIX),
      age_hours: Number.isFinite(createdMs) ? (now - createdMs) / 3_600_000 : Infinity,
      roas: spendCents > 0 ? (revenue * 100) / spendCents : 0,
    });
  }
  return out;
}

async function fetchAdSets(token: string, adsetIds: string[]): Promise<Map<string, AdSetRow>> {
  const out = new Map<string, AdSetRow>();
  if (adsetIds.length === 0) return out;
  for (let i = 0; i < adsetIds.length; i += 50) {
    const batch = adsetIds.slice(i, i + 50);
    const r = await metaFetch(`/?ids=${batch.join(",")}&fields=name,effective_status,daily_budget`, token);
    if (!r.ok) continue;
    for (const id of batch) {
      const m = r.body?.[id];
      if (!m) continue;
      const name = String(m.name || "");
      out.set(id, {
        adset_id: id,
        adset_name: name,
        status: String(m.effective_status || ""),
        daily_budget_cents: Number(m.daily_budget) || 0, // Meta returns minor units
        is_retargeting: RTG_NAME_RE.test(name),
      });
    }
  }
  return out;
}

// Hard guard: refuses to POST status=PAUSED to anything that we know is an ad set.
// Z8 kill rules MUST target ads only; ad-set pauses require Blair's explicit approval.
async function pauseAd(
  token: string,
  adId: string,
  guard?: { adsetIds: Set<string>; adIds: Set<string>; admin: any; runId: string; reason: string },
) {
  if (guard) {
    if (guard.adsetIds.has(adId)) {
      await guard.admin.from("ad_execution_log").insert({
        executor: "z8_auto",
        actor_kind: "system",
        platform: "meta",
        action: "kill",
        target_level: "adset",
        target_id: adId,
        success: false,
        error_message: "kill rule attempted adset pause — blocked",
        request_payload: { ad_id: adId, run_id: guard.runId, reason: guard.reason, blocked: true },
      });
      throw new Error(`kill rule attempted adset pause — blocked (id=${adId})`);
    }
    if (!guard.adIds.has(adId)) {
      throw new Error(`kill rule target id not in known ad set — refusing pause (id=${adId})`);
    }
  }
  return metaFetch(`/${adId}`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "PAUSED" }),
  });
}
async function activateAd(token: string, adId: string) {
  return metaFetch(`/${adId}`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ACTIVE" }),
  });
}
async function setAdsetBudget(token: string, adsetId: string, dailyBudgetCents: number) {
  return metaFetch(`/${adsetId}`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ daily_budget: String(dailyBudgetCents) }),
  });
}

async function fireAlert(body: Record<string, unknown>) {
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/kennel-alert-dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify(body),
    });
  } catch (_) { /* non-fatal */ }
}

async function probeVinoshipperHandoff(adId: string, adName: string, token: string, admin: any, runId: string) {
  try {
    const r = await metaFetch(`/${adId}?fields=creative{object_story_spec,effective_object_story_id,link_url,asset_feed_spec}`, token);
    if (!r.ok) return;
    const c = r.body?.creative || {};
    const link =
      c.link_url ||
      c.object_story_spec?.link_data?.link ||
      c.object_story_spec?.video_data?.call_to_action?.value?.link ||
      null;
    if (!link) return;
    const probe = async (ua: string) => {
      try {
        const res = await fetch(link, { redirect: "follow", headers: { "User-Agent": ua } });
        return { status: res.status, final: res.url };
      } catch (e: any) { return { status: 0, final: String(e?.message ?? e) }; }
    };
    const mobile = await probe("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
    const desktop = await probe("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15");
    const reached = /vinoshipper\.com/i.test(mobile.final) || /vinoshipper\.com/i.test(desktop.final);
    await admin.from("z8_handoff_probes").insert({
      run_id: runId, ad_id: adId, ad_name: adName,
      landing_url: link, final_url: mobile.final,
      reached_vinoshipper: reached,
      mobile_status: mobile.status, desktop_status: desktop.status,
      notes: reached ? "ok" : `did not reach Vinoshipper (mobile final=${mobile.final})`,
    });
    if (!reached) {
      await fireAlert({
        event_type: "anomaly", channel: "meta", action: "vinoshipper_handoff_broken",
        message: `Z8 flag: ${adName} landing URL did not reach Vinoshipper. Mobile final: ${mobile.final}`,
        deep_link: `${ADMIN_URL}/kennel`,
      });
    }
  } catch (_) { /* non-fatal */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth
  const cronSecret = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && cronSecret === Deno.env.get("KENNEL_INGEST_SECRET");
  const auth = req.headers.get("Authorization") ?? "";

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  if (!isCron) {
    if (!auth.startsWith("Bearer ")) return J(401, { error: "Unauthorized" });
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return J(401, { error: "Unauthorized" });
    const { data: isOps } = await sb.rpc("is_ad_ops", { _user_id: user.id });
    if (!isOps) return J(403, { error: "Forbidden" });
  }

  const body = await req.json().catch(() => ({} as any));
  const dryRun = body?.dry_run === true;
  const probeAdIds: string[] = Array.isArray(body?.probe_ad_ids) ? body.probe_ad_ids : [];
  const probeAdNameContains: string | null = typeof body?.probe_ad_name_contains === "string" ? body.probe_ad_name_contains : null;

  const token = Deno.env.get("META_ADS_ACCESS_TOKEN") || Deno.env.get("META_SYSTEM_USER_TOKEN");
  const accountId = Deno.env.get("META_ADS_ACCOUNT_ID");
  if (!token || !accountId) return J(500, { error: "META_ADS_ACCESS_TOKEN/META_ADS_ACCOUNT_ID missing" });

  // Kill switch
  const { data: ks } = await admin.from("z8_kill_switch").select("*").eq("id", 1).maybeSingle();
  const killSwitchEnabled = ks?.enabled !== false;

  // Open run record
  const { data: runRow } = await admin.from("z8_runs").insert({
    dry_run: dryRun,
    kill_switch_enabled: killSwitchEnabled,
    status: "running",
  }).select("id").single();
  const runId: string = runRow!.id;

  const logExec = async (row: {
    action: string; ad_id?: string; adset_id?: string; reason: string;
    target_level?: "ad" | "adset"; target_id?: string;
    before?: any; after?: any; success: boolean; error?: string;
    delta_pct?: number; spend_impact_cents?: number;
    roas_at_time?: number; spend_at_time?: number;
    request?: any; response?: any;
  }) => {
    // Default target inference: kills/rotations operate on ads; scales/rollbacks on ad sets.
    const targetLevel = row.target_level
      ?? (row.action === "kill" || row.action === "rotate" ? "ad"
        : row.action === "scale" || row.action === "rollback" ? "adset"
        : (row.ad_id ? "ad" : row.adset_id ? "adset" : undefined));
    const targetId = row.target_id
      ?? (targetLevel === "ad" ? (row.ad_id ?? undefined)
        : targetLevel === "adset" ? (row.adset_id ?? undefined)
        : undefined);
    await admin.from("ad_execution_log").insert({
      executor: "z8_auto",
      actor_kind: "system",
      platform: "meta",
      action: row.action,
      campaign_id: row.adset_id ?? row.ad_id ?? null,
      target_level: targetLevel ?? null,
      target_id: targetId ?? null,
      before_value: row.before ?? null,
      after_value: row.after ?? null,
      delta_pct: row.delta_pct ?? null,
      spend_impact_cents: row.spend_impact_cents ?? null,
      success: row.success,
      error_message: row.error ?? null,
      request_payload: {
        ad_id: row.ad_id ?? null,
        adset_id: row.adset_id ?? null,
        reason: row.reason,
        roas_at_time: row.roas_at_time ?? null,
        spend_at_time: row.spend_at_time ?? null,
        run_id: runId,
        z8_request: row.request ?? null,
      },
      response_payload: row.response ?? null,
    });
  };

  const summary: Record<string, any> = {
    kills: [] as any[], scales: [] as any[], rotations: [] as any[],
    rollbacks: [] as any[], checkout_dropoffs: [] as any[],
    retargeting_kills: [] as any[], skipped: [] as any[], errors: [] as any[],
  };
  let kills = 0, scales = 0, rotations = 0, rollbacks = 0, rtgKills = 0, dropoffs = 0, errors = 0;
  let budgetFreedCents = 0;

  try {
    // ---------- 1. Auto-rollback scales from last 48h ----------
    {
      const since = new Date(Date.now() - ROLLBACK_WINDOW_HOURS * 3_600_000).toISOString();
      const { data: recentScales } = await admin.from("ad_execution_log")
        .select("id, campaign_id, before_value, after_value, request_payload, created_at")
        .eq("executor", "z8_auto").eq("action", "scale").eq("success", true)
        .gte("created_at", since);
      for (const s of recentScales || []) {
        const adsetId = s.campaign_id as string;
        if (!adsetId) continue;
        const baselineRoas = Number((s.request_payload as any)?.roas_at_time) || 0;
        if (baselineRoas <= 0) continue;
        // Pull last-48h ROAS for this adset
        const recentR = await metaFetch(
          `/${adsetId}/insights?level=adset&date_preset=last_3d&fields=spend,action_values&limit=1`,
          token,
        );
        const row = recentR.body?.data?.[0];
        if (!row) continue;
        const spend = Number(row.spend) || 0;
        const rev = actionValue(row.action_values, "omni_purchase") || actionValue(row.action_values, "purchase");
        if (spend <= 0) continue;
        const currentRoas = rev / spend;
        const dropPct = (baselineRoas - currentRoas) / baselineRoas;
        if (dropPct > ROLLBACK_ROAS_DROP_PCT) {
          const oldBudget = Number((s.before_value as any)?.daily_budget_cents) || 0;
          if (oldBudget <= 0) continue;
          if (dryRun) {
            summary.rollbacks.push({ adset_id: adsetId, drop_pct: dropPct, dry_run: true });
            rollbacks++;
            continue;
          }
          const r = await setAdsetBudget(token, adsetId, oldBudget);
          await logExec({
            action: "rollback", adset_id: adsetId, reason: "scale_roas_drop_48h",
            before: { daily_budget_cents: Number((s.after_value as any)?.daily_budget_cents) || 0 },
            after: { daily_budget_cents: oldBudget },
            success: r.ok, error: r.ok ? undefined : JSON.stringify(r.body),
            roas_at_time: currentRoas, response: r.body,
          });
          if (r.ok) {
            rollbacks++;
            summary.rollbacks.push({ adset_id: adsetId, drop_pct: dropPct, reverted_to_cents: oldBudget });
            await fireAlert({
              event_type: "rollback", channel: "meta", action: "z8_scale_rolled_back",
              message: `Z8 auto-rollback: adset ${adsetId} ROAS dropped ${(dropPct * 100).toFixed(0)}% within 48h. Reverted to $${(oldBudget / 100).toFixed(0)}/day.`,
              deep_link: `${ADMIN_URL}/kennel`,
            });
          } else { errors++; summary.errors.push({ stage: "rollback", adset_id: adsetId, err: r.body }); }
        }
      }
    }

    // ---------- 2. Pull insights ----------
    if (!killSwitchEnabled) {
      await admin.from("z8_runs").update({
        status: "skipped", finished_at: new Date().toISOString(),
        summary: { reason: "kill_switch_paused" },
      }).eq("id", runId);
      return J(200, { ok: true, skipped: "kill_switch_paused", run_id: runId });
    }

    const ads = await fetchAdInsights(token, accountId);
    const adsetIds = Array.from(new Set(ads.map(a => a.adset_id).filter(Boolean)));
    const adsets = await fetchAdSets(token, adsetIds);

    // Guard set: every id we know is an ad set, every id we know is an ad.
    // pauseAd() refuses to POST status=PAUSED to anything in adsetIdsSet.
    const adsetIdsSet = new Set<string>(adsetIds);
    const adIdsSet = new Set<string>(ads.map(a => a.ad_id).filter(Boolean));

    // ---------- 3. Checkout drop-off detection (before kill) ----------
    const dropoffAdIds = new Set<string>();
    for (const a of ads) {
      if (a.purchases === 0 && a.add_to_cart >= CHECKOUT_DROPOFF_MIN_ATC && a.initiate_checkout >= CHECKOUT_DROPOFF_MIN_IC) {
        dropoffAdIds.add(a.ad_id);
        if (dryRun) {
          summary.checkout_dropoffs.push({ ad_id: a.ad_id, ad_name: a.ad_name, atc: a.add_to_cart, ic: a.initiate_checkout, dry_run: true });
          dropoffs++;
          continue;
        }
        await logExec({
          action: "checkout_dropoff_flag", ad_id: a.ad_id, adset_id: a.adset_id,
          reason: "checkout_dropoff_suspected", success: true,
          before: { atc: a.add_to_cart, ic: a.initiate_checkout, purchases: 0 },
          spend_at_time: a.spend_cents,
        });
        dropoffs++;
        summary.checkout_dropoffs.push({ ad_id: a.ad_id, ad_name: a.ad_name, atc: a.add_to_cart, ic: a.initiate_checkout });
        await fireAlert({
          event_type: "anomaly", channel: "meta", action: "checkout_dropoff_suspected",
          message: `Z8 flag: ${a.ad_name} had ${a.add_to_cart} ATCs + ${a.initiate_checkout} IC + 0 purchases — checkout drop-off suspected, not a creative issue. Want me to check the Vinoshipper handoff URL?`,
          deep_link: `${ADMIN_URL}/kennel`,
        });
        // Auto-probe Vinoshipper handoff
        await probeVinoshipperHandoff(a.ad_id, a.ad_name, token, admin, runId);
      }
    }

    // ---------- 4. Kill candidates (general + retargeting) ----------
    const generalKillCandidates: AdRow[] = [];
    const rtgKillCandidates: AdRow[] = [];
    const linkClickKillCandidates: AdRow[] = [];
    for (const a of ads) {
      if (a.status !== "ACTIVE") continue;
      if (a.is_wine_club) continue;
      if (dropoffAdIds.has(a.ad_id)) continue; // skip drop-offs entirely
      // Link-click kill: $15+ spend, 0 link clicks. Evaluated per ad. Doesn't need 48h age.
      if (a.spend_cents >= KILL_LINK_CLICK_MIN_SPEND_CENTS && a.link_clicks === 0) {
        linkClickKillCandidates.push(a);
        continue;
      }
      if (a.spend_cents < KILL_MIN_SPEND_CENTS) continue;
      if (a.purchases > 0) continue;
      if (a.age_hours < KILL_MIN_AGE_HOURS) continue;
      if (a.is_retargeting && a.frequency >= RTG_MIN_FREQUENCY) {
        rtgKillCandidates.push(a);
      } else {
        generalKillCandidates.push(a);
      }
    }
    // Sort by spend desc, cap general kills at 5
    generalKillCandidates.sort((a, b) => b.spend_cents - a.spend_cents);
    const generalToKill = generalKillCandidates.slice(0, KILL_MAX_PER_NIGHT);
    const generalDeferred = generalKillCandidates.slice(KILL_MAX_PER_NIGHT);
    for (const a of generalDeferred) {
      summary.skipped.push({ ad_id: a.ad_id, ad_name: a.ad_name, reason: "kill_cap_reached_defer_next_night" });
    }

    const killedAdNames: string[] = [];
    const allKills = [
      ...generalToKill.map(a => ({ ad: a, reason: "zero_purchase_kill" })),
      ...rtgKillCandidates.map(a => ({ ad: a, reason: "frequency_exhausted_kill" })),
      ...linkClickKillCandidates.map(a => ({ ad: a, reason: "zero_link_clicks_kill" })),
    ];

    for (const { ad, reason } of allKills) {
      if (dryRun) {
        if (reason === "frequency_exhausted_kill") { rtgKills++; summary.retargeting_kills.push({ ad_id: ad.ad_id, ad_name: ad.ad_name, dry_run: true }); }
        else { kills++; summary.kills.push({ ad_id: ad.ad_id, ad_name: ad.ad_name, dry_run: true }); }
        budgetFreedCents += Math.round(ad.spend_cents / 14); // ~daily portion of 14d spend
        killedAdNames.push(ad.ad_name);
        continue;
      }
      let r: { ok: boolean; status: number; body: any };
      try {
        r = await pauseAd(token, ad.ad_id, {
          adsetIds: adsetIdsSet, adIds: adIdsSet, admin, runId, reason,
        });
      } catch (guardErr: any) {
        errors++;
        summary.errors.push({ stage: "kill_guard", ad_id: ad.ad_id, err: String(guardErr?.message ?? guardErr) });
        continue;
      }
      await logExec({
        action: "kill", ad_id: ad.ad_id, adset_id: ad.adset_id, reason,
        target_level: "ad", target_id: ad.ad_id,
        before: { status: "ACTIVE", spend_cents_14d: ad.spend_cents, purchases: ad.purchases, frequency: ad.frequency },
        after: { status: "PAUSED" },
        success: r.ok, error: r.ok ? undefined : JSON.stringify(r.body),
        spend_at_time: ad.spend_cents, roas_at_time: ad.roas, response: r.body,
      });
      if (r.ok) {
        if (reason === "frequency_exhausted_kill") { rtgKills++; summary.retargeting_kills.push({ ad_id: ad.ad_id, ad_name: ad.ad_name, adset_name: ad.adset_name }); }
        else { kills++; summary.kills.push({ ad_id: ad.ad_id, ad_name: ad.ad_name, adset_name: ad.adset_name, spend_cents: ad.spend_cents }); }
        const approxDaily = Math.round(ad.spend_cents / 14);
        budgetFreedCents += approxDaily;
        killedAdNames.push(ad.ad_name);

        // ---------- 5. Rotate in a reserve in the same adset ----------
        const { data: reserve } = await admin.from("ad_reserves")
          .select("id, ad_id, ad_name").eq("platform", "meta").eq("adset_id", ad.adset_id)
          .is("used_at", null).order("rotation_order", { ascending: true }).limit(1).maybeSingle();
        let reserveAdId: string | null = reserve?.ad_id ?? null;
        let reserveAdName: string | null = reserve?.ad_name ?? null;
        if (!reserveAdId) {
          // Auto-detect: paused ad in same adset, not WC-, oldest first
          const candidates = ads.filter(x =>
            x.adset_id === ad.adset_id && x.ad_id !== ad.ad_id && x.status === "PAUSED" && !x.is_wine_club,
          );
          if (candidates.length > 0) {
            reserveAdId = candidates[0].ad_id;
            reserveAdName = candidates[0].ad_name;
          }
        }
        if (reserveAdId) {
          const rr = await activateAd(token, reserveAdId);
          await logExec({
            action: "rotate", ad_id: reserveAdId, adset_id: ad.adset_id,
            reason: "rotation_after_kill",
            before: { status: "PAUSED", replaces_ad_id: ad.ad_id },
            after: { status: "ACTIVE" },
            success: rr.ok, error: rr.ok ? undefined : JSON.stringify(rr.body),
            response: rr.body,
          });
          if (rr.ok) {
            if (reserve?.id) await admin.from("ad_reserves").update({ used_at: new Date().toISOString() }).eq("id", reserve.id);
            rotations++;
            summary.rotations.push({ replaced_ad_name: ad.ad_name, new_ad_name: reserveAdName, adset_name: ad.adset_name });
            await fireAlert({
              event_type: "auto_executed", channel: "meta", action: "z8_rotate",
              message: `Z8 rotated in ${reserveAdName ?? reserveAdId} to replace ${ad.ad_name} in ${ad.adset_name}.`,
              deep_link: `${ADMIN_URL}/kennel`,
            });
          } else { errors++; summary.errors.push({ stage: "rotate", ad_id: reserveAdId, err: rr.body }); }
        }
      } else { errors++; summary.errors.push({ stage: "kill", ad_id: ad.ad_id, err: r.body }); }
    }

    // ---------- 6. Scale winners ----------
    // Aggregate per adset using its primary ad (highest spend ad with purchases).
    const adsByAdset = new Map<string, AdRow[]>();
    for (const a of ads) {
      if (!a.adset_id) continue;
      const arr = adsByAdset.get(a.adset_id) || [];
      arr.push(a);
      adsByAdset.set(a.adset_id, arr);
    }
    const scaleCandidates: { adset: AdSetRow; primary: AdRow; newBudget: number }[] = [];
    for (const [adsetId, adsInSet] of adsByAdset.entries()) {
      const adset = adsets.get(adsetId);
      if (!adset) continue;
      if (adset.daily_budget_cents <= 0 || adset.daily_budget_cents >= SCALE_MAX_BUDGET_CENTS) continue;
      const primary = adsInSet
        .filter(a => a.status === "ACTIVE" && !a.is_wine_club)
        .sort((a, b) => b.spend_cents - a.spend_cents)[0];
      if (!primary) continue;
      if (primary.purchases < SCALE_MIN_PURCHASES) continue;
      if (primary.roas < SCALE_MIN_ROAS) continue;
      const stepped = Math.round(adset.daily_budget_cents * (1 + SCALE_STEP_PCT));
      const newBudget = Math.min(stepped, SCALE_MAX_BUDGET_CENTS);
      if (newBudget <= adset.daily_budget_cents) continue;
      scaleCandidates.push({ adset, primary, newBudget });
    }
    // Sort by primary spend desc; check cooldown; cap 3 per night.
    scaleCandidates.sort((a, b) => b.primary.spend_cents - a.primary.spend_cents);
    let scaledCount = 0;
    for (const c of scaleCandidates) {
      if (scaledCount >= SCALE_MAX_PER_NIGHT) {
        summary.skipped.push({ adset_id: c.adset.adset_id, reason: "scale_cap_reached" });
        continue;
      }
      const cooldownSince = new Date(Date.now() - SCALE_COOLDOWN_HOURS * 3_600_000).toISOString();
      const { data: recent } = await admin.from("ad_execution_log")
        .select("id").eq("executor", "z8_auto").eq("action", "scale")
        .eq("campaign_id", c.adset.adset_id).gte("created_at", cooldownSince).limit(1);
      if ((recent || []).length > 0) {
        summary.skipped.push({ adset_id: c.adset.adset_id, reason: "scale_cooldown_48h" });
        continue;
      }
      if (dryRun) {
        scales++; scaledCount++;
        summary.scales.push({ adset_id: c.adset.adset_id, adset_name: c.adset.adset_name,
          old_budget_cents: c.adset.daily_budget_cents, new_budget_cents: c.newBudget, roas: c.primary.roas, dry_run: true });
        continue;
      }
      const r = await setAdsetBudget(token, c.adset.adset_id, c.newBudget);
      await logExec({
        action: "scale", adset_id: c.adset.adset_id, reason: "scale_winner",
        before: { daily_budget_cents: c.adset.daily_budget_cents },
        after: { daily_budget_cents: c.newBudget },
        delta_pct: ((c.newBudget - c.adset.daily_budget_cents) / c.adset.daily_budget_cents) * 100,
        success: r.ok, error: r.ok ? undefined : JSON.stringify(r.body),
        roas_at_time: c.primary.roas, spend_at_time: c.primary.spend_cents,
        response: r.body,
      });
      if (r.ok) {
        scales++; scaledCount++;
        summary.scales.push({ adset_id: c.adset.adset_id, adset_name: c.adset.adset_name,
          old_budget_cents: c.adset.daily_budget_cents, new_budget_cents: c.newBudget, roas: c.primary.roas });
        await fireAlert({
          event_type: "auto_executed", channel: "meta", action: "z8_scale",
          message: `Z8 scaled ${c.adset.adset_name} +20% to $${(c.newBudget / 100).toFixed(0)}/day. 14-day ROAS: ${c.primary.roas.toFixed(2)}x.`,
          deep_link: `${ADMIN_URL}/kennel`,
        });
      } else { errors++; summary.errors.push({ stage: "scale", adset_id: c.adset.adset_id, err: r.body }); }
    }

    // ---------- 7. Summary SMS for kills ----------
    if (kills + rtgKills > 0) {
      const names = killedAdNames.slice(0, 5).join(", ") + (killedAdNames.length > 5 ? `, +${killedAdNames.length - 5} more` : "");
      await fireAlert({
        event_type: "auto_executed", channel: "meta", action: "z8_nightly_kill_sweep",
        spend_impact_cents: -budgetFreedCents,
        message: `Z8 killed ${kills + rtgKills} ad${kills + rtgKills === 1 ? "" : "s"} overnight: ${names}. ~$${(budgetFreedCents / 100).toFixed(0)} daily budget freed.`,
        deep_link: `${ADMIN_URL}/kennel`,
      });
    }

    // ---------- 8. One-off Vinoshipper probes requested in body ----------
    if (probeAdIds.length > 0 || probeAdNameContains) {
      const targets = ads.filter(a =>
        probeAdIds.includes(a.ad_id) ||
        (probeAdNameContains && a.ad_name.toLowerCase().includes(probeAdNameContains.toLowerCase()))
      );
      for (const t of targets) await probeVinoshipperHandoff(t.ad_id, t.ad_name, token, admin, runId);
    }
  } catch (e: any) {
    errors++;
    summary.errors.push({ stage: "fatal", err: String(e?.message ?? e) });
    await admin.from("z8_runs").update({
      status: "error", finished_at: new Date().toISOString(),
      errors, summary, error_message: String(e?.message ?? e),
    }).eq("id", runId);
    return J(500, { ok: false, run_id: runId, error: String(e?.message ?? e), summary });
  }

  await admin.from("z8_runs").update({
    status: "ok", finished_at: new Date().toISOString(),
    kills_executed: kills, scales_executed: scales, rotations_executed: rotations,
    rollbacks_executed: rollbacks, retargeting_kills_executed: rtgKills,
    checkout_dropoffs_flagged: dropoffs, errors,
    daily_budget_freed_cents: budgetFreedCents, summary,
  }).eq("id", runId);

  return J(200, {
    ok: true, run_id: runId, dry_run: dryRun,
    kills, scales, rotations, rollbacks,
    retargeting_kills: rtgKills, checkout_dropoffs: dropoffs,
    errors, daily_budget_freed_cents: budgetFreedCents, summary,
  });
});