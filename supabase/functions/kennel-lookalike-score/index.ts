// kennel-lookalike-score
// Weekly LLM-based lookalike scorer.
// - Pulls paid DTC buyers (vs_transactions, excluding WINE_CLUB + WHOLESALE) -> positive class.
// - Pulls vs_abandoned_carts whose buyer_email isn't a buyer -> prospects to score.
// - Summarizes buyer features (means, top states) and asks Lovable AI (Gemini 2.5 Pro)
//   to score each prospect on 0-1 conversion probability via tool calling.
// - Upserts kennel_lookalike_scores(email, score, scored_at, model_version).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIER_1 = new Set(["CA","TX","FL","NY","WA","CO","IL","GA"]);
const TIER_3 = new Set(["MT","WY","ND","SD","ID","AK"]);
const stateWeight = (st?: string | null) => {
  if (!st) return 1.0;
  const s = st.trim().toUpperCase();
  if (TIER_1.has(s)) return 1.2;
  if (TIER_3.has(s)) return 0.8;
  return 1.0;
};

const MODEL = "google/gemini-2.5-pro";
const MODEL_VERSION = "lovable-gemini-v1";
const BATCH_SIZE = 200;
const PROSPECT_CAP = 10000;
const PARALLEL = 3;

interface ProspectFeatures {
  email: string;
  cart_value_cents: number;
  state_weight: number;
  state: string | null;
}

function normEmail(e: unknown): string | null {
  if (typeof e !== "string") return null;
  const t = e.trim().toLowerCase();
  return t.length > 3 && t.includes("@") ? t : null;
}

async function scoreBatch(buyerProfile: string, batch: ProspectFeatures[], apiKey: string): Promise<Record<string, number>> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a lookalike scoring model for a DTC wine brand (Rescue Dog Wines). " +
            "Given confirmed buyers (positive class) and prospects (abandoned carts), " +
            "return a probability 0-1 that each prospect would convert to a paid buyer. " +
            "Use cart value, state tier weighting, and how closely the prospect matches the buyer profile. " +
            "Output ONLY via the score_prospects tool.",
        },
        {
          role: "user",
          content:
            `BUYER PROFILE (positive class):\n${buyerProfile}\n\n` +
            `PROSPECTS TO SCORE (${batch.length}):\n` +
            batch
              .map(
                (p, i) =>
                  `${i + 1}. email=${p.email} | cart_value_cents=${p.cart_value_cents} | state=${p.state ?? "?"} | state_weight=${p.state_weight}`,
              )
              .join("\n"),
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "score_prospects",
            description: "Return a score 0-1 per prospect email.",
            parameters: {
              type: "object",
              properties: {
                scores: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { email: { type: "string" }, score: { type: "number" } },
                    required: ["email", "score"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["scores"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "score_prospects" } },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI gateway ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("no tool call in response");
  const parsed = JSON.parse(args);
  const out: Record<string, number> = {};
  for (const r of parsed.scores ?? []) {
    const e = normEmail(r.email);
    const s = Number(r.score);
    if (e && Number.isFinite(s)) out[e] = Math.max(0, Math.min(1, s));
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // 1) Pull buyers (paged because Supabase caps PostgREST at 1000).
    const buyerMap = new Map<string, { orders: number; totalCents: number; firstAt: string | null; bottles: number; state: string | null }>();
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await admin
          .from("vs_transactions")
          .select("customer_email,order_total,transaction_date,customer_state,bottles,order_type")
          .not("customer_email", "is", null)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        for (const r of data) {
          const ot = String(r.order_type ?? "").toUpperCase();
          if (ot === "WINE_CLUB" || ot === "WHOLESALE") continue;
          const email = normEmail(r.customer_email);
          if (!email) continue;
          const cents = Math.round((Number(r.order_total) || 0) * 100);
          const ex = buyerMap.get(email);
          if (ex) {
            ex.orders += 1;
            ex.totalCents += cents;
            ex.bottles += Number(r.bottles) || 0;
            if (r.transaction_date && (!ex.firstAt || r.transaction_date < ex.firstAt)) ex.firstAt = r.transaction_date;
          } else {
            buyerMap.set(email, {
              orders: 1, totalCents: cents,
              firstAt: r.transaction_date ?? null,
              bottles: Number(r.bottles) || 0,
              state: r.customer_state ?? null,
            });
          }
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }

    // Buyer profile summary
    const buyerCount = buyerMap.size;
    let sumOrders = 0, sumCents = 0, sumBottles = 0;
    const stateCounts: Record<string, number> = {};
    for (const b of buyerMap.values()) {
      sumOrders += b.orders; sumCents += b.totalCents; sumBottles += b.bottles;
      if (b.state) {
        const k = b.state.trim().toUpperCase();
        stateCounts[k] = (stateCounts[k] ?? 0) + 1;
      }
    }
    const topStates = Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([s, c]) => `${s}:${c}`).join(", ");
    const buyerProfile =
      `count=${buyerCount}; ` +
      `avg_orders_per_buyer=${(sumOrders / Math.max(1, buyerCount)).toFixed(2)}; ` +
      `avg_spend_cents_per_buyer=${Math.round(sumCents / Math.max(1, buyerCount))}; ` +
      `avg_bottles_per_buyer=${(sumBottles / Math.max(1, buyerCount)).toFixed(2)}; ` +
      `top_states=${topStates || "(none)"}; ` +
      `tier1_states=CA,TX,FL,NY,WA,CO,IL,GA (weight 1.2); tier3_states=MT,WY,ND,SD,ID,AK (weight 0.8)`;

    // 2) Pull recent abandoned carts not in buyer set, capped.
    const prospects: ProspectFeatures[] = [];
    const seen = new Set<string>();
    {
      const PAGE = 1000;
      let from = 0;
      while (prospects.length < PROSPECT_CAP) {
        const { data, error } = await admin
          .from("vs_abandoned_carts")
          .select("buyer_email,cart_value,ship_state,last_seen")
          .not("buyer_email", "is", null)
          .order("last_seen", { ascending: false, nullsFirst: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        for (const r of data) {
          const email = normEmail(r.buyer_email);
          if (!email || buyerMap.has(email) || seen.has(email)) continue;
          seen.add(email);
          prospects.push({
            email,
            cart_value_cents: Math.round((Number(r.cart_value) || 0) * 100),
            state: r.ship_state ?? null,
            state_weight: stateWeight(r.ship_state),
          });
          if (prospects.length >= PROSPECT_CAP) break;
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }

    if (prospects.length === 0) {
      return new Response(JSON.stringify({ ok: true, buyers: buyerCount, scored: 0, note: "no prospects" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Batch + score with limited concurrency.
    const batches: ProspectFeatures[][] = [];
    for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
      batches.push(prospects.slice(i, i + BATCH_SIZE));
    }

    let scored = 0;
    let failed = 0;
    const scoredAt = new Date().toISOString();

    async function runBatch(batch: ProspectFeatures[]) {
      try {
        const result = await scoreBatch(buyerProfile, batch, LOVABLE_API_KEY!);
        const rows = batch
          .map((p) => ({ email: p.email, score: result[p.email] ?? null }))
          .filter((r) => r.score !== null)
          .map((r) => ({ email: r.email, score: r.score as number, scored_at: scoredAt, model_version: MODEL_VERSION }));
        if (rows.length) {
          const { error } = await admin.from("kennel_lookalike_scores").upsert(rows, { onConflict: "email" });
          if (error) throw error;
          scored += rows.length;
        }
      } catch (e) {
        console.error("[kennel-lookalike-score] batch failed", e);
        failed += batch.length;
      }
    }

    for (let i = 0; i < batches.length; i += PARALLEL) {
      await Promise.all(batches.slice(i, i + PARALLEL).map(runBatch));
    }

    return new Response(
      JSON.stringify({ ok: true, buyers: buyerCount, prospects: prospects.length, scored, failed, model_version: MODEL_VERSION }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[kennel-lookalike-score] fatal", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});