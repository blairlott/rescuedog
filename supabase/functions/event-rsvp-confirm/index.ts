// Sends an RSVP confirmation email when someone signs up for a tasting event.
// Called from AmbassadorEventPublicPage immediately after the RSVP row is inserted.
// Idempotent per rsvp_id via event_rsvp_email_log UNIQUE (rsvp_id, kind).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

async function sendResend(to: string, subject: string, html: string) {
  if (!RESEND_KEY) return { ok: false, error: 'no_resend_key' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Rescue Dog Wines <events@rescuedogwines.com>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 300) };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return j({ error: 'method not allowed' }, 405);

  const { data: setting } = await admin
    .from('app_settings').select('value').eq('key', 'event_rsvp_confirmation_enabled').maybeSingle();
  if (setting && (setting.value as any) === false) return j({ skipped: true, reason: 'disabled' });

  let body: any;
  try { body = await req.json(); } catch { return j({ error: 'invalid json' }, 400); }
  const rsvpId = String(body.rsvp_id ?? '');
  if (!rsvpId) return j({ error: 'rsvp_id required' }, 400);

  const { data: rsvp } = await admin
    .from('ambassador_event_rsvps')
    .select('id, name, email, party_size, event:ambassador_events!event_id(id, title, slug, starts_at, venue_name, city, state, street_address, host_user_id)')
    .eq('id', rsvpId).maybeSingle();
  if (!rsvp || !rsvp.email) return j({ error: 'rsvp not found' }, 404);

  const ev: any = (rsvp as any).event;
  if (!ev) return j({ error: 'event not found' }, 404);

  // Dedup
  const { data: existing } = await admin
    .from('event_rsvp_email_log').select('id').eq('rsvp_id', rsvpId).eq('kind', 'confirmation').maybeSingle();
  if (existing) return j({ skipped: true, reason: 'already_sent' });

  const location = [ev.venue_name, ev.street_address, [ev.city, ev.state].filter(Boolean).join(', ')].filter(Boolean).join(' • ');
  const html = `
    <div style="font-family:'Nunito Sans',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0a0a">
      <h1 style="font-size:22px;letter-spacing:.05em;text-transform:uppercase;margin:0 0 8px">You're in.</h1>
      <p>Hi ${rsvp.name?.split(' ')[0] || 'there'},</p>
      <p>Your RSVP for <strong>${ev.title}</strong> is confirmed (party of ${rsvp.party_size}).</p>
      <div style="border-left:3px solid #c30017;padding:12px 16px;margin:16px 0;background:#f7f7f7">
        <div><strong>When:</strong> ${fmtDate(ev.starts_at)}</div>
        ${location ? `<div><strong>Where:</strong> ${location}</div>` : ''}
      </div>
      <p>Bring a friend or two — every bottle poured supports rescue dogs finding their forever home.</p>
      <p style="margin-top:24px"><a href="https://rescuedog.lovable.app/e/${ev.slug}" style="color:#c30017">View event details</a></p>
      <p style="font-size:12px;color:#666;margin-top:24px">You're 21+ and agreed to follow your host's guidance at the event. If anything changes, just reply to this email.</p>
    </div>`;

  const res = await sendResend(rsvp.email, `Confirmed: ${ev.title}`, html);
  await admin.from('event_rsvp_email_log').insert({
    rsvp_id: rsvpId, event_id: ev.id, email: rsvp.email,
    kind: 'confirmation', success: res.ok, error: res.ok ? null : (res as any).error ?? null,
  });

  return j({ ok: res.ok });
});