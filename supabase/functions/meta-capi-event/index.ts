// Generic Meta CAPI lifecycle event sender.
//
// Public-facing wrapper around `_shared/metaCapiEvent.ts` for the browser to
// fire arbitrary lifecycle events (Subscribe, custom events, etc.) without
// having to know how to talk to Meta directly.
//
// Auth: requires a logged-in user JWT (or the kennel ingest secret for
// backfills/tests). Client IP + user agent are pulled from the request so
// CAPI match quality stays high.
//
// Special handling: when event_name === "Subscribe" and a tier_id is
// provided, the function computes the tier's annual value (price_cents * 12 / freq)
// and uses it for Meta's value parameter so Subscribe optimization works.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendCapiEvent } from "../_shared/metaCapiEvent.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kennel-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  event_name: string;
  event_id: string;
  value_cents?: number;
  currency?: string;
  tier_id?: string | null;
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
  user_agent?: string | null;
  test_mode?: boolean;
  test_event_code?: string | null;
  custom_data?: Record<string, unknown>;
}

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: ingest secret OR logged-in user
  const ingestSecret = req.headers.get("x-kennel-ingest-secret");
  const expectedSecret = Deno.env.get("KENNEL_INGEST_SECRET");
  const ingestOk = !!expectedSecret && ingestSecret === expectedSecret;
  if (!ingestOk) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return j({ error: "unauthorized" }, 401);
    const { data } = await admin.auth.getUser(jwt);
    if (!data?.user) return j({ error: "unauthorized" }, 401);
  }

  let body: Body;
  try { body = await req.json(); } catch { return j({ error: "invalid json" }, 400); }
  if (!body.event_name || !body.event_id) return j({ error: "event_name + event_id required" }, 400);

  // Compute Subscribe value from tier annual price when missing
  let valueCents = body.value_cents ?? 0;
  if (body.event_name === "Subscribe" && !body.value_cents && body.tier_id) {
    try {
      const { data: tier } = await admin
        .from("wine_club_tiers")
        .select("price_cents, frequency")
        .eq("id", body.tier_id).maybeSingle();
      if (tier?.price_cents) {
        const freq = String(tier.frequency || "monthly").toLowerCase();
        const multiplier = freq.startsWith("quarter") ? 4 : freq.startsWith("annual") ? 1 : 12;
        valueCents = Math.round(Number(tier.price_cents) * multiplier);
      }
    } catch { /* keep 0 */ }
  }

  const clientIp =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;

  const result = await sendCapiEvent({
    eventName: body.event_name,
    eventId: body.event_id,
    valueCents,
    currency: body.currency ?? "USD",
    email: body.email ?? null,
    phone: body.phone ?? null,
    firstName: body.first_name ?? null,
    lastName: body.last_name ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    zip: body.zip ?? null,
    country: body.country ?? "us",
    fbc: body.fbc ?? null,
    fbp: body.fbp ?? null,
    clientIp,
    userAgent: body.user_agent ?? req.headers.get("user-agent") ?? null,
    testMode: !!body.test_mode,
    testEventCode: body.test_event_code ?? null,
    customData: body.custom_data ?? {},
  });

  return j({ ok: result.ok, skipped: result.skipped ?? false, error: result.error ?? null });
});
