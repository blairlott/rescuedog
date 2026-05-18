// vs-tracking-verify
//
// For a given dropship_order (or all recently-relayed orders), polls
// Vinoshipper to confirm the tracking number we PUT is now stored on the
// VS order. Writes back vs_tracking_verified_at + vs_tracking_mismatch and
// updates the matching vs_tracking_relay_log row.
//
// In simulate mode (VS_LIVE_MODE not set, or body.simulate=true) the
// function fabricates a "verified" response so the UI can be exercised.
//
// Body: { dropship_order_id?: string, simulate?: boolean, all_pending?: boolean }

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { vsFetch, vsLiveMode } from "../_shared/vinoshipper.ts";

const BodySchema = z.object({
  dropship_order_id: z.string().uuid().optional(),
  simulate: z.boolean().optional(),
  all_pending: z.boolean().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let raw: unknown = {};
  try { raw = await req.json(); } catch { /* allow empty body */ }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const { dropship_order_id, simulate, all_pending } = parsed.data;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pick orders to verify
  let query = supabase
    .from("dropship_orders")
    .select("id,vinoshipper_order_id,tracking_number,carrier,simulated,vs_tracking_relayed_at,vs_tracking_verified_at")
    .not("vs_tracking_relayed_at", "is", null);
  if (dropship_order_id) {
    query = query.eq("id", dropship_order_id);
  } else if (all_pending) {
    query = query.is("vs_tracking_verified_at", null).limit(25);
  } else {
    return json({ error: "must provide dropship_order_id or all_pending=true" }, 400);
  }

  const { data: orders, error } = await query;
  if (error) return json({ error: error.message }, 500);
  if (!orders || orders.length === 0) return json({ ok: true, checked: 0 });

  const useSim = simulate === true || !vsLiveMode();
  const results: Array<Record<string, unknown>> = [];

  for (const o of orders) {
    const expected = o.tracking_number;
    let vsResponse: unknown = null;
    let vsTracking: string | null = null;
    let mismatch: string | null = null;
    let verifiedOk = false;

    if (!o.vinoshipper_order_id) {
      mismatch = "no_vs_order_id";
    } else if (useSim || o.simulated) {
      // Simulated VS confirms whatever we relayed
      vsResponse = { simulated: true, vs_order_id: o.vinoshipper_order_id, tracking_number: expected };
      vsTracking = expected;
      verifiedOk = !!expected;
      if (!expected) mismatch = "no_tracking_to_verify";
    } else {
      try {
        vsResponse = await vsFetch(`/orders/${o.vinoshipper_order_id}`, { method: "GET" });
        // VS response shape varies; look in common spots
        const r = vsResponse as Record<string, unknown>;
        vsTracking = (r.trackingNumber as string)
          ?? (r.tracking_number as string)
          ?? ((r.shipment as Record<string, unknown>)?.trackingNumber as string)
          ?? null;
        if (!vsTracking) mismatch = "vs_has_no_tracking";
        else if (vsTracking !== expected) mismatch = `vs_tracking_differs (${vsTracking})`;
        else verifiedOk = true;
      } catch (err) {
        mismatch = `verify_request_failed: ${String(err)}`;
      }
    }

    const verifiedAt = new Date().toISOString();
    await supabase.from("dropship_orders").update({
      vs_tracking_verified_at: verifiedAt,
      vs_tracking_mismatch: mismatch,
    }).eq("id", o.id);

    // Update the most recent relay-log row for this order
    const { data: latestLog } = await supabase
      .from("vs_tracking_relay_log")
      .select("id")
      .eq("dropship_order_id", o.id)
      .order("attempt_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestLog?.id) {
      await supabase.from("vs_tracking_relay_log").update({
        verified_at: verifiedAt,
        verified_ok: verifiedOk,
        mismatch_reason: mismatch,
        response_payload: vsResponse as Record<string, unknown>,
      }).eq("id", latestLog.id);
    }

    results.push({ dropship_order_id: o.id, verified_ok: verifiedOk, mismatch, vs_tracking: vsTracking });
  }

  return json({ ok: true, simulated: useSim, checked: results.length, results });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}