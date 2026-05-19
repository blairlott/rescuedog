// Kennel AI Insights — answers ad-hoc questions, ingests operator soft signals,
// and generates actionable forecast guidance using Lovable AI Gateway.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Mode = "query" | "nudges" | "tile-guidance" | "ingest-signal";

interface Body {
  mode: Mode;
  question?: string;
  signal?: string;
  snapshot?: Record<string, unknown>;
  tileId?: "dtc-ecommerce" | "brick-mortar" | "brand-lift" | string;
  tileData?: Record<string, unknown>;
  rangeLabel?: string;
}

const J = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const SYSTEM = `You are the Kennel Command Center analyst for Rescue Dog Wines — a small Lodi, California winery whose mission is helping dogs find their forever home.

You receive JSON snapshots of paid-media spend, DTC orders, brick & mortar depletions, QuickBooks finance data, forecast tiles, and operator-entered soft intelligence. All dollar values are USD.

Voice: blunt, operator-grade. No fluff, no emojis, no exclamation points. Reference numbers exactly when present — never invent metrics. If something is missing, say so.

Brand rules:
- Never say "free shipping" — say "shipping included".
- Loyalty is access-based ("The Pack"), never percent-off framing.
- Do not invent rescue impact totals.`;

const NUDGE_INSTRUCTIONS = `Generate 3 to 5 ACTIONABLE NUDGES based on the snapshot and soft signals. Each nudge must be a concrete next step the operator can take this week.

Return STRICT JSON only, no prose, no markdown fences:
{ "nudges": [ { "title": "≤60 chars, imperative", "severity": "info"|"warn"|"opportunity", "body": "1-2 sentences, cite a number from the snapshot or a soft signal", "metric": "short metric reference like 'ROAS 1.4x' or 'COGS 38%'" } ] }

Prioritize: ROAS deltas vs spend, channel imbalance, B&M state concentration, expense ratio drift, DTC AOV vs ad CPA, and recently entered soft signals. Skip anything you can't ground.`;

const QUERY_INSTRUCTIONS = `Answer the operator's question using ONLY the snapshot and soft signals. Keep it under 150 words. Cite specific numbers or signal dates. If the data doesn't contain what's needed, say exactly what's missing and what feed would supply it.`;

const TILE_GUIDANCE_INSTRUCTIONS = `Generate 2 to 4 forecast-improvement actions for this specific tile. These must be real-world operator actions, not data-science advice.

Return STRICT JSON only, no prose, no markdown fences:
{ "actions": [ { "title": "≤58 chars, imperative", "lever": "Budget"|"Placement"|"Creative"|"Retail"|"Ops"|"Data", "expected_lift": "short directional estimate or 'Unknown until tested'", "owner_hint": "who should do it", "confidence": "low"|"medium"|"high", "rationale": "1 sentence grounded in tile data or soft signals" } ] }

Examples of acceptable actions: shift spend between platforms, launch chain-placement support, reallocate ambassador visits, create SKU-specific landing pages, update geo/daypart modifiers, confirm inventory before adding media pressure.`;

const SIGNAL_INGEST_INSTRUCTIONS = `Classify the operator's soft intelligence.

Return STRICT JSON only, no prose, no markdown fences:
{ "category": "chain_placement"|"budget_change"|"event"|"inventory"|"promotion"|"distributor"|"creative"|"competitor"|"seasonality"|"general", "channel": "dtc"|"brick_mortar"|"instacart"|"meta"|"google"|"wholesale"|"all"|null, "region": "state/market/chain if present, else null", "sku": "SKU/product if present, else null", "effective_date": "YYYY-MM-DD if present or inferable, else null", "confidence": "low"|"medium"|"high", "summary": "≤140 chars" }`;

function sbAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function requireKennelUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return { error: J(401, { error: "unauthorized" }) };
  const admin = sbAdmin();
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const user = userRes?.user;
  if (!user) return { error: J(401, { error: "unauthorized" }) };
  const { data: canView } = await admin.rpc("can_view_kennel", { _user_id: user.id });
  if (!canView) return { error: J(403, { error: "forbidden" }) };
  return { admin, user };
}

async function fetchSoftSignals(admin: ReturnType<typeof sbAdmin>, limit = 12) {
  const { data } = await admin
    .from("kennel_soft_signals")
    .select("created_at, signal_text, category, channel, region, sku, effective_date, confidence, extracted")
    .eq("status", "active")
    .order("effective_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

async function aiJson(prompt: string, instructions: string, fallback: unknown) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("AI gateway not configured");
  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${prompt}\n\n${instructions}` },
      ],
    }),
  });
  if (!aiRes.ok) throw new Error(await aiRes.text());
  const json = await aiRes.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "";
  const cleaned = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { return fallback; }
}

async function aiText(prompt: string, instructions: string) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("AI gateway not configured");
  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${prompt}\n\n${instructions}` },
      ],
    }),
  });
  if (!aiRes.ok) throw new Error(await aiRes.text());
  const json = await aiRes.json();
  return String(json?.choices?.[0]?.message?.content ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireKennelUser(req);
    if (auth.error) return auth.error;
    const { admin, user } = auth;
    const body = (await req.json()) as Body;
    const { mode, question, signal, snapshot, rangeLabel, tileId, tileData } = body ?? {};
    if (!mode) return J(400, { error: "mode required" });

    if (mode === "ingest-signal") {
      if (!signal || signal.trim().length < 3) return J(400, { error: "signal required" });
      const classified = await aiJson(`Operator signal:\n${signal.trim()}`, SIGNAL_INGEST_INSTRUCTIONS, {}) as any;
      const row = {
        created_by: user.id,
        signal_text: signal.trim(),
        category: classified.category ?? "general",
        channel: classified.channel ?? null,
        region: classified.region ?? null,
        sku: classified.sku ?? null,
        effective_date: classified.effective_date ?? null,
        confidence: classified.confidence ?? "medium",
        extracted: { summary: classified.summary ?? null, raw_classification: classified },
      };
      const { data, error } = await admin.from("kennel_soft_signals").insert(row).select().single();
      if (error) return J(500, { error: error.message });
      return J(200, { ok: true, signal: data });
    }

    if (!snapshot && mode !== "tile-guidance") return J(400, { error: "snapshot required" });
    const softSignals = await fetchSoftSignals(admin);
    const basePayload = [
      rangeLabel ? `Period: ${rangeLabel}` : null,
      snapshot ? `Snapshot:\n${JSON.stringify(snapshot, null, 2)}` : null,
      `Soft signals:\n${JSON.stringify(softSignals, null, 2)}`,
    ].filter(Boolean).join("\n\n");

    if (mode === "query") {
      if (!question || question.trim().length < 3) return J(400, { error: "question required" });
      const answer = await aiText(`${basePayload}\n\nQuestion: ${question.trim()}`, QUERY_INSTRUCTIONS);
      return J(200, { answer });
    }

    if (mode === "nudges") {
      const parsed = await aiJson(basePayload, NUDGE_INSTRUCTIONS, { nudges: [] }) as any;
      return J(200, { nudges: Array.isArray(parsed) ? parsed : parsed?.nudges ?? [] });
    }

    if (mode === "tile-guidance") {
      const prompt = [
        rangeLabel ? `Period: ${rangeLabel}` : null,
        `Tile: ${tileId ?? "unknown"}`,
        `Tile data:\n${JSON.stringify(tileData ?? {}, null, 2)}`,
        `Soft signals:\n${JSON.stringify(softSignals, null, 2)}`,
      ].filter(Boolean).join("\n\n");
      const parsed = await aiJson(prompt, TILE_GUIDANCE_INSTRUCTIONS, { actions: [] }) as any;
      return J(200, { actions: Array.isArray(parsed) ? parsed : parsed?.actions ?? [] });
    }

    return J(400, { error: "unsupported mode" });
  } catch (e) {
    return J(500, { error: String((e as Error)?.message ?? e) });
  }
});