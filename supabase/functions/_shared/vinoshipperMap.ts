// Shared mapping + CAPI helpers used by vinoshipper-poll and vinoshipper-backfill-by-id.
// Pure mechanical extraction — no behavior change vs the original in vinoshipper-poll.

export const STATIC_CLUB_LTV_CENTS = 40000; // $400 — replace with real LTV once vs_transactions has 30+ days fresh data
const DEFAULT_MULTIPLIER = 1.0;

/** Coerce a value to number-or-null. Drops objects, strings, etc. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** First truthy numeric from a list of candidates. */
export function pickNum(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    const n = num(c);
    if (n !== null) return n;
  }
  return null;
}

/** Look up multiplier table once per poll run; key by 2-letter upper state. */
export async function loadStateMultipliers(admin: any): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const { data } = await admin.from("state_margin_tiers").select("state_code, multiplier");
    for (const r of data ?? []) {
      const code = String(r.state_code || "").toUpperCase();
      const m = Number(r.multiplier);
      if (code && Number.isFinite(m) && m > 0) map.set(code, m);
    }
  } catch (e) {
    console.error("[vs-map] state_margin_tiers lookup failed", e);
  }
  return map;
}

export function resolveMultiplier(map: Map<string, number>, state: string | null | undefined): number {
  if (!state) return DEFAULT_MULTIPLIER;
  return map.get(String(state).trim().toUpperCase().slice(0, 2)) ?? DEFAULT_MULTIPLIER;
}

async function sha256Hex(s: string | null | undefined): Promise<string | null> {
  if (!s) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s).trim().toLowerCase()));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Map a Vinoshipper order JSON into a vs_transactions row. */
export function mapOrder(o: any): Record<string, unknown> {
  const cust = o.customer ?? {};
  // VS schema: shipToAddress is a flat address object (street1/city/state/zip
  // directly on the object). Older code expected a nested .address — keep that
  // as a fallback for safety.
  const shipAddr = o.shipToAddress ?? o.shipTo?.address ?? cust.address ?? {};
  const billAddr = cust.address ?? shipAddr;
  const club = o.club ?? o.subscription ?? null;
  const isClub = !!club || /club|member/i.test(String(o.cartType ?? o.orderType ?? ""));

  return {
    invoice: String(o.orderNumber ?? o.id ?? o.orderId ?? o.invoice),
    transaction_date: o.purchasedAt ? new Date(o.purchasedAt).toISOString().slice(0, 10) : null,
    transaction_type: o.cartType ?? o.orderType ?? null,
    ship_date: o.shippedAt ? new Date(o.shippedAt).toISOString().slice(0, 10) : null,
    requested_ship_date: o.requestedShipDate ? new Date(o.requestedShipDate).toISOString().slice(0, 10) : null,
    store: o.store ?? null,
    delivery_type: o.deliveryType ?? o.device ?? null,
    inventory_location: o.inventoryLocation ?? null,
    tracking: o.tracking ?? null,
    payment_type: o.paymentType ?? null,
    club: club?.name ?? club?.clubName ?? null,
    release: club?.release ?? null,
    order_type: o.orderType ?? o.cartType ?? null,
    referrer: o.referrerUrl ?? o.referrer ?? null,
    discount_code: o.discountCode ?? null,
    customer_first_name: cust.firstName ?? null,
    customer_last_name: cust.lastName ?? null,
    customer_email: cust.email ?? null,
    customer_phone: cust.phone ?? null,
    customer_id: cust.id ? String(cust.id) : null,
    active_club_member: isClub,
    business_name: cust.businessName ?? null,
    customer_street: billAddr.street1 ?? billAddr.address1 ?? billAddr.street ?? null,
    customer_city: billAddr.city ?? null,
    customer_state: billAddr.state ?? billAddr.stateCode ?? null,
    customer_zip: billAddr.zip ?? billAddr.postalCode ?? null,
    ship_to_first_name: shipAddr.firstName ?? o.shipTo?.firstName ?? cust.firstName ?? null,
    ship_to_last_name: shipAddr.lastName ?? o.shipTo?.lastName ?? cust.lastName ?? null,
    ship_to_street: shipAddr.street1 ?? shipAddr.address1 ?? shipAddr.street ?? null,
    ship_to_city: shipAddr.city ?? null,
    ship_to_state: shipAddr.state ?? shipAddr.stateCode ?? null,
    ship_to_zip: shipAddr.zip ?? shipAddr.postalCode ?? null,
    bottles: num(o.bottles),
    gross_value: pickNum(o.grossValue, o.subtotal, o.subTotal),
    discount: pickNum(o.discount, o.discountTotal),
    shipping_to_customer: pickNum(o.shippingTotal, o.shippingCost, o.shipping?.total, o.shipping?.cost),
    order_total: pickNum(o.saleAmount, o.orderTotal, o.total, o.grandTotal),
    chain_status: o.orderStatus ?? o.chainStatus ?? o.status ?? null,
    raw: o,
  };
}

/** Best-effort insert into meta_capi_events with weighting metadata. */
export async function logCapiEvent(admin: any, row: {
  orderId: string;
  eventName: string;
  eventId: string;
  weightedValueCents: number;
  rawValueCents: number;
  multiplier: number;
  state: string | null;
  email: string | null;
  ok: boolean;
  error?: string | null;
  testMode: boolean;
}) {
  try {
    const emailHash = await sha256Hex(row.email);
    await admin.from("meta_capi_events").insert({
      order_id: row.orderId,
      event_name: row.eventName,
      event_id: row.eventId,
      value_cents: row.weightedValueCents,
      raw_value_cents: row.rawValueCents,
      multiplier: row.multiplier,
      state: row.state ? String(row.state).toUpperCase().slice(0, 2) : null,
      currency: "USD",
      test_mode: row.testMode,
      email_hash: emailHash,
      success: row.ok,
      error: row.error ?? null,
    });
  } catch (e) {
    // unique-on-(order_id) where test_mode=false AND success=true is expected for replays
    console.warn("[vs-map] capi log insert", String(e).slice(0, 200));
  }
}

/** Send a Meta CAPI Subscribe event for a wine club signup with projected LTV. */
export async function sendMetaSubscribe(input: {
  orderId: string;
  valueCents: number;
  email?: string | null;
  phone?: string | null;
  state?: string | null;
  zip?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const pixelId = Deno.env.get("META_PIXEL_ID");
  const token = Deno.env.get("META_CAPI_TOKEN");
  if (!pixelId || !token) return { ok: true };

  const sha = async (s: string | null | undefined) => {
    if (!s) return undefined;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.trim().toLowerCase()));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  const [em, ph, st, zp] = await Promise.all([
    sha(input.email), sha(input.phone?.replace(/\D/g, "")), sha(input.state), sha(input.zip),
  ]);
  const userData: Record<string, unknown> = {};
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (st) userData.st = [st];
  if (zp) userData.zp = [zp];
  userData.country = [await sha("us")];

  const body = {
    data: [{
      event_name: "Subscribe",
      event_time: Math.floor(Date.now() / 1000),
      event_id: `sub-${input.orderId}`,
      action_source: "website",
      user_data: userData,
      custom_data: {
        currency: "USD",
        value: input.valueCents / 100,
        predicted_ltv: input.valueCents / 100,
        order_id: input.orderId,
      },
    }],
  };
  try {
    const r = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (!r.ok) return { ok: false, error: `Meta Subscribe ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}