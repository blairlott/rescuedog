/**
 * Server-side conversion forwarder for completed Vinoshipper orders.
 *
 * Fans a single purchase event out to:
 *  - GA4 Measurement Protocol (event: purchase)
 *  - Meta Conversions API   (event: Purchase)
 *
 * Uses the `_fbc` (Meta) and `gclaw` (Google Ads) attribution cookies that
 * the browser captured at landing. We persist those onto the order at
 * checkout-handoff time (VinoshipperCheckoutModal already collects them).
 *
 * All four credentials are optional — if any are missing, the matching
 * destination is silently skipped so this is safe to deploy before secrets
 * are configured.
 *
 * Required secrets (set via Lovable Cloud secrets):
 *   GA4_MEASUREMENT_ID    e.g. G-9WXP6SS770
 *   GA4_API_SECRET        from GA4 Admin → Data Streams → Measurement Protocol
 *   META_PIXEL_ID         numeric pixel id
 *   META_CAPI_TOKEN       from Meta Events Manager → Settings → CAPI
 */

export interface ConversionInput {
  orderId: string;          // Vinoshipper order id (used as event_id for dedup with browser pixel)
  valueCents: number;       // Order subtotal (cents)
  currency?: string;        // Default USD
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;  // ISO-3166-1 alpha-2, default US
  // Attribution
  fbc?: string | null;      // _fbc cookie value
  fbp?: string | null;      // _fbp cookie value
  gclid?: string | null;    // raw gclid (from gclaw cookie)
  clientIp?: string | null;
  userAgent?: string | null;
  // Optional GA4 client_id (anonymous browser id). If absent we synthesize.
  ga4ClientId?: string | null;
  // Debug routing — when true, GA4 uses /debug/mp/collect + debug_mode:true,
  // and Meta receives a test_event_code so events appear in Test Events only.
  debug?: boolean;
  metaTestEventCode?: string | null;
  // A/B test attribution (set by webhook from ab_checkout_intents lookup).
  siteVariant?: string | null;   // "lovable" | "legacy"
  abTest?: string | null;        // e.g. "rdw_replatform_v1"
}

async function sha256Lower(input: string | null | undefined): Promise<string | undefined> {
  if (!input) return undefined;
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendGa4(input: ConversionInput): Promise<{ ok: boolean; skipped?: boolean; error?: string; debug?: any }> {
  const measurementId = Deno.env.get("GA4_MEASUREMENT_ID");
  const apiSecret = Deno.env.get("GA4_API_SECRET");
  if (!measurementId || !apiSecret) return { ok: true, skipped: true };

  // GA4 requires a stable client_id. Fallback: derive from order id so dedupe still works.
  const clientId = input.ga4ClientId || `vs.${input.orderId}`;

  const base = input.debug
    ? "https://www.google-analytics.com/debug/mp/collect"
    : "https://www.google-analytics.com/mp/collect";
  const url = `${base}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const body = {
    client_id: clientId,
    non_personalized_ads: false,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: input.orderId,
          value: (input.valueCents / 100),
          currency: input.currency || "USD",
          ...(input.debug ? { debug_mode: true } : {}),
          ...(input.gclid ? { gclid: input.gclid } : {}),
          ...(input.siteVariant ? { site_variant: input.siteVariant } : {}),
          ...(input.abTest ? { ab_test: input.abTest } : {}),
        },
      },
    ],
  };

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (input.debug) {
      // Debug endpoint returns validation messages in the body
      const text = await r.text().catch(() => "");
      let parsed: any = text;
      try { parsed = JSON.parse(text); } catch { /* keep text */ }
      if (!r.ok) return { ok: false, error: `GA4 ${r.status}`, debug: parsed };
      return { ok: true, debug: parsed };
    }
    if (!r.ok) return { ok: false, error: `GA4 ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `GA4 ${String(e)}` };
  }
}

async function sendMetaCapi(input: ConversionInput): Promise<{ ok: boolean; skipped?: boolean; error?: string; debug?: any }> {
  const pixelId = Deno.env.get("META_PIXEL_ID");
  const token = Deno.env.get("META_CAPI_TOKEN");
  if (!pixelId || !token) return { ok: true, skipped: true };

  const [em, ph, fn, ln, ct, st, zp, country] = await Promise.all([
    sha256Lower(input.email),
    sha256Lower(input.phone?.replace(/\D/g, "")),
    sha256Lower(input.firstName),
    sha256Lower(input.lastName),
    sha256Lower(input.city),
    sha256Lower(input.state),
    sha256Lower(input.zip),
    sha256Lower(input.country || "us"),
  ]);

  const userData: Record<string, unknown> = {};
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (fn) userData.fn = [fn];
  if (ln) userData.ln = [ln];
  if (ct) userData.ct = [ct];
  if (st) userData.st = [st];
  if (zp) userData.zp = [zp];
  if (country) userData.country = [country];
  if (input.fbc) userData.fbc = input.fbc;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.userAgent) userData.client_user_agent = input.userAgent;

  const testCode = input.debug
    ? (input.metaTestEventCode || Deno.env.get("META_TEST_EVENT_CODE") || "TEST12345")
    : null;
  const body: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: input.orderId, // dedupe with browser pixel
        action_source: "website",
        event_source_url: `${(Deno.env.get("PUBLIC_SITE_URL") ?? "https://shopify-buddy-b2b.lovable.app")}/thank-you`,
        user_data: userData,
        custom_data: {
          currency: input.currency || "USD",
          value: (input.valueCents / 100),
          order_id: input.orderId,
        },
      },
    ],
    ...(testCode ? { test_event_code: testCode } : {}),
  };

  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const t = await r.text().catch(() => "");
    let parsed: any = t;
    try { parsed = JSON.parse(t); } catch { /* keep text */ }
    if (!r.ok) {
      return { ok: false, error: `Meta ${r.status} ${t.slice(0, 200)}`, debug: input.debug ? parsed : undefined };
    }
    return { ok: true, debug: input.debug ? { ...parsed, test_event_code: testCode } : undefined };
  } catch (e) {
    return { ok: false, error: `Meta ${String(e)}` };
  }
}

export async function forwardPurchaseConversion(input: ConversionInput): Promise<{
  ga4: { ok: boolean; skipped?: boolean; error?: string; debug?: any };
  meta: { ok: boolean; skipped?: boolean; error?: string; debug?: any };
}> {
  const [ga4, meta] = await Promise.all([sendGa4(input), sendMetaCapi(input)]);
  return { ga4, meta };
}