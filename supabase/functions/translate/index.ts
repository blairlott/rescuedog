import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPPORTED = new Set(["fr", "es"]);

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { texts, target } = await req.json();
    if (!Array.isArray(texts) || typeof target !== "string" || !SUPPORTED.has(target)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleaned = Array.from(new Set(
      (texts as unknown[])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length < 2000)
    )).slice(0, 100);

    if (cleaned.length === 0) {
      return new Response(JSON.stringify({ translations: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Hash all sources and look up cache
    const hashes = await Promise.all(cleaned.map((t) => sha256(t)));
    const hashToText = new Map<string, string>();
    cleaned.forEach((t, i) => hashToText.set(hashes[i], t));

    const { data: cached } = await supabase
      .from("auto_translations")
      .select("source_hash, translated_text")
      .eq("lang", target)
      .in("source_hash", hashes);

    const result: Record<string, string> = {};
    const cachedSet = new Set<string>();
    for (const row of cached ?? []) {
      const src = hashToText.get(row.source_hash);
      if (src) {
        result[src] = row.translated_text;
        cachedSet.add(row.source_hash);
      }
    }

    const missingHashes = hashes.filter((h) => !cachedSet.has(h));
    const missingTexts = missingHashes.map((h) => hashToText.get(h)!).filter(Boolean);

    if (missingTexts.length > 0) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const langName = target === "fr" ? "French" : "Spanish";
      const sysPrompt = `You are a professional translator. Translate each English string to ${langName}. Preserve meaning, tone, brand names, product names, punctuation, and casing style. Do NOT translate brand names like "Rescue Dog Wines", "Vinoshipper", "Lovable". Return ONLY a JSON array of translated strings in the same order, no commentary.`;
      const userPrompt = JSON.stringify(missingTexts);

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!aiResp.ok) {
        const text = await aiResp.text();
        console.error("AI gateway error", aiResp.status, text);
        throw new Error(`AI error ${aiResp.status}`);
      }

      const aiJson = await aiResp.json();
      const raw = aiJson?.choices?.[0]?.message?.content ?? "";
      let translated: string[] = [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) translated = parsed;
        else if (Array.isArray(parsed?.translations)) translated = parsed.translations;
        else if (Array.isArray(parsed?.result)) translated = parsed.result;
        else {
          // Fallback: take first array property
          for (const v of Object.values(parsed)) {
            if (Array.isArray(v)) { translated = v as string[]; break; }
          }
        }
      } catch (e) {
        console.error("Failed to parse AI JSON", raw);
      }

      const rowsToInsert: { source_hash: string; source_text: string; lang: string; translated_text: string }[] = [];
      missingTexts.forEach((src, i) => {
        const t = typeof translated[i] === "string" ? translated[i] : src;
        result[src] = t;
        rowsToInsert.push({
          source_hash: missingHashes[i],
          source_text: src,
          lang: target,
          translated_text: t,
        });
      });

      if (rowsToInsert.length > 0) {
        const { error: insErr } = await supabase
          .from("auto_translations")
          .upsert(rowsToInsert, { onConflict: "source_hash,lang", ignoreDuplicates: true });
        if (insErr) console.error("Cache write error", insErr);
      }
    }

    return new Response(JSON.stringify({ translations: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});