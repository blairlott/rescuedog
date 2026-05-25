import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { sendCapiEventSafe } from '../_shared/metaCapiEvent.ts';

// Vinoshipper webhook payload shape:
// { identifier: string, subject: 'ORDER'|'CUSTOMER'|'CLUB_MEMBERSHIP',
//   event: 'APPROVED'|'CREATED'|'UPDATED'|'CANCELLED'|'DELETED'|'CARD_DECLINED'|'TRACKING_NUMBER', ... }

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const SHARED_SECRET = Deno.env.get('VINOSHIPPER_WEBHOOK_SECRET');

async function awardShipmentLoyalty(vsOrderId: string) {
  // Kill switch
  const { data: setting } = await supabase
    .from('app_settings').select('value')
    .eq('key', 'wine_club_shipment_loyalty_enabled').maybeSingle();
  if (setting && (setting.value as any) === false) return;

  const { data: ship } = await supabase
    .from('wine_club_shipments')
    .select('id, membership_id, total_cents, membership:wine_club_memberships!membership_id(user_id)')
    .eq('vinoshipper_order_id', vsOrderId).maybeSingle();
  if (!ship?.id) return;
  const userId = (ship as any).membership?.user_id as string | undefined;
  if (!userId) return;

  // Dedup: already logged?
  const { data: existing } = await supabase
    .from('wine_club_shipment_loyalty_log').select('id').eq('shipment_id', ship.id).maybeSingle();
  if (existing) return;

  const subtotal = ship.total_cents ?? 0;
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/award-loyalty-points`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    body: JSON.stringify({
      user_id: userId,
      subtotal_cents: subtotal,
      event_type: 'earn_wine_club_shipment',
      reason: `Wine club shipment ${ship.id}`,
      order_id: ship.id,
      metadata: { source: 'vinoshipper_webhook', vs_order_id: vsOrderId },
    }),
  });
  const json = await res.json().catch(() => ({}));
  await supabase.from('wine_club_shipment_loyalty_log').insert({
    shipment_id: ship.id,
    membership_id: ship.membership_id,
    user_id: userId,
    subtotal_cents: subtotal,
    points_awarded: Math.max(0, Math.floor(subtotal / 100)),
    status: res.ok ? 'awarded' : 'error',
    error: res.ok ? null : JSON.stringify(json).slice(0, 500),
  });
}

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function applyMembershipEvent(identifier: string, event: string, payload: Record<string, unknown>) {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  switch (event) {
    case 'CREATED':
    case 'UPDATED':
      // Best-effort status mirror from payload if present
      if (typeof payload.status === 'string') updates.status = String(payload.status).toLowerCase();
      break;
    case 'CANCELLED':
    case 'DELETED':
      updates.status = 'inactive';
      updates.cancelled_at = new Date().toISOString();
      break;
    default:
      return { skipped: true };
  }

  const { error, count } = await supabase
    .from('wine_club_memberships')
    .update(updates, { count: 'exact' })
    .eq('vinoshipper_membership_id', identifier);

  if (error) throw error;
  return { matched: count ?? 0 };
}

async function applyOrderEvent(identifier: string, event: string, payload: Record<string, unknown>) {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let shouldAwardLoyalty = false;

  switch (event) {
    case 'TRACKING_NUMBER':
      if (typeof payload.tracking_number === 'string') updates.tracking_number = payload.tracking_number;
      else if (typeof payload.trackingNumber === 'string') updates.tracking_number = payload.trackingNumber;
      updates.status = 'shipped';
      shouldAwardLoyalty = true;
      break;
    case 'APPROVED':
      updates.status = 'processing';
      break;
    case 'CANCELLED':
      updates.status = 'cancelled';
      break;
    case 'CARD_DECLINED':
      updates.status = 'payment_failed';
      break;
    default:
      return { skipped: true };
  }

  const { error, count } = await supabase
    .from('wine_club_shipments')
    .update(updates, { count: 'exact' })
    .eq('vinoshipper_order_id', identifier);

  if (error) throw error;

  // Award loyalty points once per shipment when it transitions to shipped.
  if (shouldAwardLoyalty) {
    try {
      await awardShipmentLoyalty(identifier);
    } catch (e) {
      console.error('shipment loyalty award failed (non-fatal)', e);
    }
  }

  // Fire Meta CAPI PaymentDeclined lifecycle event on card decline.
  if (event === 'CARD_DECLINED') {
    try {
      const { data: ship } = await supabase
        .from('wine_club_shipments')
        .select('id, total_cents, membership:wine_club_memberships!membership_id(user_id, shipping_city, shipping_state, shipping_zip)')
        .eq('vinoshipper_order_id', identifier).maybeSingle();
      const m: any = (ship as any)?.membership;
      if (m?.user_id) {
        const { data: prof } = await supabase
          .from('profiles').select('email, full_name').eq('id', m.user_id).maybeSingle();
        const [first, ...rest] = (prof?.full_name ?? '').split(' ');
        void sendCapiEventSafe({
          eventName: 'PaymentDeclined',
          eventId: `decline_${identifier}`,
          valueCents: ship?.total_cents ?? 0,
          email: prof?.email ?? null,
          firstName: first || null,
          lastName: rest.join(' ') || null,
          city: m.shipping_city ?? null,
          state: m.shipping_state ?? null,
          zip: m.shipping_zip ?? null,
          country: 'us',
          customData: { vinoshipper_order_id: identifier, shipment_id: ship?.id ?? null },
        });
      }
    } catch (e) {
      console.error('CAPI PaymentDeclined fire failed (non-fatal)', e);
    }
  }

  return { matched: count ?? 0 };
}

// ---------------------------------------------------------------
// Subscribe & Save (S&S / auto-ship) cycle handler.
// Independent of wine_club_shipments — an order id maps to AT MOST
// one of: a wine club shipment OR an S&S cycle. Both lookups run
// every webhook; the one without a match no-ops cheaply.
// ---------------------------------------------------------------
async function applySubscriptionCycleEvent(
  vsOrderId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<{ matched: number; subscription_id?: string; cycle_id?: string }> {
  const { data: cycle } = await supabase
    .from('subscription_cycles')
    .select('id, subscription_id, retry_count')
    .eq('vs_order_id', vsOrderId)
    .maybeSingle();

  if (!cycle?.id) return { matched: 0 };

  const nowIso = new Date().toISOString();
  let cycleUpdate: Record<string, unknown> | null = null;
  let subUpdate: Record<string, unknown> | null = null;
  let eventType: string | null = null;
  let eventPayload: Record<string, unknown> = {};

  switch (event) {
    case 'APPROVED':
      cycleUpdate = { status: 'succeeded', completed_at: nowIso, error_code: null, error_message: null };
      // Caller (cron) is responsible for advancing next_ship_date when the
      // cycle is created. We just clear past_due if VS confirms approval.
      subUpdate = { status: 'active' };
      eventType = 'payment_recovered';
      break;
    case 'TRACKING_NUMBER': {
      const tracking =
        (typeof payload.tracking_number === 'string' && payload.tracking_number) ||
        (typeof payload.trackingNumber === 'string' && payload.trackingNumber) ||
        null;
      cycleUpdate = { status: 'succeeded', completed_at: nowIso };
      eventType = 'shipped';
      eventPayload = { tracking_number: tracking };
      break;
    }
    case 'CARD_DECLINED':
      cycleUpdate = {
        status: 'failed',
        error_code: 'CARD_DECLINED',
        error_message: 'Vinoshipper reported card declined',
        retry_count: (cycle.retry_count ?? 0) + 1,
        next_retry_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      };
      subUpdate = { status: 'past_due' };
      eventType = 'payment_failed';
      break;
    case 'CANCELLED':
      cycleUpdate = { status: 'failed', error_code: 'CANCELLED', error_message: 'Order cancelled by Vinoshipper' };
      eventType = 'cycle_cancelled';
      break;
    default:
      return { matched: 0, subscription_id: cycle.subscription_id };
  }

  if (cycleUpdate) {
    const { error } = await supabase
      .from('subscription_cycles')
      .update({ ...cycleUpdate, updated_at: nowIso })
      .eq('id', cycle.id);
    if (error) throw error;
  }

  if (subUpdate) {
    const { error } = await supabase
      .from('subscriptions')
      .update({ ...subUpdate, updated_at: nowIso })
      .eq('id', cycle.subscription_id);
    if (error) throw error;
  }

  if (eventType) {
    await supabase.from('subscription_events').insert({
      subscription_id: cycle.subscription_id,
      cycle_id: cycle.id,
      event_type: eventType,
      payload: { vs_order_id: vsOrderId, vs_event: event, ...eventPayload },
    });
  }

  return { matched: 1, subscription_id: cycle.subscription_id, cycle_id: cycle.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return ok({ error: 'method not allowed' }, 405);

  // Optional shared-secret check (set VINOSHIPPER_WEBHOOK_SECRET and configure on Vinoshipper side as a query param ?token=...)
  const sigHeader =
    req.headers.get('x-vinoshipper-signature') ??
    req.headers.get('x-signature') ??
    null;
  const sourceIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    null;
  let signatureValid: boolean | null = null;
  if (!SHARED_SECRET) {
    return ok({ error: 'server_misconfigured: VINOSHIPPER_WEBHOOK_SECRET not set' }, 500);
  }
  {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') ?? req.headers.get('x-webhook-token');
    signatureValid = token === SHARED_SECRET;
    if (!signatureValid) return ok({ error: 'unauthorized' }, 401);
  }

  // Read raw bytes first so we can persist them verbatim for replay/audit.
  const rawBody = await req.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); }
  catch { return ok({ error: 'invalid json' }, 400); }

  const subject = String(body.subject ?? '').toUpperCase();
  const event = String(body.event ?? '').toUpperCase();
  const identifier = body.identifier != null ? String(body.identifier) : null;

  if (!subject || !event) return ok({ error: 'missing subject/event' }, 400);

  // Log every event
  const { data: logRow, error: logErr } = await supabase
    .from('vinoshipper_webhook_events')
    .insert({
      subject,
      event,
      identifier,
      payload: body,
      raw_body: rawBody,
      signature_header: sigHeader,
      signature_valid: signatureValid,
      source_ip: sourceIp,
    })
    .select('id')
    .single();
  if (logErr) console.error('webhook log insert failed', logErr);

  let result: Record<string, unknown> = { skipped: true };
  let processingError: string | null = null;
  let relatedSubscriptionId: string | null = null;
  let relatedCycleId: string | null = null;

  try {
    if (identifier) {
      if (subject === 'CLUB_MEMBERSHIP') {
        result = await applyMembershipEvent(identifier, event, body);
      } else if (subject === 'ORDER') {
        // Run both lookups; whichever matches wins. A VS order id maps to
        // at most one of: a wine club shipment OR an S&S cycle.
        const [wineClubRes, ssRes] = await Promise.all([
          applyOrderEvent(identifier, event, body),
          applySubscriptionCycleEvent(identifier, event, body),
        ]);
        if (ssRes.matched > 0) {
          relatedSubscriptionId = ssRes.subscription_id ?? null;
          relatedCycleId = ssRes.cycle_id ?? null;
        }
        result = {
          wine_club: wineClubRes,
          subscribe_and_save: ssRes,
        };
      }
    }
  } catch (e) {
    processingError = e instanceof Error ? e.message : String(e);
    console.error('webhook processing error', processingError);
  }

  if (logRow?.id) {
    await supabase
      .from('vinoshipper_webhook_events')
      .update({
        processed: processingError == null,
        processing_error: processingError,
        processed_at: new Date().toISOString(),
        related_subscription_id: relatedSubscriptionId,
        related_cycle_id: relatedCycleId,
      })
      .eq('id', logRow.id);
  }

  return ok({ received: true, subject, event, identifier, result, error: processingError });
});
