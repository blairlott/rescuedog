import { createClient } from 'npm:@supabase/supabase-js@2'
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'

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
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: isAdmin } = await supabase.rpc('is_admin_or_owner', { _user_id: userId })
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const recipient = (body.recipient as string) || 'blair.lott@rescuedogwines.com'
    const runId = crypto.randomUUID().slice(0, 8)

    const results: Array<{ template: string; ok: boolean; error?: string }> = []

    for (const [name, entry] of Object.entries(TEMPLATES)) {
      try {
        const { error } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: name,
            recipientEmail: recipient,
            idempotencyKey: `test-${runId}-${name}`,
            templateData: entry.previewData || {},
          },
        })
        results.push({ template: name, ok: !error, error: error?.message })
      } catch (e) {
        results.push({ template: name, ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    }

    return new Response(
      JSON.stringify({ success: true, recipient, runId, count: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})