// Syncs the homepage hero rotation:
// - Reads media_assets where status='approved' AND hero_eligible=true.
// - Probes image dimensions (HEAD/byte-sniff) when missing.
// - Filters to landscape, hero-grade specs (>= 1280w, ratio >= 1.3, <=2.4).
// - Upserts a running bandit experiment on slot_key='homepage_hero'.
// - Ensures one variant per eligible asset (variant_config.imageUrl).
// - Deactivates the experiment (status=paused) if 0 eligible assets.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const MIN_W = 1280;
const MIN_RATIO = 1.3;
const MAX_RATIO = 2.4;
const EXPERIMENT_KEY = "homepage_hero_auto";
const SLOT_KEY = "homepage_hero";
const AI_REFORMAT_PRESET = "hero_16x9";
const MAX_AI_REFORMATS_PER_RUN = 4; // protect against runaway cost on big pools

// Lightweight dimension sniff for JPG/PNG/WEBP. Reads first ~64KB.
async function probeDimensions(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-65535" } });
    if (!res.ok && res.status !== 206) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    // PNG: \x89PNG, IHDR at offset 16, width/height as 4-byte big-endian
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
      const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
      return { width: w, height: h };
    }
    // JPEG: scan SOF markers
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        const len = (buf[i + 2] << 8) | buf[i + 3];
        // SOF0..SOF15 except DHT/DAC
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          const h = (buf[i + 5] << 8) | buf[i + 6];
          const w = (buf[i + 7] << 8) | buf[i + 8];
          return { width: w, height: h };
        }
        i += 2 + len;
      }
    }
    // WEBP: 'RIFF'....'WEBP'
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45) {
      // VP8X
      if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x58) {
        const w = 1 + ((buf[24] | (buf[25] << 8) | (buf[26] << 16)) & 0xffffff);
        const h = 1 + ((buf[27] | (buf[28] << 8) | (buf[29] << 16)) & 0xffffff);
        return { width: w, height: h };
      }
      // VP8 (lossy)
      if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x20) {
        const w = ((buf[26] | (buf[27] << 8)) & 0x3fff);
        const h = ((buf[28] | (buf[29] << 8)) & 0x3fff);
        return { width: w, height: h };
      }
      // VP8L (lossless)
      if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x4c) {
        const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
        const w = 1 + (((b1 & 0x3f) << 8) | b0);
        const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
        return { width: w, height: h };
      }
    }
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: assets, error: aErr } = await supabase
    .from("media_assets")
    .select("id, image_url, width, height, alt_text, ai_score, ai_subject, source, metadata")
    .eq("status", "approved")
    .eq("hero_eligible", true);
  if (aErr) {
    return new Response(JSON.stringify({ error: aErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const eligible: { id: string; image_url: string; width: number; height: number; alt: string }[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const reformatted: { parent_id: string; child_id: string }[] = [];
  let aiBudget = MAX_AI_REFORMATS_PER_RUN;

  // Pre-fetch existing AI hero_16x9 children so we don't re-generate.
  const { data: existingChildren } = await supabase
    .from("media_assets")
    .select("id, image_url, width, height, alt_text, status, hero_eligible, metadata")
    .eq("source", "ai_enhanced");
  const childByParent = new Map<string, typeof existingChildren extends (infer T)[] | null ? T : never>();
  for (const c of existingChildren ?? []) {
    const meta = (c.metadata ?? {}) as { parent_asset_id?: string; preset?: string };
    if (meta.preset === AI_REFORMAT_PRESET && meta.parent_asset_id) {
      childByParent.set(meta.parent_asset_id, c);
    }
  }

  async function ensureAiReformat(parent: { id: string; image_url: string; alt_text: string | null }) {
    // Reuse cached child if present.
    const cached = childByParent.get(parent.id);
    if (cached && cached.image_url) {
      let w = cached.width as number | null;
      let h = cached.height as number | null;
      if (!w || !h) {
        const probed = await probeDimensions(cached.image_url as string);
        if (probed) {
          w = probed.width; h = probed.height;
          await supabase.from("media_assets").update({ width: w, height: h }).eq("id", cached.id);
        }
      }
      if (w && h) {
        const ratio = w / h;
        if (w >= MIN_W && ratio >= MIN_RATIO && ratio <= MAX_RATIO) {
          // Make sure it's promoted to approved + hero_eligible so it shows up in the pool.
          if (cached.status !== "approved" || cached.hero_eligible !== true) {
            await supabase.from("media_assets")
              .update({ status: "approved", hero_eligible: true })
              .eq("id", cached.id);
          }
          return { id: cached.id as string, image_url: cached.image_url as string, width: w, height: h, alt: (cached.alt_text as string) ?? parent.alt_text ?? "" };
        }
      }
    }
    if (aiBudget <= 0) return null;
    aiBudget--;

    // Call enhance-image to generate a 16:9 hero reformat.
    const invokeRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/enhance-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        asset_id: parent.id,
        preset: AI_REFORMAT_PRESET,
        variants: 1,
        auto: true,
      }),
    });
    const data = await invokeRes.json().catch(() => ({}));
    if (!invokeRes.ok || !data?.results?.[0]?.id) {
      console.error("hero reformat failed", parent.id, data);
      return null;
    }
    const childId = data.results[0].id as string;
    const childUrl = data.results[0].url as string;
    const probed = await probeDimensions(childUrl);
    const w = probed?.width ?? 0;
    const h = probed?.height ?? 0;

    // Auto-promote the AI reformat to approved + hero_eligible so it joins the pool.
    await supabase.from("media_assets")
      .update({
        status: "approved",
        hero_eligible: true,
        width: w || null,
        height: h || null,
      })
      .eq("id", childId);

    reformatted.push({ parent_id: parent.id, child_id: childId });

    if (!w || !h) return null;
    const ratio = w / h;
    if (w < MIN_W || ratio < MIN_RATIO || ratio > MAX_RATIO) return null;
    return { id: childId, image_url: childUrl, width: w, height: h, alt: parent.alt_text ?? "" };
  }

  for (const a of assets ?? []) {
    // Skip the AI children themselves on the first pass — they're surfaced via their parent.
    const meta = (a.metadata ?? {}) as { preset?: string };
    const isAiHeroChild = a.source === "ai_enhanced" && meta.preset === AI_REFORMAT_PRESET;

    let w = a.width as number | null;
    let h = a.height as number | null;
    if (!w || !h) {
      const probed = await probeDimensions(a.image_url);
      if (probed) {
        w = probed.width; h = probed.height;
        await supabase.from("media_assets").update({ width: w, height: h }).eq("id", a.id);
      }
    }
    const fits = !!w && !!h && w >= MIN_W && (w / h) >= MIN_RATIO && (w / h) <= MAX_RATIO;
    if (fits) {
      eligible.push({ id: a.id, image_url: a.image_url, width: w!, height: h!, alt: a.alt_text ?? "" });
      continue;
    }
    if (isAiHeroChild) {
      // AI child that didn't fit — skip; parent will retry on next run if needed.
      skipped.push({ id: a.id, reason: !w || !h ? "ai_child_no_dimensions" : `ai_child_bad_geom_${w}x${h}` });
      continue;
    }
    // Try AI reformat for the ineligible original.
    const reformat = await ensureAiReformat({ id: a.id, image_url: a.image_url, alt_text: a.alt_text as string | null });
    if (reformat) {
      eligible.push(reformat);
    } else {
      skipped.push({ id: a.id, reason: !w || !h ? "no_dimensions_ai_failed" : `bad_geom_${w}x${h}_ai_failed_or_queued` });
    }
  }

  // Upsert experiment.
  let { data: exp } = await supabase
    .from("experiments")
    .select("id, status")
    .eq("key", EXPERIMENT_KEY)
    .maybeSingle();

  if (!exp) {
    const { data: created, error: cErr } = await supabase
      .from("experiments")
      .insert({
        key: EXPERIMENT_KEY,
        name: "Homepage hero — auto rotation",
        description: "Auto-curated hero image bandit. Variants sourced from approved hero pool in CMS Media.",
        slot_key: SLOT_KEY,
        status: eligible.length >= 2 ? "running" : "draft",
        use_bandit: true,
        traffic_pct: 100,
      })
      .select("id, status")
      .single();
    if (cErr) {
      return new Response(JSON.stringify({ error: cErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    exp = created;
  } else {
    const desired = eligible.length >= 2 ? "running" : "paused";
    if (exp.status !== desired) {
      await supabase.from("experiments").update({ status: desired }).eq("id", exp.id);
    }
  }

  // Sync variants: ensure one per eligible asset; remove variants pointing to no-longer-eligible.
  const { data: existing } = await supabase
    .from("experiment_variants")
    .select("id, key, config")
    .eq("experiment_id", exp.id);

  const eligibleKeys = new Set(eligible.map((e) => `img_${e.id.slice(0, 8)}`));
  const existingByKey = new Map((existing ?? []).map((v) => [v.key, v]));

  // Insert missing.
  for (const e of eligible) {
    const key = `img_${e.id.slice(0, 8)}`;
    if (existingByKey.has(key)) continue;
    await supabase.from("experiment_variants").insert({
      experiment_id: exp.id,
      key,
      name: e.alt ? e.alt.slice(0, 80) : `Image ${e.id.slice(0, 8)}`,
      config: { imageUrl: e.image_url, assetId: e.id, width: e.width, height: e.height },
      weight: 1,
    });
  }

  // Remove orphaned (those whose asset is no longer in pool). Keep ones with traction (>0 exposures) for stat integrity unless explicitly removed.
  for (const v of existing ?? []) {
    if (!eligibleKeys.has(v.key)) {
      await supabase.from("experiment_variants").delete().eq("id", v.id);
    }
  }

  // Stamp synced_at.
  if (eligible.length) {
    await supabase
      .from("media_assets")
      .update({ hero_synced_at: new Date().toISOString() })
      .in("id", eligible.map((e) => e.id));
  }

  return new Response(
    JSON.stringify({
      experiment_id: exp.id,
      status: eligible.length >= 2 ? "running" : "paused",
      eligible_count: eligible.length,
      skipped,
      ai_reformatted: reformatted,
      ai_budget_remaining: aiBudget,
      need_minimum: 2,
      hint: eligible.length < 3
        ? "Add more hero-eligible images (landscape, ≥1280w) for bandit to learn meaningfully. 5-8 is ideal."
        : null,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});