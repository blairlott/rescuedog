// Kennel AI Insights — answers ad-hoc questions and generates actionable nudges
// from a dashboard snapshot using Lovable AI Gateway.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Mode = 'query' | 'nudges';

interface Body {
  mode: Mode;
  question?: string;
  snapshot: Record<string, unknown>;
  rangeLabel?: string;
}

const SYSTEM = `You are the Kennel Command Center analyst for Rescue Dog Wines — a small Lodi, California winery whose mission is funding animal rescues.

You receive a JSON snapshot of paid-media spend, DTC orders (Vinoshipper), brick & mortar depletions (Lindy/QuickBooks), and finance (COGS, cost of sales, opex). All dollar values are USD. Numbers are already aggregated for the selected period plus lifetime where shown.

Voice: blunt, operator-grade. No fluff, no emojis, no exclamation points. Reference numbers from the snapshot exactly — never invent metrics. If something is missing, say so.

Brand rules:
- Never say "free shipping" — say "shipping included".
- Loyalty is access-based ("The Pack"), never percent-off framing.
- Do not invent rescue impact totals.`;

const NUDGE_INSTRUCTIONS = `Generate 3 to 5 ACTIONABLE NUDGES based on the snapshot. Each nudge must be a concrete next step the operator can take this week.

Return STRICT JSON only, no prose, no markdown fences:
{ "nudges": [ { "title": "≤60 chars, imperative", "severity": "info"|"warn"|"opportunity", "body": "1-2 sentences, cite a number from the snapshot", "metric": "short metric reference like 'ROAS 1.4x' or 'COGS 38%'" } ] }

Prioritize: ROAS deltas vs spend, channel imbalance, B&M state concentration, expense ratio drift, DTC AOV vs ad CPA. Skip anything you can't ground in the snapshot.`;

const QUERY_INSTRUCTIONS = `Answer the operator's question using ONLY the snapshot data. Keep it under 150 words. Cite specific numbers. If the snapshot doesn't contain what's needed, say exactly what's missing and what feed would supply it (Meta Ads, Google Ads, Instacart, Vinoshipper, Lindy B&M, QuickBooks).`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const { mode, question, snapshot, rangeLabel } = body ?? {};
    if (!mode || !snapshot) {
      return new Response(JSON.stringify({ error: 'mode and snapshot required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (mode === 'query' && (!question || question.trim().length < 3)) {
      return new Response(JSON.stringify({ error: 'question required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI gateway not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userPayload = [
      rangeLabel ? `Period: ${rangeLabel}` : null,
      `Snapshot:\n${JSON.stringify(snapshot, null, 2)}`,
      mode === 'query' ? `Question: ${question}` : null,
      mode === 'query' ? QUERY_INSTRUCTIONS : NUDGE_INSTRUCTIONS,
    ].filter(Boolean).join('\n\n');

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userPayload },
        ],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      const status = aiRes.status === 429 ? 429 : aiRes.status === 402 ? 402 : 500;
      return new Response(JSON.stringify({ error: 'AI request failed', detail: txt }), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const json = await aiRes.json();
    const content: string = json?.choices?.[0]?.message?.content ?? '';

    if (mode === 'nudges') {
      // Strip code fences if model added them
      const cleaned = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      let nudges: unknown = [];
      try {
        const parsed = JSON.parse(cleaned);
        nudges = Array.isArray(parsed) ? parsed : parsed?.nudges ?? [];
      } catch {
        nudges = [];
      }
      return new Response(JSON.stringify({ nudges }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ answer: content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});