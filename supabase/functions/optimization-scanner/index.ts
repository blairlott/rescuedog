import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

type Category =
  | "hero_copy"
  | "hero_image"
  | "cart_upsell"
  | "pricing"
  | "bundle"
  | "merch_copy"
  | "other";

type Opportunity = {
  category: Category;
  goal: "conversion" | "aov" | "both";
  surface?: string | null;
  title: string;
  rationale: string;
  proposed_change: Record<string, unknown>;
  supporting_metrics: Record<string, unknown>;
  confidence: number;
  est_lift_pct?: number;
};

/**
 * Conversion + AOV self-review.
 *
 * Reads recent hero variant performance and (when available) order totals,
 * proposes opportunities to (a) sticky/retire hero variants, (b) raise free-
 * shipping threshold for AOV, (c) add cart upsells, and writes them to
 * `optimization_opportunities`. If `optimization_settings.autonomous` is on
 * for a category AND the proposal's confidence clears the per-category bar,
 * the proposal is auto-applied (currently: hero sticky/retire only — other
 * categories remain manual until executors are wired).
 */
async function scan(supabase: any): Promise<Opportunity[]> {
  const out: Opportunity[] = [];

  // ---- Hero variant performance (conversion) ----
  try {
    const { data: stats } = await supabase.rpc("get_hero_variant_stats", {
      _days: 14,
    });
    const rows: any[] = Array.isArray(stats) ? stats : [];
    for (const r of rows) {
      const imp = Number(r.impressions ?? 0);
      const clicks = Number(r.clicks ?? 0);
      const ctr = imp > 0 ? clicks / imp : 0;
      if (imp < 500) continue;

      if (ctr >= 0.06 && !r.sticky) {
        out.push({
          category: "hero_image",
          goal: "conversion",
          surface: r.surface,
          title: `Sticky winner: "${(r.eyebrow ?? r.headline_html ?? r.variant_id).toString().slice(0, 60)}"`,
          rationale: `Variant has ${imp.toLocaleString()} impressions and a ${(ctr * 100).toFixed(2)}% CTR over the last 14 days — well above the 4% house average.`,
          proposed_change: { action: "set_sticky", variant_id: r.variant_id, sticky: true },
          supporting_metrics: { impressions: imp, clicks, ctr },
          confidence: 0.85,
          est_lift_pct: Math.min(15, (ctr - 0.04) * 100 * 2),
        });
      }
      if (ctr < 0.015 && imp >= 1500) {
        out.push({
          category: "hero_image",
          goal: "conversion",
          surface: r.surface,
          title: `Retire underperformer: "${(r.eyebrow ?? r.headline_html ?? r.variant_id).toString().slice(0, 60)}"`,
          rationale: `Variant has ${imp.toLocaleString()} impressions but only a ${(ctr * 100).toFixed(2)}% CTR — well below house average.`,
          proposed_change: { action: "retire", variant_id: r.variant_id, status: "retired" },
          supporting_metrics: { impressions: imp, clicks, ctr },
          confidence: 0.8,
          est_lift_pct: 3,
        });
      }
    }
  } catch (e) {
    console.warn("hero stats scan failed", e);
  }

  // ---- AOV: free-shipping threshold tuning ----
  try {
    const { data: aov } = await supabase
      .from("orders")
      .select("total_amount,created_at")
      .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString())
      .limit(1000);
    const totals = (aov ?? []).map((o: any) => Number(o.total_amount)).filter((n: number) => n > 0);
    if (totals.length >= 30) {
      const mean = totals.reduce((a: number, b: number) => a + b, 0) / totals.length;
      const sorted = [...totals].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      // Suggest raising threshold to ~10% above current median for AOV lift
      const suggested = Math.ceil((median * 1.1) / 5) * 5;
      out.push({
        category: "cart_upsell",
        goal: "aov",
        surface: "wine",
        title: `Tune shipping-included threshold toward $${suggested}`,
        rationale: `Last-30-day median order is $${median.toFixed(0)} (mean $${mean.toFixed(0)}). Setting the shipping-included threshold ~10% above median historically lifts AOV without hurting conversion.`,
        proposed_change: { action: "set_cart_setting", key: "free_shipping_threshold", value: suggested },
        supporting_metrics: { median, mean, sample: totals.length },
        confidence: 0.7,
        est_lift_pct: 4,
      });
    }
  } catch (e) {
    console.warn("aov scan failed", e);
  }

  return out;
}

async function persistAndMaybeAutoApply(supabase: any, opps: Opportunity[]) {
  if (!opps.length) return { inserted: 0, auto_applied: 0 };
  const { data: settings } = await supabase
    .from("optimization_settings")
    .select("category,autonomous,min_confidence");
  const settingsMap = new Map(
    (settings ?? []).map((s: any) => [s.category, s]),
  );

  let inserted = 0;
  let autoApplied = 0;

  for (const opp of opps) {
    const setting: any = settingsMap.get(opp.category);
    const canAuto =
      !!setting?.autonomous &&
      opp.confidence >= Number(setting?.min_confidence ?? 0.7);

    let status: "pending" | "applied" = "pending";
    let appliedRef: string | null = null;
    let autoFlag = false;

    if (canAuto && opp.category === "hero_image") {
      const change = opp.proposed_change as any;
      if (change.action === "set_sticky" && change.variant_id) {
        const { error } = await supabase
          .from("hero_variants")
          .update({ sticky: true })
          .eq("id", change.variant_id);
        if (!error) { status = "applied"; appliedRef = change.variant_id; autoFlag = true; autoApplied++; }
      } else if (change.action === "retire" && change.variant_id) {
        const { error } = await supabase
          .from("hero_variants")
          .update({ status: "retired" })
          .eq("id", change.variant_id);
        if (!error) { status = "applied"; appliedRef = change.variant_id; autoFlag = true; autoApplied++; }
      }
    }

    const { error: insErr } = await supabase
      .from("optimization_opportunities")
      .insert({
        category: opp.category,
        goal: opp.goal,
        surface: opp.surface ?? null,
        title: opp.title,
        rationale: opp.rationale,
        proposed_change: opp.proposed_change,
        supporting_metrics: opp.supporting_metrics,
        confidence: opp.confidence,
        est_lift_pct: opp.est_lift_pct ?? null,
        status,
        auto_applied: autoFlag,
        applied_ref: appliedRef,
        applied_at: status === "applied" ? new Date().toISOString() : null,
      });
    if (!insErr) inserted++;
  }

  return { inserted, auto_applied: autoApplied };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const cronHeader = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
  const isCron =
    (!!CRON_SECRET && cronHeader === CRON_SECRET) ||
    (!!authHeader && authHeader === SERVICE_KEY);

  if (!isCron) {
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${authHeader}` } },
    });
    const { data: ures } = await userClient.auth.getUser();
    if (!ures?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleOk } = await supabase.rpc("is_admin_or_owner", { _user_id: ures.user.id });
    if (!roleOk) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const opps = await scan(supabase);
    const summary = await persistAndMaybeAutoApply(supabase, opps);
    return new Response(JSON.stringify({ ok: true, found: opps.length, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});