// Seeds backdated SEO gap-fill drafts into content_index (is_public=false).
// Uses Lovable AI Gateway (google/gemini-2.5-pro) to expand a topic outline
// into a publish-ready ~900-word draft, then runs the 7-rule compliance
// checker. Failing drafts are still saved (so Blair can review) but
// `raw.compliance_failures` records which rules tripped.
//
// Admin-only. Defaults to the 20-topic v1 list spread over the last 24 months.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Topic = {
  title: string;
  slug: string;
  target_keyword: string;
  tags: string[];
  outline: string[];
};

const DEFAULT_TOPICS: Topic[] = [
  { title: "The Wine That Helps Dogs Find Their Forever Home", slug: "wine-that-gives-back-rescue-dogs", target_keyword: "wine that gives back", tags: ["mission", "rescue", "gift"], outline: ["Who RDW partners with", "How a bottle supports a rescue partner", "Featured rescue partners", "How to start"] },
  { title: "The Best Wine Gifts for Dog Lovers in 2024", slug: "best-wine-gifts-for-dog-lovers", target_keyword: "best wine gifts for dog lovers", tags: ["gift", "dog lover", "holiday"], outline: ["Why pair wine with the rescue mission", "Sampler ideas", "Adoptable-dog labels", "Shipping notes (adult signature, 21+)"] },
  { title: "Rescue Dog Wine Gift Guide for Adopters", slug: "rescue-dog-wine-gift-guide", target_keyword: "rescue dog wine gift", tags: ["gift", "adopter"], outline: ["What to give a new adopter", "Curated bottles", "Mission framing", "Order timing"] },
  { title: "Lodi, CA Wine: Why Our Estate Calls This Region Home", slug: "lodi-ca-wine-region", target_keyword: "Lodi CA wine", tags: ["region", "estate", "education"], outline: ["What makes Lodi distinct", "Old-vine zinfandel heritage", "Our Lodi growers", "Why Lodi for a rescue brand"] },
  { title: "A Dog Mom's Wine Night: Curating the Pour", slug: "dog-mom-wine-night", target_keyword: "dog mom wine", tags: ["lifestyle", "dog mom"], outline: ["The dog mom vibe", "Three pairings", "Set the scene", "Rescue partner spotlight"] },
  { title: "Old Vine Zinfandel: Why Age Matters in Every Glass", slug: "old-vine-zinfandel-explained", target_keyword: "old vine zinfandel", tags: ["education", "varietal"], outline: ["Defining old vine", "Lodi old-vine sites", "Flavor profile", "Bottles to try"] },
  { title: "Choosing a Wine Club That Actually Means Something", slug: "wine-club-that-gives-back", target_keyword: "wine club that gives back", tags: ["wine club", "mission"], outline: ["What to evaluate in a club", "How The Pack works", "Cadence options", "Member pricing"] },
  { title: "Wine Pairings for Comfort-Food Nights at Home", slug: "wine-pairings-comfort-food", target_keyword: "wine pairings comfort food", tags: ["pairing", "lifestyle"], outline: ["Pasta + zin", "Pizza + sauvignon blanc", "Burgers + cab", "Soup + chardonnay"] },
  { title: "Wedding-Ready Wines with a Cause", slug: "wedding-wines-with-a-cause", target_keyword: "wedding wines that give back", tags: ["wedding", "event"], outline: ["Why couples are choosing mission brands", "Case math for receptions", "Custom labels", "Lead time"] },
  { title: "Corporate Gifting: Wine That Tells Your Values", slug: "corporate-wine-gifts-mission", target_keyword: "corporate wine gifts", tags: ["corporate", "gift"], outline: ["Why mission-driven gifting lands", "Sampler options", "Bulk fulfillment", "Compliance & state rules"] },
  { title: "How a Wine Sampler Works (and Why to Start There)", slug: "wine-sampler-guide", target_keyword: "wine sampler", tags: ["product", "explainer"], outline: ["What a sampler includes", "Best for new customers", "Pricing math", "Upgrade path to The Pack"] },
  { title: "Cabernet Sauvignon from California: A Beginner's Map", slug: "california-cabernet-beginner", target_keyword: "California Cabernet", tags: ["education", "varietal", "California"], outline: ["What defines CA cab", "Regional differences", "Our cab", "Pairings"] },
  { title: "Pinot Noir for People Who Don't Love Pinot Noir", slug: "pinot-noir-for-skeptics", target_keyword: "Pinot Noir beginner", tags: ["education", "varietal"], outline: ["Common pinot misconceptions", "Styles & temperatures", "Food pairings", "Our pour"] },
  { title: "Inside an RDW Rescue Partner: A Day at the Shelter", slug: "rescue-partner-day-in-life", target_keyword: "rescue partner spotlight", tags: ["rescue", "story"], outline: ["Morning intake", "Adoption events", "What the partnership covers", "How to support"] },
  { title: "Bring Your Dog to the Vineyard: Lodi Edition", slug: "dog-friendly-vineyards-lodi", target_keyword: "dog friendly vineyards Lodi", tags: ["travel", "lifestyle", "Lodi"], outline: ["Dog-friendly tasting rooms", "Etiquette", "Where to stay", "Plan your trip"] },
  { title: "Wine Bottle Labels with Real Adoptable Dogs", slug: "adoptable-dog-wine-labels", target_keyword: "adoptable dog wine label", tags: ["product", "mission"], outline: ["How a dog gets featured", "The QR-to-adoption flow", "Featured labels", "Success stories"] },
  { title: "A Practical Guide to Wine Shipping in the U.S.", slug: "wine-shipping-guide-us", target_keyword: "wine shipping rules", tags: ["explainer", "compliance"], outline: ["Adult signature 21+", "Weather holds", "State restrictions", "Tracking your order"] },
  { title: "Holiday Wine Gift Ideas That Don't Feel Generic", slug: "holiday-wine-gift-ideas", target_keyword: "holiday wine gift ideas", tags: ["gift", "holiday"], outline: ["Beyond a bottle in a bag", "Sampler picks", "Personalization", "Shipping cutoffs"] },
  { title: "Why We Pour Sustainable: Lodi's Lodi Rules Certification", slug: "lodi-rules-sustainable-wine", target_keyword: "sustainable wine Lodi", tags: ["sustainability", "Lodi"], outline: ["What Lodi Rules certification covers", "Why it matters in your glass", "Our growers", "Future plans"] },
  { title: "Adopting an Adult Dog: What a New Pour Taught Us", slug: "adopting-adult-dog-story", target_keyword: "adopting an adult dog", tags: ["adoption", "story"], outline: ["Why adult dogs get overlooked", "What the transition looks like", "Resources & rescue partners", "How to start"] },
];

// 7-rule compliance check. Returns failures array (empty = pass).
function complianceCheck(text: string): string[] {
  const fail: string[] = [];
  if (/free\s+shipping/i.test(text)) fail.push("R1_free_shipping");
  // R2: quantified impact (excluding allowlisted "225 rescue organizations" phrase)
  const sanitized = text.replace(/partnered with 225 rescue organizations/gi, "");
  if (/\d[\d,]*\s*(homes|dogs|meals|bottles|rescues)\s*(funded|saved|served|donated|placed)/i.test(sanitized)) fail.push("R2_quantified_impact");
  // R3: percent-off in loyalty/rewards/pack context
  const loyaltyCtx = /(the pack|pack member|loyalty|rewards?|referral|refer a friend)[^.]*\b\d+%\s*(off|discount)\b/i;
  const reverseCtx = /\b\d+%\s*(off|discount)\b[^.]*(the pack|pack member|loyalty|rewards?|referral|refer a friend)/i;
  if (loyaltyCtx.test(text) || reverseCtx.test(text)) fail.push("R3_percent_off_loyalty");
  if (/(donates?|gives?)\s+a\s+portion\s+of\s+every\s+bottle/i.test(text)) fail.push("R4_portion_of_every_bottle");
  // R5: wine context without age cue (soft — warn only if completely absent)
  if (/\b(wine|bottle|tasting)\b/i.test(text) && !/21\+|adult signature|age verification|must be 21/i.test(text)) {
    fail.push("R5_missing_age_cue");
  }
  if (/(checkout|pay for|buy)\s+(wine|bottle)s?\s+(on|at|with)\s+(our site|rdw|rescue dog wines?)/i.test(text)) fail.push("R6_wine_checkout_language");
  if (/(refer\s+a\s+friend|referral\s+code|earn\s+points|points?\s+balance|rewards?\s+program)/i.test(text)) fail.push("R7_rewards_referrals_off");
  return fail;
}

async function draftViaLovableAI(topic: Topic): Promise<{ body_html: string; excerpt: string }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const prompt = `You are writing a blog draft for Rescue Dog Wines (RDW), a Lodi, CA winery whose mission is helping dogs find their forever home.

STRICT RULES:
- Never say "free shipping" — say "shipping included" when relevant.
- Never quantify impact (no "X dogs saved", "Y meals funded"). The ONLY allowed quantified claim is the exact phrase "Partnered with 225 rescue organizations".
- Never write "donates a portion of every bottle" — use mission framing instead.
- Mention 21+/adult signature when describing wine purchase or shipping.
- Never say customers "buy wine on our site" — wine orders complete with our shipping partner Vinoshipper.
- Do NOT mention referrals, rewards programs, points, or "refer a friend" (disabled for launch).
- Loyalty (The Pack) is access-based, never described as "% off".
- Tone: warm, plain, no superlatives. Around 800-950 words. Use H2/H3 subheads.

TITLE: ${topic.title}
TARGET KEYWORD: ${topic.target_keyword}
OUTLINE:
${topic.outline.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Return JSON: { "excerpt": "1-2 sentence meta description under 160 chars", "body_html": "<p>...</p> with <h2>, <h3>, <p>, <ul><li> only" }`;

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`AI gateway ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);
  return { body_html: parsed.body_html ?? "", excerpt: parsed.excerpt ?? "" };
}

// Generate a cover image via Gemini image model and upload to blog-media.
// Returns the public URL or null on any failure (non-fatal).
async function generateCoverImage(topic: Topic, supabase: any): Promise<string | null> {
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return null;
    const imagePrompt = `Editorial photograph for a Lodi, California winery blog post titled "${topic.title}". Warm natural light, shallow depth of field, no text overlays, no people's faces visible, no logos. Subject: ${topic.tags.join(", ")}. Mood: warm, grounded, mission-driven. Wide 16:9 aspect, magazine-quality.`;
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: imagePrompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    // Gemini image responses return base64 in choices[0].message.images[0].image_url.url (data URI)
    const imgUrl: string | undefined =
      j?.choices?.[0]?.message?.images?.[0]?.image_url?.url ??
      j?.choices?.[0]?.message?.images?.[0]?.url;
    if (!imgUrl) return null;
    const m = imgUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!m) return null;
    const mime = m[1];
    const ext = mime.split("/")[1] || "png";
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const path = `seo-seed/${topic.slug}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("blog-media").upload(path, bytes, {
      contentType: mime, upsert: true,
    });
    if (error) return null;
    const { data } = supabase.storage.from("blog-media").getPublicUrl(path);
    return data.publicUrl ?? null;
  } catch { return null; }
}

// Spread N topics naturally across the last 24 months. Avoid identical days.
function backdate(index: number, total: number): string {
  const monthsBack = Math.floor((index / total) * 23) + 1; // 1..24
  const jitterDays = (index * 7 + 3) % 27;
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - monthsBack);
  d.setUTCDate(jitterDays + 1);
  d.setUTCHours(13 + (index % 6), (index * 11) % 60, 0, 0);
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
  const { data: isOwner } = await supabase.rpc("has_role", { _user_id: user.id, _role: "owner" });
  if (!isAdmin && !isOwner) {
    return new Response(JSON.stringify({ error: "admin required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const topics: Topic[] = Array.isArray(body.topics) && body.topics.length ? body.topics : DEFAULT_TOPICS;
  const dryRun: boolean = !!body.dry_run;
  const skipImages: boolean = !!body.skip_images;

  const results: any[] = [];
  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    try {
      const { body_html, excerpt } = await draftViaLovableAI(t);
      const plain = (body_html + " " + (excerpt || "") + " " + t.title).replace(/<[^>]+>/g, " ");
      const failures = complianceCheck(plain);
      const publishedAt = backdate(i, topics.length);
      const cover = skipImages ? null : await generateCoverImage(t, supabase);

      const row = {
        source: "rdw-seed",
        external_id: `seo-seed:${t.slug}`,
        slug: t.slug,
        type: "post",
        title: t.title,
        excerpt,
        body_html,
        cover_image_url: cover,
        author: "Rescue Dog Wines",
        tags: t.tags,
        published_at: publishedAt,
        is_public: false, // always draft; Blair approves
        raw: {
          target_keyword: t.target_keyword,
          outline: t.outline,
          compliance_failures: failures,
          model: "google/gemini-2.5-pro",
          generated_at: new Date().toISOString(),
        },
        synced_at: new Date().toISOString(),
      };

      if (dryRun) {
        results.push({ slug: t.slug, ok: true, failures, dry_run: true });
        continue;
      }

      const { error } = await supabase.from("content_index").upsert(row, { onConflict: "source,slug" });
      if (error) { results.push({ slug: t.slug, ok: false, error: error.message }); continue; }
      results.push({ slug: t.slug, ok: true, failures, published_at: publishedAt });
    } catch (e: any) {
      results.push({ slug: t.slug, ok: false, error: e?.message ?? String(e) });
    }
  }

  const passed = results.filter((r) => r.ok && (!r.failures || r.failures.length === 0)).length;
  const flagged = results.filter((r) => r.ok && r.failures?.length > 0).length;
  const failed = results.filter((r) => !r.ok).length;

  return new Response(JSON.stringify({
    total: topics.length,
    drafts_created: results.filter((r) => r.ok).length,
    passed_compliance: passed,
    flagged_compliance: flagged,
    failed,
    dry_run: dryRun,
    results,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});