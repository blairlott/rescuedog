import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'

// Configuration baked in at scaffold time — do NOT change these manually.
// To update, re-run the email domain setup flow.
const SITE_NAME = "Rescue Dog Wines"
// SENDER_DOMAIN is the verified sender subdomain FQDN (e.g., "notify.example.com").
// It MUST match the subdomain delegated to Lovable's nameservers — never the root domain.
// The email API looks up this exact domain; a mismatch causes "No email domain record found".
const SENDER_DOMAIN = "notify.rescuedog.com"
// FROM_DOMAIN is the domain shown in the From: header (e.g., "example.com").
// When display_from_root is enabled, this can be the root domain for cleaner branding,
// even though actual sending uses the subdomain above.
const FROM_DOMAIN = "notify.rescuedog.com"

// Customer-service routing.
// All customer-facing emails reply to info@ (never no-reply) and BCC info@
// for internal visibility. Shipping issues are routed to Vinoshipper's
// customer service for fastest resolution.
const REPLY_TO_EMAIL = 'info@rescuedogwines.com'
const BCC_EMAIL = 'info@rescuedogwines.com'
const SHIPPING_SUPPORT_EMAIL = 'customerservice@vinoshipper.com'

// Templates whose recipient is internal staff/partners (not the end customer).
// These skip reply-to override, the BCC copy, and the shipping support note.
const INTERNAL_TEMPLATES = new Set<string>([
  'donation-admin-notification',
  'wholesale-admin-notification',
  'stale-accounts-rep-alert',
  'stale-accounts-summary',
  'dropship-partner-po',
  'wine-club-staff-action',
  'kennel-access-invite',
  'reviewer-invite',
  'access-request-admin-notification',
])
INTERNAL_TEMPLATES.add('contact-form-admin-notification')
INTERNAL_TEMPLATES.add('marketplace-application-admin-notification')
INTERNAL_TEMPLATES.add('retailer-suggestion-admin-notification')
INTERNAL_TEMPLATES.add('subscription-signup-admin-notification')

function buildSupportFooterHtml(): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;border-top:1px solid #e5e5e5;">
      <tr><td style="padding:18px 28px;font-family:'Nunito Sans','Avenir Next',Arial,sans-serif;font-size:12px;color:#666;line-height:1.6;">
        <strong style="color:#000;">Need help?</strong> Reply to this email and we'll get back to you at
        <a href="mailto:${REPLY_TO_EMAIL}" style="color:#c30017;text-decoration:none;">${REPLY_TO_EMAIL}</a>.<br/>
        <strong style="color:#000;">Shipping or tracking question?</strong> For fastest resolution, contact our shipping partner directly at
        <a href="mailto:${SHIPPING_SUPPORT_EMAIL}" style="color:#c30017;text-decoration:none;">${SHIPPING_SUPPORT_EMAIL}</a>.
      </td></tr>
    </table>
  `
}

function buildSupportFooterText(): string {
  return [
    '',
    '----',
    `Need help? Reply to this email and we'll get back to you at ${REPLY_TO_EMAIL}.`,
    `Shipping or tracking question? For fastest resolution, contact our shipping partner directly at ${SHIPPING_SUPPORT_EMAIL}.`,
  ].join('\n')
}

function injectSupportFooterHtml(html: string): string {
  const footer = buildSupportFooterHtml()
  // Insert just before </body> if present, otherwise append.
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`)
  }
  return html + footer
}

// Generate a cryptographically random 32-byte hex token
function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Auth note: this function uses verify_jwt = true in config.toml, so Supabase's
// gateway validates the caller's JWT (anon or service_role) before the request
// reaches this code. No in-function auth check is needed.

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Parse request body
  let templateName: string
  let recipientEmail: string
  let idempotencyKey: string
  let messageId: string
  let templateData: Record<string, any> = {}
  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name
    recipientEmail = body.recipientEmail || body.recipient_email
    messageId = crypto.randomUUID()
    idempotencyKey = body.idempotencyKey || body.idempotency_key || messageId
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    }
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (!templateName) {
    return new Response(
      JSON.stringify({ error: 'templateName is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 1. Look up template from registry (early — needed to resolve recipient)
  const template = TEMPLATES[templateName]

  if (!template) {
    console.error('Template not found in registry', { templateName })
    return new Response(
      JSON.stringify({
        error: `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`,
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Resolve effective recipient: template-level `to` takes precedence over
  // the caller-provided recipientEmail. This allows notification templates
  // to always send to a fixed address (e.g., site owner from env var).
  const effectiveRecipient = template.to || recipientEmail

  if (!effectiveRecipient) {
    return new Response(
      JSON.stringify({
        error: 'recipientEmail is required (unless the template defines a fixed recipient)',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Create Supabase client with service role (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // ========================================================================
  // PRE-LAUNCH TEST MODE
  // Reroutes all transactional sends to the configured test recipients
  // (default: Blair + Lindy). Configured in app_settings['email_test_mode'].
  // S&S templates (and any template listed in exempt_templates) are NOT
  // affected and follow normal routing. Disable before launch.
  // ========================================================================
  try {
    const { data: tmRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'email_test_mode')
      .maybeSingle()
    const tm = (tmRow?.value || {}) as {
      enabled?: boolean
      recipients?: string[]
      exempt_templates?: string[]
    }
    const exempt = new Set((tm.exempt_templates || []).map((t) => t.toLowerCase()))
    const testRecipients = (tm.recipients || []).filter(Boolean)
    if (tm.enabled && testRecipients.length > 0 && !exempt.has(templateName.toLowerCase())) {
      console.log('[email_test_mode] Rerouting', {
        templateName,
        originalRecipient: effectiveRecipient,
        testRecipients,
      })
      // Fan out to all test recipients; first one uses the original
      // idempotency key, subsequent get a suffix to remain unique.
      const results = await Promise.allSettled(
        testRecipients.map((to, i) =>
          supabase.functions.invoke('send-transactional-email', {
            body: {
              templateName,
              recipientEmail: to,
              idempotencyKey: `${idempotencyKey}:tm:${i}`,
              templateData: {
                ...templateData,
                __testModeOriginalRecipient: effectiveRecipient,
              },
            },
          })
        )
      )
      // Mark the original send as suppressed-by-test-mode for audit
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'suppressed',
        error_message: 'rerouted by email_test_mode',
      })
      return new Response(
        JSON.stringify({
          success: true,
          test_mode: true,
          rerouted_to: testRecipients,
          fanout: results.map((r) => r.status),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (e) {
    console.warn('[email_test_mode] lookup failed, proceeding with normal routing', e)
  }

  // 2. Check suppression list (fail-closed: if we can't verify, don't send)
  const { data: suppressed, error: suppressionError } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', effectiveRecipient.toLowerCase())
    .maybeSingle()

  if (suppressionError) {
    console.error('Suppression check failed — refusing to send', {
      error: suppressionError,
      effectiveRecipient,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to verify suppression status' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (suppressed) {
    // Log the suppressed attempt
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
    })

    console.log('Email suppressed', { effectiveRecipient, templateName })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 3. Get or create unsubscribe token (one token per email address)
  const normalizedEmail = effectiveRecipient.toLowerCase()
  let unsubscribeToken: string

  // Check for existing token for this email
  const { data: existingToken, error: tokenLookupError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (tokenLookupError) {
    console.error('Token lookup failed', {
      error: tokenLookupError,
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to look up unsubscribe token',
    })
    return new Response(
      JSON.stringify({ error: 'Failed to prepare email' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (existingToken && !existingToken.used_at) {
    // Reuse existing unused token
    unsubscribeToken = existingToken.token
  } else if (!existingToken) {
    // Create new token — upsert handles concurrent inserts gracefully
    unsubscribeToken = generateToken()
    const { error: tokenError } = await supabase
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubscribeToken, email: normalizedEmail },
        { onConflict: 'email', ignoreDuplicates: true }
      )

    if (tokenError) {
      console.error('Failed to create unsubscribe token', {
        error: tokenError,
      })
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to create unsubscribe token',
      })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // If another request raced us, our upsert was silently ignored.
    // Re-read to get the actual stored token.
    const { data: storedToken, error: reReadError } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (reReadError || !storedToken) {
      console.error('Failed to read back unsubscribe token after upsert', {
        error: reReadError,
        email: normalizedEmail,
      })
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to confirm unsubscribe token storage',
      })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    unsubscribeToken = storedToken.token
  } else {
    // Token exists but is already used — email should have been caught by suppression check above.
    // This is a safety fallback; log and skip sending.
    console.warn('Unsubscribe token already used but email not suppressed', {
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
      error_message:
        'Unsubscribe token used but email missing from suppressed list',
    })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 4. Render React Email template to HTML and plain text
  let html = await renderAsync(
    React.createElement(template.component, templateData)
  )
  let plainText = await renderAsync(
    React.createElement(template.component, templateData),
    { plainText: true }
  )

  // Resolve subject — supports static string or dynamic function
  let resolvedSubject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  // Override hook: admins can customize subject/html via the email editor
  // in the Customer Service dashboard. Stored in email_template_overrides.
  try {
    const { data: override } = await supabase
      .from('email_template_overrides')
      .select('subject, body_html, enabled')
      .eq('template_name', templateName)
      .maybeSingle()
    if (override && override.enabled) {
      if (override.subject && override.subject.trim().length > 0) {
        resolvedSubject = override.subject
      }
      if (override.body_html && override.body_html.trim().length > 0) {
        html = override.body_html
        plainText = override.body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }
  } catch (e) {
    console.warn('email override lookup failed', e)
  }

  // Customer-facing emails get a shared support footer (reply-to info@,
  // shipping questions routed to Vinoshipper) and a BCC to info@.
  // Internal staff/partner notifications skip this entirely.
  const isCustomerFacing = !INTERNAL_TEMPLATES.has(templateName)
  if (isCustomerFacing) {
    html = injectSupportFooterHtml(html)
    plainText = plainText + buildSupportFooterText()
  }
  const replyTo = isCustomerFacing ? REPLY_TO_EMAIL : undefined

  // 5. Enqueue the pre-rendered email for async processing by the dispatcher.
  // The dispatcher (process-email-queue) handles sending, retries, and rate-limit backoff.

  // Log pending BEFORE enqueue so we have a record even if enqueue crashes
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: effectiveRecipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: resolvedSubject,
      html,
      text: plainText,
      purpose: 'transactional',
      reply_to: replyTo,
      label: templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('Failed to enqueue email', {
      error: enqueueError,
      templateName,
      effectiveRecipient,
    })

    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })

    return new Response(JSON.stringify({ error: 'Failed to enqueue email' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  console.log('Transactional email enqueued', { templateName, effectiveRecipient })

  // 6. BCC fallback: the Lovable email SDK does not support a `bcc` field, so
  // we enqueue a second copy to info@ for customer-facing sends. Skip if the
  // primary recipient is already info@ to avoid duplicate sends.
  // Also skip when this send is itself a test-mode reroute (templateData carries
  // `__testModeOriginalRecipient`) — we don't want to BCC info@ during testing.
  const isTestModeReroute = Boolean(templateData && (templateData as any).__testModeOriginalRecipient)
  if (isCustomerFacing && !isTestModeReroute && effectiveRecipient.toLowerCase() !== BCC_EMAIL.toLowerCase()) {
    const bccMessageId = crypto.randomUUID()
    const bccSubject = `[BCC: ${effectiveRecipient}] ${resolvedSubject}`

    // Ensure an unsubscribe token exists for the BCC address.
    let bccUnsubToken: string
    const { data: existingBccToken } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token, used_at')
      .eq('email', BCC_EMAIL.toLowerCase())
      .maybeSingle()

    if (existingBccToken && !existingBccToken.used_at) {
      bccUnsubToken = existingBccToken.token
    } else {
      bccUnsubToken = generateToken()
      await supabase
        .from('email_unsubscribe_tokens')
        .upsert(
          { token: bccUnsubToken, email: BCC_EMAIL.toLowerCase() },
          { onConflict: 'email', ignoreDuplicates: true }
        )
      const { data: stored } = await supabase
        .from('email_unsubscribe_tokens')
        .select('token')
        .eq('email', BCC_EMAIL.toLowerCase())
        .maybeSingle()
      if (stored?.token) bccUnsubToken = stored.token
    }

    await supabase.from('email_send_log').insert({
      message_id: bccMessageId,
      template_name: `${templateName}-bcc`,
      recipient_email: BCC_EMAIL,
      status: 'pending',
    })

    const { error: bccEnqueueError } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: bccMessageId,
        to: BCC_EMAIL,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: bccSubject,
        html,
        text: plainText,
        purpose: 'transactional',
        reply_to: replyTo,
        label: `${templateName}-bcc`,
        idempotency_key: `${idempotencyKey}:bcc`,
        unsubscribe_token: bccUnsubToken,
        queued_at: new Date().toISOString(),
      },
    })

    if (bccEnqueueError) {
      console.error('Failed to enqueue BCC copy', {
        error: bccEnqueueError,
        templateName,
      })
      await supabase.from('email_send_log').insert({
        message_id: bccMessageId,
        template_name: `${templateName}-bcc`,
        recipient_email: BCC_EMAIL,
        status: 'failed',
        error_message: 'Failed to enqueue BCC copy',
      })
      // Don't fail the primary send — BCC is best-effort.
    }
  }

  return new Response(
    JSON.stringify({ success: true, queued: true }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})
