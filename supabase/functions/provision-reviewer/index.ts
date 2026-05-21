import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'

const SITE_NAME = 'Rescue Dog Wines'
const SENDER_DOMAIN = 'notify.partner.rescuedog.com'
const FROM_DOMAIN = 'partner.rescuedog.com'

// One-off provisioning function: creates a reviewer account, grants admin,
// and emails the credentials to the reviewer + a CC copy to Blair.
// Auth: service role only (verify_jwt = true; caller must present service_role JWT).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generatePassword(): string {
  // 24 chars, base64url, no ambiguous symbols
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, 'A').replace(/\//g, 'B').replace(/=/g, '')
}

function genToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function enqueueReviewerEmail(
  admin: ReturnType<typeof createClient>,
  to: string,
  templateData: Record<string, any>,
  idempotencyKey: string,
) {
  const tpl = TEMPLATES['reviewer-invite']
  if (!tpl) throw new Error('reviewer-invite template missing from registry')

  const messageId = crypto.randomUUID()
  const normalized = to.toLowerCase()

  // Make sure not suppressed
  await admin.from('suppressed_emails').delete().eq('email', normalized)

  // Ensure unsubscribe token
  let token = genToken()
  const { data: existing } = await admin.from('email_unsubscribe_tokens')
    .select('token, used_at').eq('email', normalized).maybeSingle()
  if (existing && !existing.used_at) {
    token = existing.token as string
  } else {
    await admin.from('email_unsubscribe_tokens').upsert(
      { token, email: normalized },
      { onConflict: 'email', ignoreDuplicates: true }
    )
    const { data: stored } = await admin.from('email_unsubscribe_tokens')
      .select('token').eq('email', normalized).maybeSingle()
    if (stored?.token) token = stored.token as string
  }

  const html = await renderAsync(React.createElement(tpl.component, templateData))
  const text = await renderAsync(React.createElement(tpl.component, templateData), { plainText: true })
  const subject = typeof tpl.subject === 'function' ? tpl.subject(templateData) : tpl.subject

  await admin.from('email_send_log').insert({
    message_id: messageId, template_name: 'reviewer-invite',
    recipient_email: to, status: 'pending',
  })

  const { error } = await admin.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: 'transactional',
      label: 'reviewer-invite',
      idempotency_key: idempotencyKey,
      unsubscribe_token: token,
      queued_at: new Date().toISOString(),
    },
  })

  if (error) {
    await admin.from('email_send_log').insert({
      message_id: messageId, template_name: 'reviewer-invite',
      recipient_email: to, status: 'failed', error_message: error.message,
    })
    throw error
  }
  return { messageId }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey)

    const body = await req.json().catch(() => ({}))
    const reviewerEmail: string = body.reviewerEmail || 'default-blair.lott@lindymail.ai'
    const reviewerName: string = body.reviewerName || 'Lindy'
    const ccEmail: string = body.ccEmail || 'blair.lott@rescuedogwines.com'
    const role: string = body.role || 'admin'

    // 1. Create or fetch user
    let userId: string | null = null
    let tempPassword: string = generatePassword()

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: reviewerEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: reviewerName },
    })

    if (createErr) {
      // If user already exists, look them up and reset their password
      const msg = (createErr.message || '').toLowerCase()
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
        const existing = list?.users?.find((u) => u.email?.toLowerCase() === reviewerEmail.toLowerCase())
        if (!existing) throw new Error('User exists but lookup failed')
        userId = existing.id
        tempPassword = generatePassword()
        const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: reviewerName },
        })
        if (updErr) throw updErr
      } else {
        throw createErr
      }
    } else {
      userId = created.user.id
    }

    if (!userId) throw new Error('Could not resolve user id')

    // 2. Approve profile + assign role
    await admin.from('profiles').upsert({
      id: userId, email: reviewerEmail, full_name: reviewerName, approved: true,
    })
    await admin.from('user_roles').upsert(
      { user_id: userId, role },
      { onConflict: 'user_id,role', ignoreDuplicates: true }
    )

    // 3. Make sure neither address is suppressed (so the email actually sends)
    await admin.from('suppressed_emails').delete().in('email', [
      reviewerEmail.toLowerCase(),
      ccEmail.toLowerCase(),
    ])

    // 4. Send invite email to reviewer
    const baseData = {
      recipientName: reviewerName,
      loginEmail: reviewerEmail,
      tempPassword,
      loginUrl: `${(Deno.env.get('PUBLIC_SITE_URL') ?? 'https://rescuedog.lovable.app')}/crm/login`,
      siteUrl: Deno.env.get('PUBLIC_SITE_URL') ?? 'https://rescuedog.lovable.app',
      fromBlair: true,
    }

    const sendResults: Record<string, any> = {}
    try {
      sendResults.reviewer = await enqueueReviewerEmail(
        admin, reviewerEmail,
        { ...baseData, ccCopy: false },
        `reviewer-invite-${userId}-${Date.now()}`
      )
    } catch (e: any) { sendResults.reviewer = { error: e.message } }
    try {
      sendResults.cc = await enqueueReviewerEmail(
        admin, ccEmail,
        { ...baseData, ccCopy: true },
        `reviewer-invite-cc-${userId}-${Date.now()}`
      )
    } catch (e: any) { sendResults.cc = { error: e.message } }

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        reviewerEmail,
        role,
        sent: sendResults,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('provision-reviewer failed', err)
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})