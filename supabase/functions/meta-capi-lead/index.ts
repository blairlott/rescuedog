// Meta Conversions API — Lead + CompleteRegistration sender for Wine Club signups.
//
// Fires server-side `Lead` and `CompleteRegistration` events with the monetary
// value computed by `wineClubSignupValue` so Meta's OUTCOME_LEADS bidder can
// optimize on real value (not just count of leads). `event_id` is the
// membership id (or supplied id) for dedup with any future browser pixel.
//
// Auth: requires a logged-in user JWT (a customer just finished signup) OR
// the kennel ingest shared secret (for backfill/manual tests).
//
// Kill switch: `app_settings.kennel_capi_enabled = false` returns a no-op
// (mirrors the Purchase sender).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kennel-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_RETENTION_MONTHS = 6;
const DEFAULT_GROSS_MARGIN = 0.55;
const TARGET_CPL_FRACTION_OF_LTV = 0.15;

interface LeadRequest {
  event_id?: string;       // dedup key (membership id preferred)
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  client_ip?: string | null;
  user_agent?: string | null;
  tier_id?: string | null;       // optional — if provided we use this tier's price instead of avg
  test_mode?: boolean;
  test_event_code?: string | null;
}

async function sha256Lower(input: string | null | undefined): Promise<string | undefined> {
  if (!input) return undefined;
  const data = new TextEncoder().encode(String(input).trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function computeValue(supabase: any, tierIdOverride?: string | null) {
  const [tiersRes, membersRes, settingsRes] = await Promise.all([
    supabase.from("wine_club_tiers").select("id, price_cents, is_active"),
    supabase.from("wine_club_memberships").select("tier_id, status"),
    supabase.from("app_settings").select("key, value").in("key", [
      "wine_club_signup_lead_value_cents",
      "wine_club_retention_months",
      "wine_club_gross_margin_pct",
    ]),
  ]);
  const tiers = (tiersRes.data ?? []) as Array<{ id: string; price_cents: number; is_active: boolean }>;
  const members = (membersRes.data ?? []) as Array<{ tier_id: string; status: string }>;
  const settings = (settingsRes.data ?? []) as Array<{ key: string; value: any }>;
  const map = new Map(settings.map((s) => [s.key, s.value]));

  const retention = Number(map.get("wine_club_retention_months") ?? DEFAULT_RETENTION_MONTHS) || DEFAULT_RETENTION_MONTHS;
  const margin = Number(map.get("wine_club_gross_margin_pct") ?? DEFAULT_GROSS_MARGIN) || DEFAULT_GROSS_MARGIN;

  let avgCents = 0;
  if (tierIdOverride) {
    avgCents = tiers.find((t) => t.id === tierIdOverride)?.price_cents ?? 0;
  }
  if (!avgCents) {
    const active = members.filter((m) => m.status === "active");
    const priceMap = new Map(tiers.map((t) => [t.id, t.price_cents]));
    if (active.length > 0) {
      avgCents = active.reduce((s, m) => s + (priceMap.get(m.tier_id) ?? 0), 0) / active.length;
    } else {
      const pool = tiers.filter((t) => t.is_active);
      const src = pool.length > 0 ? pool : tiers;
      avgCents = src.length > 0 ? src.reduce((s, t) => s + t.price_cents, 0) / src.length : 0;
    }
  }

  const override = map.get("wine_club_signup_lead_value_cents");
  const overrideUsd = override != null ? Number(override) / 100 : null;
  const avgUsd = avgCents / 100;
  const computedLead = +(avgUsd * margin).toFixed(2);
  const leadValue = overrideUsd != null && overrideUsd > 0 ? overrideUsd : computedLead;
  const predictedLtv = +(avgUsd * retention * margin).toFixed(2);
  const targetCpl = Math.max(8, +(predictedLtv * TARGET_CPL_FRACTION_OF_LTV).toFixed(2));

  return {
    lead_value_usd: leadValue,
    predicted_ltv_usd: predictedLtv,
    target_cpl_max_usd: targetCpl,
    avg_tier_price_usd: +avgUsd.toFixed(2),
    retention_months: retention,
    gross_margin_pct: margin,
    source: overrideUsd != null && overrideUsd > 0 ? "app_settings_override" : "computed",
  };
}

async function sendMetaEvent(
  eventName: "Lead" | "CompleteRegistration",
  body: LeadRequest,
  value: number,
  predictedLtv: number,
  eventId: string,
) {
  const pixelId = Deno.env.get("META_PIXEL_ID");
  const token = Deno.env.get("META_CAPI_TOKEN");
  if (!pixelId || !token) return { ok: true, skipped: true as const };

  const [em, ph, fn, ln, ct, st, zp, country] = await Promise.all([
    sha256Lower(body.email),
    sha256Lower(body.phone?.replace(/\D/g, "")),
    sha256Lower(body.first_name),
    sha256Lower(body.last_name),
    sha256Lower(body.city),
    sha256Lower(body.state),
    sha256Lower(body.zip),
    sha256Lower(body.country || "us"),
  ]);

  const user_data: Record<string, unknown> = {};
  if (em) user_data.em = [em];
  if (ph) user_data.ph = [ph];
  if (fn) user_data.fn = [fn];
  if (ln) user_data.ln = [ln];
  if (ct) user_data.ct = [ct];
  if (st) user_data.st = [st];
  if (zp) user_data.zp = [zp];
  if (country) user_data.country = [country];
  if (body.fbc) user_data.fbc = body.fbc;
  if (body.fbp) user_data.fbp = body.fbp;
  if (body.client_ip) user_data.client_ip_address = body.client_ip;
  if (body.user_agent) user_data.client_user_agent = body.user_agent;

  const testCode = body.test_mode ? (body.test_event_code || "TEST12345") : null;
  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: `${eventId}:${eventName}`,
        action_source: "website",
        event_source_url: `${Deno.env.get("PUBLIC_SITE_URL") ?? "https://rescuedog.lovable.app"}/wine-club`,
        user_data,
        custom_data: {
          currency: "USD",
          value,
          predicted_ltv: predictedLtv,
          content_name: "wine_club_signup",
          content_category: "subscription",
        },
      },
    ],
    ...(testCode ? { test_event_code: testCode } : {}),
  };

  const r = await fetch(
    `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
  );
  const text = await r.text().catch(() => "");
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  if (!r.ok) return { ok: false as const, error: `Meta ${r.status} ${text.slice(0, 200)}`, debug: parsed };
  return { ok: true as const, debug: parsed, test_event_code: testCode };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: user JWT OR shared ingest secret.
  const ingestSecret = req.headers.get("x-kennel-ingest-secret");
  const expected = Deno.env.get("KENNEL_INGEST_SECRET");
  const ingestOk = !!expected && ingestSecret === expected;
  if (!ingestOk) {
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!jwt) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData } = await supabase.auth.getUser(jwt);
    if (!userData?.user?.id) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const body = (await req.json()) as LeadRequest;
    const eventId = body.event_id ?? crypto.randomUUID();

    // Kill switch (allow test_mode through).
    const { data: flagRow } = await supabase
      .from("app_settings").select("value").eq("key", "kennel_capi_enabled").maybeSingle();
    const enabled = (flagRow as any)?.value === true || (flagRow as any)?.value === "true";
    if (!enabled && !body.test_mode) {
      return new Response(JSON.stringify({ ok: false, disabled: true, event_id: eventId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const value = await computeValue(supabase, body.tier_id);
    const [lead, reg] = await Promise.all([
      sendMetaEvent("Lead", body, value.lead_value_usd, value.predicted_ltv_usd, eventId),
      sendMetaEvent("CompleteRegistration", body, value.lead_value_usd, value.predicted_ltv_usd, eventId),
    ]);

    return new Response(JSON.stringify({
      ok: true,
      event_id: eventId,
      value,
      results: { lead, registration: reg },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("meta-capi-lead error", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});