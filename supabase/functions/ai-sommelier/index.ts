// AI Sommelier — wine pairing & recommendation chat powered by Lovable AI Gateway
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are the Rescue Dog Wines Sommelier — a friendly, knowledgeable wine advisor for a small Lodi, California winery whose mission is to support animal rescues. Every bottle sold helps fund rescue partners.

Voice: warm, concise, never pretentious. Avoid jargon unless the guest asks for it. Keep replies under 120 words unless the guest asks for detail.

What you do:
- Recommend wines from the catalog when given (red/white/rose/sparkling/dessert).
- Suggest pairings for foods, occasions, gifts, or moods.
- Explain tasting notes plainly ("dark cherry, soft tannins, smooth finish").
- Promote the Wine Club gently when relevant (15% off, curated quarterly shipments).
- Remind guests that proceeds support rescue dogs.

What you DON'T do:
- Never invent SKUs, vintages, prices, or awards. If you don't know, say so and offer to connect them with the team.
- Never claim "free shipping" — always say "shipping included" when applicable.
- Never give medical or alcohol-consumption advice beyond standard moderation reminders.
- Never recommend driving after drinking.

If asked something outside wine/pairing/rescue topics, politely redirect.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders }); }

  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || messages.length === 0 || messages.length > 30) {
    return new Response(JSON.stringify({ error: 'messages must be 1-30 entries' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const cleaned = messages
    .filter((m: any) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role))
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
  if (cleaned.length === 0) return new Response(JSON.stringify({ error: 'no valid messages' }), { status: 400, headers: corsHeaders });

  const catalogContext = typeof body?.catalog === 'string' ? `\n\nCurrent catalog snapshot (use ONLY these for recommendations):\n${body.catalog.slice(0, 4000)}` : '';

  try {
    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'system', content: SYSTEM_PROMPT + catalogContext }, ...cleaned],
        max_tokens: 400,
      }),
    });
    if (aiRes.status === 429) return new Response(JSON.stringify({ error: 'Busy — try again in a moment.' }), { status: 429, headers: corsHeaders });
    if (aiRes.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted.' }), { status: 402, headers: corsHeaders });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error('AI error', aiRes.status, t);
      return new Response(JSON.stringify({ error: 'AI request failed' }), { status: 500, headers: corsHeaders });
    }
    const data = await aiRes.json();
    const reply = data?.choices?.[0]?.message?.content ?? '';
    return new Response(JSON.stringify({ reply }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('Sommelier exception', e?.message);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), { status: 500, headers: corsHeaders });
  }
});
