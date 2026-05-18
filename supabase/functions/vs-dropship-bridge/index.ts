// vs-dropship-bridge
//
// Receives Vinoshipper ORDER webhook events (APPROVED / TRACKING_NUMBER /
// CANCELLED), fetches the full order via VS REST, splits line items by
// fulfillment routing, and forks non-wine items to the appropriate dropship
// partner. Wine + VS-warehouse merch are left alone (VS ships them).
//
// Status: SCAFFOLD ONLY. Logs the planned fork; does not call partner APIs yet.
// See mem/specs/v3-vs-dropship-bridge-spec.md.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { vsFetch, type VsWebhookPayload } from "../_shared/vinoshipper.ts";

const WebhookSchema = z.object({
  identifier: z.union([z.string(), z.number()]),
  subject: z.enum(["ORDER", "CUSTOMER", "CLUB_MEMBERSHIP"]),
  event: z.string(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const parsed = WebhookSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = parsed.data as VsWebhookPayload;

  // Only ORDER events drive fulfillment forking.
  if (payload.subject !== "ORDER") {
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let plan: unknown = null;
  try {
    // Fetch the full order from VS so we can see line items.
    const order = await vsFetch<{
      id: string | number;
      lineItems?: Array<{
        productId: string | number;
        sku?: string;
        quantity: number;
      }>;
      shippingAddress?: Record<string, unknown>;
    }>(`/orders/${payload.identifier}`);

    const lines = order.lineItems ?? [];
    const skuIds = lines.map((l) => String(l.productId));

    // Look up dropship_skus that match the VS product IDs on this order.
    const { data: dropshipMatches } = await supabase
      .from("dropship_skus")
      .select("id,partner_id,sku,vinoshipper_product_id,fulfillment_mode,partner_sku,vendor_variant_id")
      .in("vinoshipper_product_id", skuIds);

    const byVsId = new Map(
      (dropshipMatches ?? []).map((r) => [String(r.vinoshipper_product_id), r]),
    );

    plan = lines.map((l) => {
      const match = byVsId.get(String(l.productId));
      if (!match) return { vsProductId: l.productId, action: "leave_to_vs", reason: "no_dropship_row" };
      if (match.fulfillment_mode === "vinoshipper_warehouse") {
        return { vsProductId: l.productId, action: "leave_to_vs", reason: "vs_warehouse" };
      }
      return {
        vsProductId: l.productId,
        action: "fork_to_partner",
        partnerId: match.partner_id,
        mode: match.fulfillment_mode,
        partnerSku: match.partner_sku ?? match.vendor_variant_id,
        qty: l.quantity,
      };
    });

    // TODO (next phase): write to dropship_orders + call dispatch-fulfillment.
    console.log("[vs-dropship-bridge] plan", {
      vsOrderId: payload.identifier,
      event: payload.event,
      plan,
    });
  } catch (err) {
    console.error("[vs-dropship-bridge] error", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ ok: true, dryRun: true, plan }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});