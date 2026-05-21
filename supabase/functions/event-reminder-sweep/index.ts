// Daily sweep: emails a 24-hour reminder to every RSVP whose event starts
// between 20h and 36h from now. Idempotent per RSVP via event_rsvp_email_log.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}
async function sendResend(to: string, subject: string, html: string) {
  if (!RESEND_KEY) return { ok: false, error: 'no_resend_key' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Rescue Dog Wines <events@rescuedogwines.com>',
      to: [to], subject, html,
    }),
  });
  if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 300) };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  const internal = req.headers.get('x-internal-key') === SERVICE_KEY;
  if (!internal) return j({ error: 'unauthorized' }, 401);

  const { data: enabled } = await admin
    .from('app_settings').select('value').eq('key', 'event_reminder_enabled').maybeSingle();
  if (enabled && (enabled.value as any) === false) return j({ skipped: true });

  const now = Date.now();
  const winStart = new Date(now + 20 * 3600_000).toISOString();
  const winEnd = new Date(now + 36 * 3600_000).toISOString();

  const { data: events } = await admin
    .from('ambassador_events')
    .select('id, title, slug, starts_at, venue_name, street_address, city, state, status')
    .eq('status', 'published')
    .gte('starts_at', winStart)
    .lte('starts_at', winEnd);

  let sent = 0, skipped = 0, failed = 0;

  for (const ev of events ?? []) {
    const { data: rsvps } = await admin
      .from('ambassador_event_rsvps')
      .select('id, name, email, party_size')
      .eq('event_id', ev.id);
    for (const r of rsvps ?? []) {
      if (!r.email) { skipped++; continue; }
      const { data: already } = await admin
        .from('event_rsvp_email_log').select('id').eq('rsvp_id', r.id).eq('kind', 'reminder').maybeSingle();
      if (already) { skipped++; continue; }
      const location = [ev.venue_name, ev.street_address, [ev.city, ev.state].filter(Boolean).join(', ')].filter(Boolean).join(' • ');
      const html = `
        <div style="font-family:'Nunito Sans',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0a0a">
          <h1 style="font-size:22px;letter-spacing:.05em;text-transform:uppercase;margin:0 0 8px">See you tomorrow.</h1>
          <p>Hi ${r.name?.split(' ')[0] || 'there'},</p>
          <p>Quick reminder — <strong>${ev.title}</strong> is tomorrow. We have you down for a party of ${r.party_size}.</p>
          <div style="border-left:3px solid #c30017;padding:12px 16px;margin:16px 0;background:#f7f7f7">
            <div><strong>When:</strong> ${fmtDate(ev.starts_at)}</div>
            ${location ? `<div><strong>Where:</strong> ${location}</div>` : ''}
          </div>
          <p>Can't make it? Just reply to this email so your host can plan.</p>
          <p style="margin-top:24px"><a href="https://rescuedog.lovable.app/e/${ev.slug}" style="color:#c30017">Event details</a></p>
        </div>`;
      const res = await sendResend(r.email, `Reminder: ${ev.title} tomorrow`, html);
      await admin.from('event_rsvp_email_log').insert({
        rsvp_id: r.id, event_id: ev.id, email: r.email,
        kind: 'reminder', success: res.ok, error: res.ok ? null : (res as any).error ?? null,
      });
      if (res.ok) sent++; else failed++;
    }
  }

  return j({ ran: true, events: events?.length ?? 0, sent, skipped, failed });
});