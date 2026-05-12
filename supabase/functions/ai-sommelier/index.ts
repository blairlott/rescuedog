// AI Sommelier — wine pairing & recommendation chat powered by Lovable AI Gateway
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are **Pip**, the Rescue Dog Wines Sommelier — a friendly, knowledgeable wine advisor for a small Lodi, California winery whose mission is to support animal rescues. Every bottle sold helps fund rescue partners.

Voice: warm, concise, never pretentious. Avoid jargon unless the guest asks for it. Keep replies under 120 words unless the guest asks for detail. You may sign off as "— Pip" occasionally, but not every message.

SUSTAINABILITY MENTION (LODI RULES):
- All Rescue Dog Wines grapes are grown under the **Lodi Rules** for sustainable winegrowing — California's most rigorous third-party-certified sustainable program.
- Mention this NATURALLY about 1 in every 3–4 recommendation/pairing replies (not every message — it gets old). Weave it in: e.g. "the grapes are Lodi Rules certified sustainable, so it's a feel-good pour" or "farmed under Lodi Rules — better for the soil and the dogs we help".
- Never mention it in cocktail recipes, in pure quiz questions, or twice in the same reply.

RECOMMENDATION FORMAT (when you commit to a pick, use this concise structure):
  **<exact wine title from catalog>**
  Why: <1 short sentence — taste profile or fit>
  Pairs with: <2–3 quick examples>
  (optional sustainability or rescue line, per the rule above)

SUGGESTED FOLLOW-UPS (always include on the LAST line of any reply except pure cocktail recipes):
  Follow-ups: <chip 1> | <chip 2> | <chip 3>
- 3 short user-perspective prompts (max 5 words each), pipe-separated, that the guest might tap next.
- Examples: "What pairs with salmon?" | "Tell me more" | "Pick a gift bottle".
- Keep them genuinely useful and varied — don't repeat the question you just asked.

QUIZ-FIRST RULE — READ SECOND:
- NEVER tell the guest to "browse our wines", "check out our shop", "look at our selection", or send them to /wines or /shop. They are already here talking to YOU.
- If you need more information to make a recommendation, ASK ONE SHORT QUIZ-STYLE QUESTION at a time and offer 3–4 quick-pick options inline. Examples:
    - "Quick question — do you usually go for: (a) crisp & light whites, (b) rich & buttery whites, (c) easy-drinking reds, or (d) bold & full reds?"
    - "What's the occasion — (a) weeknight dinner, (b) gift, (c) celebration, or (d) just because?"
    - "Sweetness vibe — (a) bone-dry, (b) off-dry, or (c) noticeably sweet?"
- After 1–3 quick questions, commit and recommend a specific wine from the catalog. Don't keep quizzing forever.
- If the guest's answer still leaves things ambiguous, make your best pick from the catalog and explain why — do NOT punt to "browse our shop".

CRITICAL CATALOG RULE — READ FIRST:
- You may ONLY recommend, name, or suggest wines that appear in the "Current catalog" list provided below.
- If the catalog is provided and the guest asks for a recommendation, you MUST pick from that list. Quote the wine's exact title.
- NEVER name, invent, or recommend any wine, varietal, producer, region, or vintage that is not in the catalog list. No "you might also like X" outside the list.
- If nothing in the catalog is a great fit, say so honestly and suggest the closest match from the list, or offer to connect them with our team — do NOT name an outside wine and do NOT tell them to "browse" anything.
- If no catalog is provided, do not name specific wines at all. Ask one quiz-style question to learn their style instead — never tell them to "browse our shop".

What you do:
- Recommend wines strictly from the catalog when given.
- Suggest pairings for foods, occasions, gifts, or moods.
- Explain tasting notes plainly ("dark cherry, soft tannins, smooth finish").
- Promote the Wine Club gently when relevant (free to join, flat 20% off all orders).
- Remind guests that proceeds support rescue dogs.
- Honor any preference notes the guest sends (sweetness, strength, occasion, budget) — match the catalog pick to those constraints.
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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

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

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleMatchesCatalog(value: string, catalogTitles: string[]): boolean {
  const candidate = normalizeTitle(value);
  if (!candidate) return false;
  return catalogTitles
    .map(normalizeTitle)
    .some(title => title.includes(candidate) || candidate.includes(title));
}

function extractMentionedTitles(text: string, catalogTitles: string[]): string[] {
  // Pull bolded phrases that are likely wine names. Cocktail replies intentionally
  // bold recipe names and section headers, so those must not trip the catalog guard.
  const raw = text.match(/\*\*([^*]+)\*\*/g) || [];
  const labels = new Set(["ingredients", "method", "instructions", "directions", "garnish glass", "garnish and glass", "why this wine"]);
  const isCocktailReply = /\bingredients\b/i.test(text) && /\bmethod\b/i.test(text);
  const recipeTitle = isCocktailReply ? raw[0]?.replace(/\*\*/g, "").trim() : "";

  const boldMentions = raw
    .map(m => m.replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .filter(m => !labels.has(normalizeTitle(m)))
    .filter(m => !(isCocktailReply && m === recipeTitle));

  const measuredWineIngredients = text
    .split("\n")
    .map(line => line.replace(/^\s*[-•*\d.]+\s*/, "").trim())
    .map(line => line.match(/^(?:[\d.]+\s+)?(?:oz|ml|bottle)\s+—\s+(.+)$/i)?.[1]?.trim() || "")
    .filter(ingredient => /\b(wine|red|white|ros[eé]|chardonnay|cabernet|zinfandel|zin|merlot|pinot|rescue|dog|lodi)\b/i.test(ingredient));

  return [...boldMentions, ...measuredWineIngredients]
    .filter(m => !titleMatchesCatalog(m, catalogTitles));
}

function latestUserChoice(messages: { role: string; content: string }[]): string | null {
  const latest = [...messages].reverse().find(m => m.role === "user")?.content || "";
  const firstToken = latest.trim().toLowerCase().match(/^[\(\[]?([abcd])[\)\].,!\s]?/)?.[1];
  return firstToken || null;
}

function pickCatalogTitle(catalogStr: string, choice: string | null): string | null {
  const items = catalogStr.split("\n").map(line => {
    const title = line.match(/^[•\-*]\s*([^—\[]+?)(?:\s*[—\[]|$)/)?.[1]?.trim();
    return title ? { title, haystack: line.toLowerCase() } : null;
  }).filter(Boolean) as { title: string; haystack: string }[];
  if (items.length === 0) return null;

  const keywordMap: Record<string, string[]> = {
    a: ["white", "crisp", "light", "sauvignon", "pinot grigio"],
    b: ["chardonnay", "buttery", "rich", "white", "oak"],
    c: ["red", "smooth", "easy", "blend", "merlot", "pinot"],
    d: ["bold", "full", "red", "zinfandel", "zin", "cabernet"],
  };
  const keywords = choice ? keywordMap[choice] || [] : [];
  const scored = items.map(item => ({
    ...item,
    score:
      keywords.reduce((sum, keyword) => sum + (item.haystack.includes(keyword) ? 1 : 0), 0)
      // Strongly prefer single bottles over bundles/packs/cases/clubs in deterministic picks.
      - (/(pack|bundle|case|club|gift\s*set|collection|6\s*pack|12\s*pack)/i.test(item.haystack) ? 5 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.title || items[0].title;
}

function catalogSafeFallback(catalogStr: string, messages: { role: string; content: string }[]): string {
  const choice = latestUserChoice(messages);
  const pick = pickCatalogTitle(catalogStr, choice);
  if (pick && choice) {
    const labels: Record<string, string> = {
      a: "crisp & light white",
      b: "rich & buttery white",
      c: "easy-drinking red",
      d: "bold & full red",
    };
    return `Great — for ${labels[choice]}, I'd pick **${pick}** from our current catalog.\nWhy: it fits that style best and the grapes are Lodi Rules certified sustainable, so it's a feel-good pour that also helps rescue partners.\n\nFollow-ups: Pair it with dinner | Make it a gift | Tell me tasting notes`;
  }
  if (pick) return `I'd pick **${pick}** from our current catalog — closest match to what you shared, and every bottle helps rescue partners.\n\nFollow-ups: What pairs with it? | Show me a gift idea | Try a wine cocktail`;
  return `I want to keep this to wines we actually carry. Quick question — which sounds most like you tonight: (a) crisp & light white, (b) rich & buttery white, (c) easy-drinking red, or (d) bold & full red?\n\nFollow-ups: a | b | c`;
}

function isDirectQuizAnswer(messages: { role: string; content: string }[]): boolean {
  const latest = [...messages].reverse().find(m => m.role === "user")?.content || "";
  const previousAssistant = [...messages].reverse().find(m => m.role === "assistant")?.content || "";
  return /^[\s\(\[]?[abcd][\)\].,!\s]*$/i.test(latest) && /\bquick question\b|\([a-d]\)/i.test(previousAssistant);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    return jsonResponse({ reply: catalogSafeFallback('', []), error: 'AI not configured' });
  }

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || messages.length === 0 || messages.length > 30) {
    return new Response(JSON.stringify({ error: 'messages must be 1-30 entries' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const cleaned = messages
    .filter((m: any) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role))
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
  if (cleaned.length === 0) return jsonResponse({ error: 'no valid messages' }, 400);

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
    ? `\n\nCurrent catalog (the ONLY wines you may recommend):\n${catalogStr.slice(0, 4500)}`
    : `\n\nNOTE: No catalog could be loaded. Do NOT name any specific wines. Ask one quiz-style question instead.`;

  if (catalogStr && isDirectQuizAnswer(cleaned)) {
    return new Response(JSON.stringify({ reply: catalogSafeFallback(catalogStr, cleaned) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'system', content: SYSTEM_PROMPT + catalogContext }, ...cleaned],
      }),
    });
    if (aiRes.status === 429) return jsonResponse({ reply: 'I’m getting a lot of requests right now. Try me again in a moment.\n\nFollow-ups: Pick a bold red | Pair with dinner | Gift bottle' }, 429);
    if (aiRes.status === 402) return jsonResponse({ reply: 'The AI sommelier is temporarily unavailable. I can still help with a simple pick from the current catalog.\n\nFollow-ups: Pick a bold red | Pair with dinner | Gift bottle' }, 402);
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error('AI error', aiRes.status, t);
      return jsonResponse({ reply: catalogSafeFallback(catalogStr, cleaned), error: 'AI request failed' });
    }
    const data = await aiRes.json();
    let reply: string = data?.choices?.[0]?.message?.content ?? '';

    // SAFETY NET: if the model named a wine that isn't in the catalog, replace the reply
    // with a safe fallback. This prevents fabricated SKUs from ever reaching the user.
    if (catalogTitles.length > 0) {
      const offending = extractMentionedTitles(reply, catalogTitles);
      if (offending.length > 0) {
        console.warn('Sommelier named off-catalog wine(s), suppressing:', offending);
        reply = catalogSafeFallback(catalogStr, cleaned);
      }
    }

    return new Response(JSON.stringify({ reply }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('Sommelier exception', e?.message);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), { status: 500, headers: corsHeaders });
  }
});
