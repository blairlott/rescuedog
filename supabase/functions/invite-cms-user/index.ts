import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { TEMPLATES } from "../_shared/transactional-email-templates/registry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE_NAME = 'Rescue Dog Wines'
const SENDER_DOMAIN = 'notify.partner.rescuedog.com'
const FROM_DOMAIN = 'partner.rescuedog.com'
const SIGN_IN_URL = 'https://rescuedogwines.com/crm/login'

// NOTE: duplicated from provision-reviewer/index.ts. That file does not export
// helpers and edge functions cannot share runtime imports across folders for
// non-_shared paths, so we copy the 7-line generator rather than refactor.
function generatePassword(): string {
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

async function enqueueCmsInviteEmail(
  admin: ReturnType<typeof createClient>,
  to: string,
  templateData: Record<string, any>,
  idempotencyKey: string,
): Promise<boolean> {
  const tpl = TEMPLATES['cms-editor-invite']
  if (!tpl) throw new Error('cms-editor-invite template missing from registry')

  const messageId = crypto.randomUUID()
  const normalized = to.toLowerCase()

  // Make sure recipient is not suppressed
  await admin.from('suppressed_emails').delete().eq('email', normalized)

  // Ensure an unsubscribe token exists for this address
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
    message_id: messageId,
    template_name: 'cms-editor-invite',
    recipient_email: to,
    status: 'pending',
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
      label: 'cms-editor-invite',
      idempotency_key: idempotencyKey,
      unsubscribe_token: token,
      queued_at: new Date().toISOString(),
    },
  })

  if (error) {
    await admin.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'cms-editor-invite',
      recipient_email: to,
      status: 'failed',
      error_message: error.message,
    })
    return false
  }
  return true
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is admin/owner
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) throw new Error("Invalid token");

    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin_or_owner", { _user_id: caller.id });
    if (!isAdmin) throw new Error("Not authorized — only admins and owners can invite CMS editors");

    const { email, full_name } = await req.json();
    if (!email) throw new Error("Email is required");

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    let userId: string;
    const tempPassword = generatePassword();

    if (existingUser) {
      userId = existingUser.id;
      // Reset password so the temp credential in the email is valid
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: tempPassword,
        email_confirm: true,
        ...(full_name ? { user_metadata: { full_name } } : {}),
      });
    } else {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: full_name || "" },
      });
      if (createError) throw createError;
      userId = newUser.user.id;
    }

    // Approve profile + flag for forced password change on first sign-in
    await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        email,
        approved: true,
        must_change_password: true,
        ...(full_name ? { full_name } : {}),
      });

    // Check if already has cms_editor role
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "cms_editor")
      .maybeSingle();

    if (!existingRole) {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: "cms_editor" });
      if (roleError) throw roleError;
    }

    // Fire the temp-password email
    let email_queued = false;
    try {
      email_queued = await enqueueCmsInviteEmail(
        supabaseAdmin,
        email,
        {
          recipientName: full_name || undefined,
          loginEmail: email,
          tempPassword,
          signInUrl: SIGN_IN_URL,
        },
        `cms-editor-invite-${userId}-${Date.now()}`,
      );
    } catch (e: any) {
      console.error('cms-editor-invite enqueue failed', e);
      email_queued = false;
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        already_existed: !!existingUser,
        email_queued,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
