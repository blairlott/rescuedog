// Self-optimization autopilot: closes finished experiments and spawns new ones from templates.
// Triggered by pg_cron (every 6h) or manually from /cms/experiments.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

type Variant = {
  id: string;
  key: string;
  exposures: number;
  conversions: number;
  revenue_cents: number;
  config: Record<string, unknown>;
  is_control: boolean;
};

// Approximate Pr(variant is best) via Monte Carlo Beta sampling on conversion rate
// weighted by mean revenue per conversion. Good enough for v1.
function gammaSample(shape: number): number {
  // Marsaglia & Tsang for shape>=1; for shape<1 use boost.
  if (shape < 1) return gammaSample(shape + 1) * Math.pow(Math.random(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number, v: number;
    do {
      x = normalSample();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function normalSample(): number {
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function betaSample(alpha: number, beta: number): number {
  const x = gammaSample(alpha);
  const y = gammaSample(beta);
  return x / (x + y);
}

function probabilityBest(variants: Variant[], samples = 4000): number[] {
  const wins = new Array(variants.length).fill(0);
  for (let s = 0; s < samples; s++) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const alpha = v.conversions + 1;
      const beta = Math.max(1, v.exposures - v.conversions) + 1;
      const cr = betaSample(alpha, beta);
      const aov = v.conversions > 0 ? v.revenue_cents / v.conversions : 0;
      const rpv = cr * aov;
      if (rpv > bestVal) {
        bestVal = rpv;
        bestIdx = i;
      }
    }
    wins[bestIdx]++;
  }
  return wins.map((w) => w / samples);
}

async function sendAlertEmail(supabase: ReturnType<typeof createClient>, summary: string) {
  if (!RESEND_API_KEY) return;
  const { data: state } = await supabase
    .from("autopilot_state")
    .select("alert_email")
    .eq("id", 1)
    .single();
  const to = state?.alert_email || "blair.lott@rescuedogwines.com";
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Rescue Dog Wines <noreply@rescuedogwines.com>",
        to: [to],
        subject: "Autopilot run summary",
        html: `<pre style="font-family:system-ui;white-space:pre-wrap">${summary}</pre>`,
      }),
    });
  } catch (e) {
    console.error("Alert email failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const log: string[] = [];
  try {
    const { data: state } = await supabase
      .from("autopilot_state")
      .select("*")
      .eq("id", 1)
      .single();

    if (!state?.enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const minExposures: number = state.min_exposures_per_arm ?? 100;
    const confidence: number = Number(state.confidence_threshold ?? 0.9);
    const cadenceHours: number = state.cadence_hours ?? 72;

    // 1. Close finished experiments
    const { data: running } = await supabase
      .from("experiments")
      .select("id, key, slot_key, name, experiment_variants(id, key, exposures, conversions, revenue_cents, config, is_control)")
      .eq("status", "running");

    let closed = 0;
    let promoted = 0;
    for (const exp of running ?? []) {
      const variants = (exp.experiment_variants ?? []) as Variant[];
      if (variants.length < 2) continue;
      const minArmExposures = Math.min(...variants.map((v) => v.exposures));
      if (minArmExposures < minExposures) continue;

      const probs = probabilityBest(variants);
      const maxProb = Math.max(...probs);
      const winnerIdx = probs.indexOf(maxProb);
      if (maxProb < confidence) continue;

      const winner = variants[winnerIdx];
      await supabase
        .from("experiments")
        .update({ status: "ended", winner_variant_id: winner.id, ends_at: new Date().toISOString() })
        .eq("id", exp.id);
      closed++;
      promoted++;
      log.push(`Closed ${exp.key}: winner=${winner.key} (p=${maxProb.toFixed(2)})`);
    }

    // 2. Spawn new experiments for slots that need one
    const { data: templates } = await supabase
      .from("experiment_templates")
      .select("*")
      .eq("enabled", true);

    const { data: activeExperiments } = await supabase
      .from("experiments")
      .select("slot_key, created_at, status")
      .in("status", ["running", "draft"]);

    const slotsWithRunning = new Set((activeExperiments ?? []).map((e) => e.slot_key));
    const cadenceMs = cadenceHours * 60 * 60 * 1000;

    // For cadence enforcement: when was the last experiment created per slot?
    const { data: recentBySlot } = await supabase
      .from("experiments")
      .select("slot_key, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    const lastBySlot = new Map<string, number>();
    for (const r of recentBySlot ?? []) {
      if (!lastBySlot.has(r.slot_key)) {
        lastBySlot.set(r.slot_key, new Date(r.created_at).getTime());
      }
    }

    // Pull approved media for image-based slots.
    const { data: approvedMedia } = await supabase
      .from("media_assets")
      .select("id, image_url, alt_text")
      .eq("status", "approved")
      .order("ai_score", { ascending: false, nullsFirst: false })
      .limit(50);

    let spawned = 0;
    for (const tpl of templates ?? []) {
      if (slotsWithRunning.has(tpl.slot_key)) continue;
      const lastAt = lastBySlot.get(tpl.slot_key) ?? 0;
      if (Date.now() - lastAt < cadenceMs) continue;

      const variantConfigs = (tpl.variant_configs as Array<{ key: string; name: string; config: Record<string, unknown> }>) || [];
      if (variantConfigs.length < 2) continue;

      // If template uses media pool and we have approved images, inject up to 3 image variants
      let finalVariants = [...variantConfigs];
      if (tpl.use_media_pool && (approvedMedia?.length ?? 0) > 0) {
        const images = approvedMedia!.slice(0, Math.min(3, approvedMedia!.length));
        finalVariants = variantConfigs.map((v, idx) => {
          const img = images[idx % images.length];
          return {
            ...v,
            config: { ...v.config, imageUrl: img.image_url, alt: img.alt_text ?? "" },
          };
        });
      }

      const expKey = `${tpl.slot_key}_auto_${Date.now().toString(36)}`;
      const { data: newExp, error: expErr } = await supabase
        .from("experiments")
        .insert({
          key: expKey,
          name: `${tpl.name} (auto ${new Date().toISOString().slice(0, 10)})`,
          description: `Auto-spawned by autopilot from template ${tpl.id}.`,
          slot_key: tpl.slot_key,
          status: "running",
          primary_metric: "revenue_per_visitor",
          use_bandit: true,
          starts_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (expErr || !newExp) {
        log.push(`Failed to spawn for ${tpl.slot_key}: ${expErr?.message}`);
        continue;
      }

      const variantRows = finalVariants.map((v, idx) => ({
        experiment_id: newExp.id,
        key: v.key,
        name: v.name,
        config: v.config,
        is_control: idx === 0,
        weight: 1,
      }));
      await supabase.from("experiment_variants").insert(variantRows);
      spawned++;
      log.push(`Spawned ${expKey} with ${variantRows.length} variants`);
    }

    await supabase
      .from("autopilot_state")
      .update({ last_autopilot_run_at: new Date().toISOString() })
      .eq("id", 1);

    const summary = `Autopilot run @ ${new Date().toISOString()}\nClosed: ${closed}\nSpawned: ${spawned}\n\n${log.join("\n")}`;
    if (closed > 0 || spawned > 0) await sendAlertEmail(supabase, summary);

    return new Response(JSON.stringify({ ok: true, closed, spawned, promoted, log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("autopilot error", msg);
    return new Response(JSON.stringify({ ok: false, error: msg, log }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});