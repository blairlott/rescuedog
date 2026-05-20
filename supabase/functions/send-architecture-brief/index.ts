import { createClient } from 'npm:@supabase/supabase-js@2'
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
import { BRIEF_MD } from './brief.ts'

const SITE_NAME = 'Rescue Dog Wines'
const SENDER_DOMAIN = 'notify.rescuedog.com'
const FROM_DOMAIN = 'notify.rescuedog.com'
const FROM = `${SITE_NAME} <noreply@${FROM_DOMAIN}>`

const DEFAULT_RECIPIENTS = [
  'default-blair.lott@lindymail.ai',
  'blair.lott@rescuedogwines.com',
]

// Minimal markdown -> HTML (headings, bold, code, lists, paragraphs, hr).
function mdToHtml(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  let inTable = false
  let inCode = false
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    if (line.startsWith('```')) {
      if (inCode) { out.push('</pre>'); inCode = false } else { out.push('<pre style="background:#f5f5f5;padding:10px;font-size:12px;overflow:auto;">'); inCode = true }
      continue
    }
    if (inCode) { out.push(esc(line)); continue }
    if (/^\s*$/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false }
      if (inTable) { out.push('</table>'); inTable = false }
      continue
    }
    if (/^---+$/.test(line)) { out.push('<hr style="border:none;border-top:1px solid #ddd;margin:24px 0;" />'); continue }
    let m: RegExpMatchArray | null
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      const lvl = m[1].length
      const sizes = [22, 20, 18, 16, 15, 14]
      out.push(`<h${lvl} style="font-family:Arial,sans-serif;color:#000;margin:24px 0 10px;font-size:${sizes[lvl-1]}px;">${inline(m[2])}</h${lvl}>`)
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul style="margin:0 0 12px 20px;font-family:Arial,sans-serif;font-size:14px;color:#333;">'); inList = true }
      out.push(`<li style="margin:4px 0;">${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`)
      continue
    }
    if (/^\|/.test(line)) {
      // crude table support — pipe rows
      const cells = line.split('|').slice(1, -1).map(c => c.trim())
      if (cells.every(c => /^:?-+:?$/.test(c))) continue // separator
      if (!inTable) { out.push('<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;margin:8px 0 16px;">'); inTable = true }
      const tag = inTable && out[out.length-1].includes('<table') ? 'th' : 'td'
      out.push('<tr>' + cells.map(c => `<${tag} style="border:1px solid #ddd;padding:6px 10px;text-align:left;">${inline(c)}</${tag}>`).join('') + '</tr>')
      continue
    }
    if (inList) { out.push('</ul>'); inList = false }
    if (inTable) { out.push('</table>'); inTable = false }
    out.push(`<p style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.55;margin:0 0 12px;">${inline(line)}</p>`)
  }
  if (inList) out.push('</ul>')
  if (inTable) out.push('</table>')
  if (inCode) out.push('</pre>')

  function inline(s: string): string {
    let t = esc(s)
    t = t.replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 5px;font-size:13px;">$1</code>')
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#c30017;">$1</a>')
    return t
  }

  return `<!doctype html><html><body style="background:#ffffff;margin:0;padding:24px;">
    <div style="max-width:720px;margin:0 auto;">${out.join('\n')}</div>
  </body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Auth: require admin/owner
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    const { data: userData } = await supabase.auth.getUser(token)
    const userId = userData?.user?.id
    if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { data: isAdmin } = await supabase.rpc('is_admin_or_owner', { _user_id: userId })
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const body = await req.json().catch(() => ({}))
    const recipients: string[] = Array.isArray(body.recipients) && body.recipients.length
      ? body.recipients : DEFAULT_RECIPIENTS
    const subject: string = body.subject || 'Rescue Dog Wines — Architecture & Functionality Brief (Pre-QA)'

    const md = BRIEF_MD
    const html = mdToHtml(md)
    const text = md

    const runId = crypto.randomUUID().slice(0, 8)
    const results: Array<{ to: string; ok: boolean; error?: string }> = []

    for (const to of recipients) {
      const messageId = crypto.randomUUID()
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'architecture-brief',
        recipient_email: to,
        status: 'pending',
      })
      const { error } = await supabase.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          run_id: runId,
          message_id: messageId,
          to,
          from: FROM,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text,
          purpose: 'transactional',
          label: 'architecture-brief',
          queued_at: new Date().toISOString(),
        },
      })
      results.push({ to, ok: !error, error: error?.message })
    }

    return new Response(JSON.stringify({ success: true, runId, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})