// Daily re-engagement sweep.
// Scans customer_cohorts for at_risk / lost / one_time segments, applies Mailchimp
// lifecycle tags so Mailchimp automations can fire winback emails.
// Throttle: 30 days per (email, tag) using reengagement_log.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { syncMailchimpMember } from '../_shared/mailchimpMember.ts';
import { isNotificationEnabled } from '../_shared/devToggles.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const TAG_BY_SEGMENT: Record<string, string> = {
  at_risk: 'reengage_at_risk',
  lost: 'reengage_lost',
  one_time: 'reengage_one_time',
};

const THROTTLE_DAYS = 30;
const MAX_PER_RUN = 500;

function ok(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  const internal = req.headers.get('x-internal-key') === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!internal) return ok({ error: 'unauthorized' }, 401);

  const { data: setting } = await supabase
    .from('app_settings').select('value').eq('key', 'reengagement_sweep_enabled').maybeSingle();
  if (setting && (setting.value as any) === false) return ok({ skipped: true, reason: 'disabled' });

  // Dev-toggle gate (CMS Settings → Dev Controls → Customer Notifications → Win-back)
  if (!(await isNotificationEnabled('winback'))) {
    return ok({ skipped: true, reason: 'dev_toggle_off' });
  }

  const segments = Object.keys(TAG_BY_SEGMENT);
  const { data: rows, error } = await supabase
    .from('customer_cohorts')
    .select('user_id, customer_email, segment, lifetime_revenue_cents, days_since_last_order')
    .in('segment', segments)
    .not('customer_email', 'is', null)
    .order('lifetime_revenue_cents', { ascending: false })
    .limit(MAX_PER_RUN);
  if (error) return ok({ error: error.message }, 500);

  const cutoff = new Date(Date.now() - THROTTLE_DAYS * 86400_000).toISOString();
  let tagged = 0; let skipped = 0; let failed = 0;

  for (const r of rows ?? []) {
    const email = r.customer_email as string;
    const segment = r.segment as string;
    const tag = TAG_BY_SEGMENT[segment];
    if (!email || !tag) { skipped++; continue; }

    const { data: recent } = await supabase
      .from('reengagement_log').select('id')
      .eq('customer_email', email).eq('tag', tag)
      .gte('created_at', cutoff).limit(1).maybeSingle();
    if (recent) { skipped++; continue; }

    const res = await syncMailchimpMember({
      email,
      userId: (r.user_id as string) ?? null,
      eventType: `reengagement_${segment}`,
      tagsAdded: [tag],
      mergeFields: {
        REENGSEG: segment,
        REENGDSL: r.days_since_last_order ?? null,
      },
    });

    await supabase.from('reengagement_log').insert({
      user_id: (r.user_id as string) ?? null,
      customer_email: email,
      segment,
      tag,
      success: res.ok,
      error: res.error ?? null,
    });

    if (res.ok) tagged++; else failed++;
  }

  return ok({ ran: true, candidates: rows?.length ?? 0, tagged, skipped, failed });
});