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
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const CRM_BASE_URL = 'https://rescuedogwines.com/crm/account';
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

      const rows = repAccounts
        .sort((a, b) => b.days_since_order - a.days_since_order)
        .map(a => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">
              <a href="${CRM_BASE_URL}/${a.id}" style="color:#c41e3a;text-decoration:none;font-weight:bold;">
                ${a.account_name}
              </a>
            </td>
            <td style="padding:8px;border-bottom:1px solid #eee;">${[a.city, a.state].filter(Boolean).join(', ')}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">
              <span style="background:${a.staleness === '90' ? '#fee2e2' : a.staleness === '60' ? '#ffedd5' : '#fef9c3'};
                           color:${a.staleness === '90' ? '#991b1b' : a.staleness === '60' ? '#9a3412' : '#854d0e'};
                           padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">
                ${a.days_since_order} days
              </span>
            </td>
          </tr>
        `).join('');

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#c41e3a;color:white;padding:20px;text-align:center;">
            <h1 style="margin:0;font-size:20px;">⏰ Stale Account Alert</h1>
            <p style="margin:4px 0 0;font-size:14px;opacity:0.9;">Accounts that haven't ordered recently</p>
          </div>
          <div style="padding:20px;">
            <p style="font-size:14px;color:#333;">Hi ${repName},</p>
            <p style="font-size:14px;color:#333;">The following <strong>${repAccounts.length}</strong> account(s) assigned to you haven't placed an order in 30+ days:</p>
            <table style="width:100%;border-collapse:collapse;margin:15px 0;">
              <thead>
                <tr style="background:#f3f4f6;">
                  <th style="padding:8px;text-align:left;font-size:12px;text-transform:uppercase;">Account</th>
                  <th style="padding:8px;text-align:left;font-size:12px;text-transform:uppercase;">Location</th>
                  <th style="padding:8px;text-align:center;font-size:12px;text-transform:uppercase;">Days Since Order</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <p style="font-size:14px;color:#333;">Click an account name to view it in the CRM.</p>
          </div>
        </div>
      `;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Rescue Dog Wines CRM <crm@rescuedogwines.com>',
          to: [repEmail],
          subject: `⏰ ${repAccounts.length} Account(s) Need Attention`,
          html,
        }),
      });
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

    let summaryRows = '';
    for (const [state, stateAccounts] of [...byState].sort((a, b) => a[0].localeCompare(b[0]))) {
      for (const a of stateAccounts.sort((x, y) => y.days_since_order - x.days_since_order)) {
        summaryRows += `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;">
              <a href="${CRM_BASE_URL}/${a.id}" style="color:#c41e3a;text-decoration:none;">${a.account_name}</a>
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;">${a.rep_name || 'Unassigned'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;">${state}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;text-align:center;">
              <span style="background:${a.staleness === '90' ? '#fee2e2' : a.staleness === '60' ? '#ffedd5' : '#fef9c3'};
                           color:${a.staleness === '90' ? '#991b1b' : a.staleness === '60' ? '#9a3412' : '#854d0e'};
                           padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">
                ${a.days_since_order}d
              </span>
            </td>
          </tr>
        `;
      }
    }

    const summaryHtml = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="background:#c41e3a;color:white;padding:20px;text-align:center;">
          <h1 style="margin:0;font-size:20px;">📊 Stale Accounts Summary</h1>
          <p style="margin:4px 0 0;font-size:14px;opacity:0.9;">Daily Overview</p>
        </div>
        <div style="padding:20px;">
          <div style="display:flex;gap:10px;margin-bottom:20px;">
            <div style="flex:1;background:#fee2e2;padding:12px;text-align:center;border-radius:6px;">
              <div style="font-size:24px;font-weight:bold;color:#991b1b;">${stale90}</div>
              <div style="font-size:11px;color:#991b1b;">90+ days</div>
            </div>
            <div style="flex:1;background:#ffedd5;padding:12px;text-align:center;border-radius:6px;">
              <div style="font-size:24px;font-weight:bold;color:#9a3412;">${stale60}</div>
              <div style="font-size:11px;color:#9a3412;">60+ days</div>
            </div>
            <div style="flex:1;background:#fef9c3;padding:12px;text-align:center;border-radius:6px;">
              <div style="font-size:24px;font-weight:bold;color:#854d0e;">${stale30}</div>
              <div style="font-size:11px;color:#854d0e;">30+ days</div>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;">Account</th>
                <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;">Rep</th>
                <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;">State</th>
                <th style="padding:8px;text-align:center;font-size:11px;text-transform:uppercase;">Days</th>
              </tr>
            </thead>
            <tbody>${summaryRows}</tbody>
          </table>
          <p style="font-size:12px;color:#999;margin-top:20px;text-align:center;">
            Total: ${staleAccounts.length} stale accounts across ${byState.size} state(s)
          </p>
        </div>
      </div>
    `;

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

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Rescue Dog Wines CRM <crm@rescuedogwines.com>',
        to: ownerEmails,
        subject: `📊 Daily Stale Accounts Summary: ${staleAccounts.length} accounts need attention`,
        html: summaryHtml,
      }),
    });
    emailsSent.push(...ownerEmails);

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
