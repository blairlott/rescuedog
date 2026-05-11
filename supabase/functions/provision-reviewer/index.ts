import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
      loginUrl: 'https://rescuedogwines.com/crm/login',
      siteUrl: 'https://rescuedogwines.com',
      fromBlair: true,
    }

    const sendResults: Record<string, any> = {}
    const sendOne = async (to: string, ccCopy: boolean, key: string) => {
      const { data, error } = await admin.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'reviewer-invite',
          recipientEmail: to,
          idempotencyKey: key,
          templateData: { ...baseData, ccCopy },
        },
      })
      // When the function returns non-2xx, supabase-js sets error but also exposes the response context
      let bodyText: string | undefined
      if (error && (error as any).context?.text) {
        try { bodyText = await (error as any).context.text() } catch { /* ignore */ }
      }
      return { data, error: error?.message, body: bodyText }
    }

    sendResults.reviewer = await sendOne(reviewerEmail, false, `reviewer-invite-${userId}-${Date.now()}`)
    sendResults.cc = await sendOne(ccEmail, true, `reviewer-invite-cc-${userId}-${Date.now()}`)

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