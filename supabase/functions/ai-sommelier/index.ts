// AI Sommelier — wine pairing & recommendation chat powered by Lovable AI Gateway
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are the Rescue Dog Wines Sommelier — a friendly, knowledgeable wine advisor for a small Lodi, California winery whose mission is to support animal rescues. Every bottle sold helps fund rescue partners.

Voice: warm, concise, never pretentious. Avoid jargon unless the guest asks for it. Keep replies under 120 words unless the guest asks for detail.

CRITICAL CATALOG RULE — READ FIRST:
- You may ONLY recommend, name, or suggest wines that appear in the "Current catalog" list provided below.
- If the catalog is provided and the guest asks for a recommendation, you MUST pick from that list. Quote the wine's exact title.
- NEVER name, invent, or recommend any wine, varietal, producer, region, or vintage that is not in the catalog list. No "you might also like X" outside the list.
- If nothing in the catalog is a great fit, say so honestly and suggest the closest match from the list, or offer to connect them with our team — do NOT name an outside wine.
- If no catalog is provided, do not name specific wines at all. Speak only in general terms (varietal characteristics, pairing concepts) and invite the guest to browse our shop.

What you do:
- Recommend wines strictly from the catalog when given.
- Suggest pairings for foods, occasions, gifts, or moods.
- Explain tasting notes plainly ("dark cherry, soft tannins, smooth finish").
- Promote the Wine Club gently when relevant (free to join, flat 20% off all orders).
- Remind guests that proceeds support rescue dogs.
- **Wine cocktails on request**: If the guest asks for cocktails, spritzes, mixers, sangria, mocktails, or "what can I make with this wine", invent ONE original wine cocktail recipe built around a wine from the current catalog. Format:
    1. A playful original name (e.g. "The Lodi Sunset", "Rescue Spritz") — bold it.
    2. One-line vibe description.
    3. **Ingredients** list (3–6 items). EVERY line MUST follow this exact format:
         "<amount> <unit> — <ingredient>"
       Rules:
         - Always include both an amount and a unit, even for garnishes or small items.
         - Allowed units ONLY: oz, ml, dash, dashes, tsp, tbsp, cup, bottle, splash, sprig, slice, slices, wedge, wedges, leaf, leaves, cube, cubes, piece, pieces.
         - Use decimals, not fractions (e.g. "0.5 oz", not "½ oz" or "1/2 oz").
         - The wine itself MUST be measured in oz (spritz/shaken) or bottle (sangria).
         - For sangria use "1 bottle — <wine title>" plus per-pitcher measurements for the rest.
         - For spritz and shaken cocktails, all liquids in oz; bitters in dashes; sugar/syrup in tsp or oz.
         - No vague terms like "to taste", "splash of", "a handful". Always a number + allowed unit.
         - Use an em dash " — " (space, em dash, space) between measurement and ingredient.
    4. **Method** (2–4 short steps).
    5. **Garnish & glass**.
    6. One-line "why this wine" note tying back to its tasting notes.
  Stay under 180 words for cocktails. Always pick the wine from the catalog and quote its exact title. Add a brief "drink responsibly, 21+" reminder at the end of cocktail replies.

What you DON'T do:
- Never invent SKUs, vintages, prices, or awards.
- Never name a wine that is not in the provided catalog.
- Never claim "free shipping" — always say "shipping included" when applicable.
- Never give medical or alcohol-consumption advice beyond standard moderation reminders.
- Never recommend driving after drinking.
- For cocktails, never use ingredients that imply hard-to-source or dangerous prep; keep it home-bar friendly.

If asked something outside wine/pairing/rescue topics, politely redirect.`;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

let cachedCatalog: { value: string; titles: string[]; ts: number } | null = null;
const CATALOG_TTL_MS = 5 * 60 * 1000;

async function fetchLiveCatalog(): Promise<{ value: string; titles: string[] }> {
  if (cachedCatalog && Date.now() - cachedCatalog.ts < CATALOG_TTL_MS) {
    return { value: cachedCatalog.value, titles: cachedCatalog.titles };
  }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/wine_products?select=title,tags,description,price_cents,varietal,vintage&is_active=eq.true&order=sort_order`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    const rows: any[] = await res.json();
    const lines: string[] = [];
    const titles: string[] = [];
    for (const r of rows) {
      if (!r?.title) continue;
      titles.push(r.title);
      const price = r.price_cents != null ? (r.price_cents / 100).toFixed(2) : null;
      const tags = Array.isArray(r.tags) ? r.tags.slice(0, 6).join(", ") : "";
      const desc = (r.description || "").replace(/\s+/g, " ").slice(0, 140);
      lines.push(`• ${r.title}${price ? ` — $${price}` : ""}${tags ? ` [${tags}]` : ""}${desc ? ` — ${desc}` : ""}`);
    }
    const value = lines.join("\n");
    cachedCatalog = { value, titles, ts: Date.now() };
    return { value, titles };
  } catch (e) {
    console.error("catalog fetch failed", (e as Error)?.message);
    return { value: "", titles: [] };
  }
}

function extractMentionedTitles(text: string): string[] {
  // Pull anything bolded as **...** — that's how the model names wines.
  const matches = text.match(/\*\*([^*]+)\*\*/g) || [];
  return matches.map(m => m.replace(/\*\*/g, "").trim());
}

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

  // Source-of-truth catalog: prefer the client's snapshot, but always fall back to a live fetch
  // so the model NEVER reasons without one.
  let catalogStr = typeof body?.catalog === 'string' && body.catalog.trim() ? body.catalog : '';
  let catalogTitles: string[] = [];
  if (!catalogStr) {
    const live = await fetchLiveCatalog();
    catalogStr = live.value;
    catalogTitles = live.titles;
  } else {
    // Best-effort title extraction from the client snapshot lines starting with "• "
    catalogTitles = catalogStr.split("\n").map(l => {
      const m = l.match(/^[•\-\*]\s*([^—\[]+?)(?:\s*[—\[]|$)/);
      return m ? m[1].trim() : "";
    }).filter(Boolean);
  }

  const catalogContext = catalogStr
    ? `\n\n=== Current catalog (the ONLY wines you may recommend) ===\n${catalogStr.slice(0, 6000)}\n=== End of catalog ===`
    : `\n\nNOTE: No catalog could be loaded. Do NOT name any specific wines. Speak in general terms only and invite the guest to browse our shop.`;

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
    let reply: string = data?.choices?.[0]?.message?.content ?? '';

    // SAFETY NET: if the model named a wine that isn't in the catalog, replace the reply
    // with a safe fallback. This prevents fabricated SKUs from ever reaching the user.
    if (catalogTitles.length > 0) {
      const mentioned = extractMentionedTitles(reply);
      const lowerTitles = catalogTitles.map(t => t.toLowerCase());
      const offending = mentioned.filter(m => {
        const ml = m.toLowerCase();
        // Allow if it matches (or is contained in / contains) a real catalog title
        return !lowerTitles.some(t => t.includes(ml) || ml.includes(t));
      });
      if (offending.length > 0) {
        console.warn('Sommelier named off-catalog wine(s), suppressing:', offending);
        reply = `I want to make sure I only recommend wines we actually carry. Browse our current selection at /wines and tell me a bit about what you like (style, occasion, food) and I'll pick from our list for you.`;
      }
    }

    return new Response(JSON.stringify({ reply }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('Sommelier exception', e?.message);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), { status: 500, headers: corsHeaders });
  }
});
