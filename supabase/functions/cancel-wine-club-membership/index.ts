import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VS_KEY_ID = Deno.env.get('VINOSHIPPER_API_KEY_ID') ?? '';
const VS_SECRET = Deno.env.get('VINOSHIPPER_API_SECRET') ?? '';
const VS_LIVE = (Deno.env.get('VS_LIVE_MODE') ?? 'false').toLowerCase() === 'true';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function callVinoshipperUnsubscribe(customerId: string, membershipId: string) {
  if (!VS_KEY_ID || !VS_SECRET) {
    return { ok: false, status: 0, body: 'Vinoshipper credentials not configured' };
  }
  const url = `https://vinoshipper.com/api/v3/p/customers/${customerId}/memberships/${membershipId}`;
  const auth = 'Basic ' + btoa(`${VS_KEY_ID}:${VS_SECRET}`);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({}), // MembershipDeactivatedByForm — no team-member id for self-serve
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'auth required' }, 401);

  // Auth-bound client to identify the caller
  const authClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'invalid session' }, 401);
  const userId = userData.user.id;

  let body: { membership_id?: string; reason?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const reason = (body.reason ?? '').toString().slice(0, 500);

  // Service-role client for the actual mutation (needed because we also call out to VS)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Find the caller's active membership (or the one they referenced)
  let query = admin.from('wine_club_memberships').select('*').eq('user_id', userId);
  if (body.membership_id) query = query.eq('id', body.membership_id);
  const { data: memberships, error: mErr } = await query.order('created_at', { ascending: false }).limit(1);
  if (mErr) return json({ error: mErr.message }, 500);
  const membership = memberships?.[0];
  if (!membership) return json({ error: 'no membership found' }, 404);

  if (membership.status === 'inactive' || membership.cancelled_at) {
    return json({ ok: true, already_cancelled: true });
  }

  // Call Vinoshipper if we have IDs + live mode
  let vsResult: { ok: boolean; status: number; body: string } | null = null;
  if (
    VS_LIVE &&
    membership.vinoshipper_customer_id &&
    membership.vinoshipper_membership_id
  ) {
    vsResult = await callVinoshipperUnsubscribe(
      String(membership.vinoshipper_customer_id),
      String(membership.vinoshipper_membership_id),
    );
    // If VS returns 404 we treat it as "already gone" and proceed.
    if (!vsResult.ok && vsResult.status !== 404) {
      console.error('Vinoshipper cancel failed', vsResult);
      return json({
        error: 'Vinoshipper cancellation failed',
        vinoshipper_status: vsResult.status,
        vinoshipper_body: vsResult.body,
      }, 502);
    }
  }

  const { error: updErr } = await admin
    .from('wine_club_memberships')
    .update({
      status: 'inactive',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason || null,
      cancellation_source: 'self_serve',
      updated_at: new Date().toISOString(),
    })
    .eq('id', membership.id);
  if (updErr) return json({ error: updErr.message }, 500);

  return json({
    ok: true,
    vinoshipper_called: vsResult !== null,
    vinoshipper_status: vsResult?.status ?? null,
    test_mode: !VS_LIVE,
  });
});
