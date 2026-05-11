import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StaleAccount {
  id: string;
  account_name: string;
  rep_name: string | null;
  last_order_date: string | null;
  city: string | null;
  state: string | null;
  days_since_order: number;
  staleness: '30' | '60' | '90';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const todayKey = new Date().toISOString().slice(0, 10);

    const sendEmail = async (templateName: string, recipientEmail: string, idempotencyKey: string, templateData: Record<string, unknown>) => {
      try {
        await supabase.functions.invoke('send-transactional-email', {
          body: { templateName, recipientEmail, idempotencyKey, templateData },
        });
      } catch (e) {
        console.error('send-transactional-email failed', templateName, recipientEmail, e);
      }
    };

    // Get all active/won accounts with a last_order_date
    const { data: accounts, error } = await supabase
      .from('sales_accounts')
      .select('id, account_name, rep_name, last_order_date, city, state, email')
      .in('status', ['active', 'won'])
      .not('last_order_date', 'is', null);

    if (error) throw error;

    const now = new Date();
    const staleAccounts: StaleAccount[] = [];

    for (const acct of accounts || []) {
      const lastOrder = new Date(acct.last_order_date);
      const days = Math.floor((now.getTime() - lastOrder.getTime()) / (1000 * 60 * 60 * 24));

      if (days >= 30) {
        let staleness: '30' | '60' | '90' = '30';
        if (days >= 90) staleness = '90';
        else if (days >= 60) staleness = '60';

        staleAccounts.push({
          id: acct.id,
          account_name: acct.account_name,
          rep_name: acct.rep_name,
          last_order_date: acct.last_order_date,
          city: acct.city,
          state: acct.state,
          days_since_order: days,
          staleness,
        });
      }
    }

    if (staleAccounts.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No stale accounts found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailsSent: string[] = [];

    // Group by rep for individual alerts
    const byRep = new Map<string, StaleAccount[]>();
    for (const acct of staleAccounts) {
      const rep = acct.rep_name || 'Unassigned';
      if (!byRep.has(rep)) byRep.set(rep, []);
      byRep.get(rep)!.push(acct);
    }

    // Get rep emails from profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('full_name, email');

    const repEmailMap = new Map<string, string>();
    for (const p of profiles || []) {
      if (p.full_name && p.email) {
        repEmailMap.set(p.full_name.toLowerCase(), p.email);
      }
    }

    // Send individual rep alerts
    for (const [repName, repAccounts] of byRep) {
      const repEmail = repEmailMap.get(repName.toLowerCase());
      if (!repEmail || repName === 'Unassigned') continue;

      const sortedAccounts = [...repAccounts].sort((a, b) => b.days_since_order - a.days_since_order);
      await sendEmail(
        'stale-accounts-rep-alert',
        repEmail,
        `stale-rep-${repEmail}-${todayKey}`,
        { repName, accounts: sortedAccounts },
      );
      emailsSent.push(repEmail);
    }

    // Build owner/manager summary grouped by rep and state
    const byState = new Map<string, StaleAccount[]>();
    for (const a of staleAccounts) {
      const st = a.state || 'Unknown';
      if (!byState.has(st)) byState.set(st, []);
      byState.get(st)!.push(a);
    }

    const stale90 = staleAccounts.filter(a => a.staleness === '90').length;
    const stale60 = staleAccounts.filter(a => a.staleness === '60').length;
    const stale30 = staleAccounts.filter(a => a.staleness === '30').length;

    const summaryAccounts: any[] = [];
    for (const [state, stateAccounts] of [...byState].sort((a, b) => a[0].localeCompare(b[0]))) {
      for (const a of stateAccounts.sort((x, y) => y.days_since_order - x.days_since_order)) {
        summaryAccounts.push({
          id: a.id, account_name: a.account_name, rep_name: a.rep_name,
          state, days_since_order: a.days_since_order, staleness: a.staleness,
        });
      }
    }

    // Send summary to owner + managers
    const ownerEmails = ['blair.lott@rescuedogwines.com'];

    // Also get admins/owners from user_roles + profiles
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('role', ['owner', 'admin']);

    if (adminRoles) {
      for (const r of adminRoles) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', r.user_id)
          .single();
        if (prof?.email && !ownerEmails.includes(prof.email)) {
          ownerEmails.push(prof.email);
        }
      }
    }

    // One email per admin recipient (transactional, not bulk)
    for (const ownerEmail of ownerEmails) {
      await sendEmail(
        'stale-accounts-summary',
        ownerEmail,
        `stale-summary-${ownerEmail}-${todayKey}`,
        {
          accounts: summaryAccounts,
          stale30, stale60, stale90,
          stateCount: byState.size,
        },
      );
      emailsSent.push(ownerEmail);
    }

    return new Response(JSON.stringify({
      success: true,
      staleCount: staleAccounts.length,
      emailsSent,
      breakdown: { stale30, stale60, stale90 },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Stale account alerts error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
