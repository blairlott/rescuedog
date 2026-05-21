// Admin approves a pending referral_rewards row.
// Replaces the previous direct-UPDATE flow so that approval *actually* awards
// loyalty points to both the referrer and the referred customer
// (and tags both in Mailchimp).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { syncMailchimpMember } from '../_shared/mailchimpMember.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function awardPoints(userId: string, points: number, referralId: string, role: 'referrer' | 'referred') {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/award-loyalty-points`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': SERVICE_KEY,
    },
    body: JSON.stringify({
      user_id: userId,
      delta_points: points,
      event_type: 'earn_referral',
      reason: `Referral reward (${role})`,
      order_id: `referral_${referralId}_${role}`,
      metadata: { referral_id: referralId, role },
    }),
  });
  if (!res.ok) {
    return { ok: false, error: (await res.text()).slice(0, 300) };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return j({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return j({ error: 'unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return j({ error: 'unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: isAdmin } = await admin.rpc('is_admin_or_owner', { _user_id: userData.user.id });
  if (!isAdmin) return j({ error: 'forbidden' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return j({ error: 'invalid json' }, 400); }
  const referralId = String(body.referral_id ?? '');
  const action = String(body.action ?? 'approve');
  const points = Number(body.points ?? 100);
  if (!referralId) return j({ error: 'referral_id required' }, 400);

  const { data: referral, error: fetchErr } = await admin
    .from('referral_rewards').select('*').eq('id', referralId).maybeSingle();
  if (fetchErr || !referral) return j({ error: 'referral not found' }, 404);
  if (referral.status !== 'pending') return j({ error: `already ${referral.status}` }, 409);

  if (action === 'reject') {
    await admin.from('referral_rewards')
      .update({ status: 'rejected', approved_by: userData.user.id, approved_at: new Date().toISOString() })
      .eq('id', referralId);
    return j({ ok: true, status: 'rejected' });
  }

  if (!Number.isFinite(points) || points < 0 || points > 5000) {
    return j({ error: 'invalid points (0-5000)' }, 400);
  }

  // Award both sides (idempotent via order_id).
  const a = await awardPoints(referral.referrer_id, points, referralId, 'referrer');
  const b = await awardPoints(referral.referred_id, points, referralId, 'referred');

  await admin.from('referral_rewards').update({
    status: 'approved',
    referrer_points: points,
    referred_points: points,
    approved_at: new Date().toISOString(),
    approved_by: userData.user.id,
    admin_note: [a.ok ? null : `referrer: ${a.error}`, b.ok ? null : `referred: ${b.error}`].filter(Boolean).join(' | ') || referral.admin_note,
  }).eq('id', referralId);

  // Mailchimp tags (best-effort, lookup emails).
  try {
    const { data: refProfile } = await admin.from('profiles').select('email, full_name').eq('id', referral.referrer_id).maybeSingle();
    if (refProfile?.email) {
      const [f, ...r] = (refProfile.full_name ?? '').split(' ');
      await syncMailchimpMember({
        email: refProfile.email, userId: referral.referrer_id,
        eventType: 'referral_approved_referrer',
        tagsAdded: ['referrer_active'], firstName: f || null, lastName: r.join(' ') || null,
      });
    }
    const referredEmail = referral.referred_email
      ?? (await admin.from('profiles').select('email').eq('id', referral.referred_id).maybeSingle()).data?.email;
    if (referredEmail) {
      await syncMailchimpMember({
        email: referredEmail, userId: referral.referred_id,
        eventType: 'referral_approved_referred',
        tagsAdded: ['referral_completed'],
      });
    }
  } catch (e) {
    console.error('referral mailchimp tag failed (non-fatal)', e);
  }

  return j({ ok: true, status: 'approved', points, referrer_award: a, referred_award: b });
});