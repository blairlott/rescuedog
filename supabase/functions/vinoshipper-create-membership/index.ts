// Called from the wine club signup flow.
// 1) Creates (or links) a Vinoshipper customer
// 2) Creates a Vinoshipper club membership
// 3) Stores the IDs on our wine_club_memberships row

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  vsCreateCustomer,
  vsCreateClubMembership,
  VinoshipperError,
} from "../_shared/vinoshipper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  membershipId: string; // wine_club_memberships.id
  vinoshipperClubId: string | number; // which VS club/tier this maps to
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = (await req.json()) as RequestBody;
    if (!body?.membershipId || !body?.vinoshipperClubId) {
      return json({ error: "membershipId and vinoshipperClubId required" }, 400);
    }

    // Load our membership row (must belong to this user)
    const { data: membership, error: mErr } = await supabase
      .from("wine_club_memberships")
      .select("*")
      .eq("id", body.membershipId)
      .eq("user_id", user.id)
      .single();
    if (mErr || !membership) return json({ error: "membership not found" }, 404);

    // Load profile for name/email and any pre-existing Vinoshipper link
    const { data: profile } = await supabase
      .from("customer_profiles")
      .select("display_name, email, phone, vinoshipper_customer_id")
      .eq("id", user.id)
      .single();

    const [firstName, ...rest] = (profile?.display_name ?? "").split(" ");
    const lastName = rest.join(" ") || "Member";

    // 1. Reuse stored Vinoshipper customer ID if available; otherwise create one
    let customerId: string | number;
    if (profile?.vinoshipper_customer_id) {
      customerId = profile.vinoshipper_customer_id;
    } else {
      const customer = await vsCreateCustomer({
        firstName: firstName || "Member",
        lastName,
        email: profile?.email ?? user.email ?? "",
        phone: profile?.phone ?? undefined,
        shippingAddress: membership.shipping_address_line1
          ? {
              firstName: firstName || "Member",
              lastName,
              address1: membership.shipping_address_line1,
              address2: membership.shipping_address_line2 ?? undefined,
              city: membership.shipping_city ?? "",
              state: membership.shipping_state ?? "",
              zip: membership.shipping_zip ?? "",
            }
          : undefined,
      }) as { id: string | number };
      customerId = customer.id;

      // Persist to profile so future calls (à la carte orders, repeat joins) reuse it
      await supabase
        .from("customer_profiles")
        .update({
          vinoshipper_customer_id: String(customerId),
          vinoshipper_linked_at: new Date().toISOString(),
        } as Record<string, unknown>)
        .eq("id", user.id);
    }

    // 2. Create club membership
    const vsMembership = await vsCreateClubMembership({
      customerId,
      clubId: body.vinoshipperClubId,
    }) as { id: string | number };

    // 3. Save IDs back to our membership row
    await supabase
      .from("wine_club_memberships")
      .update({
        vinoshipper_customer_id: String(customerId),
        vinoshipper_membership_id: String(vsMembership.id),
      } as Record<string, unknown>)
      .eq("id", membership.id);

    return json({
      ok: true,
      vinoshipperCustomerId: customerId,
      vinoshipperMembershipId: vsMembership.id,
    });
  } catch (err) {
    console.error("vinoshipper-create-membership error", err);
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