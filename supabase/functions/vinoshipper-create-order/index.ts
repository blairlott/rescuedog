// Called by the wine club admin curation flow.
// Pushes a curated shipment to Vinoshipper as an order, with the member's
// tier coupon applied. Vinoshipper validates compliance, charges the card,
// and returns the order ID.
//
// Admins only (we check the user has owner/admin role).

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  vsCreateOrder,
  VinoshipperError,
  type VsOrderLineItem,
} from "../_shared/vinoshipper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  shipmentId: string; // wine_club_shipments.id
  couponCode?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: isAdmin } = await supabase.rpc("is_admin_or_owner", {
      _user_id: user.id,
    });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = (await req.json()) as RequestBody;
    if (!body?.shipmentId) return json({ error: "shipmentId required" }, 400);

    // Load shipment + items + membership
    const { data: shipment, error: sErr } = await supabase
      .from("wine_club_shipments")
      .select(
        "id, membership_id, status, wine_club_shipment_items(product_handle, variant_id, quantity)",
      )
      .eq("id", body.shipmentId)
      .single();
    if (sErr || !shipment) return json({ error: "shipment not found" }, 404);

    const { data: membership } = await supabase
      .from("wine_club_memberships")
      .select("*")
      .eq("id", shipment.membership_id)
      .single();
    if (!membership) return json({ error: "membership not found" }, 404);

    // Map our items → Vinoshipper line items.
    // NOTE: variant_id today is a Shopify ID; once Vinoshipper product IDs are
    // mapped (likely via a Shopify metafield or a new lookup table), substitute
    // the correct VS productId here.
    const lineItems: VsOrderLineItem[] =
      // deno-lint-ignore no-explicit-any
      ((shipment as any).wine_club_shipment_items ?? []).map((it: any) => ({
        productId: it.variant_id ?? it.product_handle,
        quantity: it.quantity ?? 1,
      }));
    if (lineItems.length === 0) {
      return json({ error: "shipment has no items" }, 400);
    }

    const order = await vsCreateOrder({
      // customerId: membership.vinoshipper_customer_id (after migration)
      lineItems,
      couponCode: body.couponCode,
      shippingAddress: membership.shipping_address_line1
        ? {
            firstName: "Member",
            lastName: "Member",
            address1: membership.shipping_address_line1,
            address2: membership.shipping_address_line2 ?? undefined,
            city: membership.shipping_city ?? "",
            state: membership.shipping_state ?? "",
            zip: membership.shipping_zip ?? "",
          }
        : undefined,
    }) as { id: string | number };

    // Update our shipment with the VS order id + status
    await supabase
      .from("wine_club_shipments")
      .update({ status: "submitted_to_vinoshipper" } as Record<string, unknown>)
      .eq("id", shipment.id);

    return json({ ok: true, vinoshipperOrderId: order.id });
  } catch (err) {
    console.error("vinoshipper-create-order error", err);
    if (err instanceof VinoshipperError) {
      return json({ error: err.message, details: err.details }, err.status);
    }
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}