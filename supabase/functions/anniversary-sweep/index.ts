// Daily wine club anniversary sweep.
// Finds active memberships whose joined_at month-day equals today,
// awards bonus loyalty points (anniversary_bonus_points_per_year x years),
// tags subscriber in Mailchimp so the anniversary email automation fires.
// Idempotent per (membership_id, anniversary_year).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { syncMailchimpMember } from '../_shared/mailchimpMember.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function ok(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  const internal = req.headers.get('x-internal-key') === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!internal) return ok({ error: 'unauthorized' }, 401);

  const { data: enabled } = await supabase
    .from('app_settings').select('value').eq('key', 'anniversary_sweep_enabled').maybeSingle();
  if (enabled && (enabled.value as any) === false) return ok({ skipped: true, reason: 'disabled' });

  const { data: bonusSetting } = await supabase
    .from('app_settings').select('value').eq('key', 'anniversary_bonus_points_per_year').maybeSingle();
  const bonusPerYear = Number((bonusSetting?.value as any) ?? 100);

  const today = new Date();
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  const yyyy = today.getUTCFullYear();
  const todayMd = `${mm}-${dd}`;

  // Pull active memberships and filter month-day in JS (small enough set).
  const { data: memberships, error } = await supabase
    .from('wine_club_memberships')
    .select('id, user_id, joined_at, status')
    .eq('status', 'active')
    .not('joined_at', 'is', null);
  if (error) return ok({ error: error.message }, 500);

  const due = (memberships ?? []).filter((m) => {
    if (!m.joined_at) return false;
    const d = new Date(m.joined_at as string);
    const mmJoin = String(d.getUTCMonth() + 1).padStart(2, '0');
    const ddJoin = String(d.getUTCDate()).padStart(2, '0');
    if (`${mmJoin}-${ddJoin}` !== todayMd) return false;
    return d.getUTCFullYear() < yyyy;
  });

  let awarded = 0; let skipped = 0; let failed = 0;

  for (const m of due) {
    const years = yyyy - new Date(m.joined_at as string).getUTCFullYear();
    const userId = m.user_id as string;

    // Idempotency
    const { data: existing } = await supabase
      .from('wine_club_anniversary_log')
      .select('id').eq('membership_id', m.id).eq('anniversary_year', yyyy).maybeSingle();
    if (existing) { skipped++; continue; }

    const { data: profile } = await supabase
      .from('profiles').select('email, full_name').eq('id', userId).maybeSingle();
    const email = profile?.email ?? null;

    // Award points
    const bonus = Math.max(0, bonusPerYear * years);
    let ok1 = true; let err1: string | null = null;
    if (bonus > 0) {
      try {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/award-loyalty-points`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-key': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          },
          body: JSON.stringify({
            user_id: userId,
            delta_points: bonus,
            event_type: 'earn_anniversary',
            reason: `Wine club ${years}-year anniversary`,
            order_id: `anniv_${m.id}_${yyyy}`,
            metadata: { membership_id: m.id, years, anniversary_year: yyyy },
          }),
        });
        if (!res.ok) {
          ok1 = false;
          err1 = (await res.text()).slice(0, 300);
        }
      } catch (e) {
        ok1 = false; err1 = (e as Error).message;
      }
    }

    // Mailchimp tag
    if (email) {
      const [first, ...rest] = (profile?.full_name ?? '').split(' ');
      await syncMailchimpMember({
        email,
        userId,
        eventType: 'wine_club_anniversary',
        tagsAdded: ['wc_anniversary_today', `wc_anniv_${years}yr`],
        firstName: first || null,
        lastName: rest.join(' ') || null,
        mergeFields: { WCANNIV: years, WCANNYR: yyyy },
      });
    }

    await supabase.from('wine_club_anniversary_log').insert({
      membership_id: m.id,
      user_id: userId,
      customer_email: email,
      anniversary_year: yyyy,
      years_with_club: years,
      bonus_points: bonus,
      success: ok1,
      error: err1,
    });

    if (ok1) awarded++; else failed++;
  }

  return ok({ ran: true, due: due.length, awarded, skipped, failed });
});