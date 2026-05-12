// Idempotently link the logged-in user to a Vinoshipper customer.
// Strategy:
//   1. If customer_profiles.vinoshipper_customer_id is already set, return it.
//   2. Otherwise look up Vinoshipper by email; if found, save that ID.
//   3. Otherwise create a new Vinoshipper customer and save its ID.
//
// The function is safe to call multiple times — it never creates duplicates
// when the same email already exists in Vinoshipper.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  vsCreateCustomer,
  vsFindCustomerByEmail,
  VinoshipperError,
} from "../_shared/vinoshipper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // If Vinoshipper isn't configured yet (simulation mode), no-op gracefully
    // so client auth flow doesn't surface a 500.
    if (!Deno.env.get("VINOSHIPPER_API_KEY")) {
      return json({ ok: true, source: "simulation", vinoshipperCustomerId: null });
    }

    // Service-role client for writing back to customer_profiles regardless of RLS
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Already linked?
    const { data: profile } = await adminClient
      .from("customer_profiles")
      .select("vinoshipper_customer_id, display_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.vinoshipper_customer_id) {
      return json({
        ok: true,
        vinoshipperCustomerId: profile.vinoshipper_customer_id,
        source: "already_linked",
      });
    }

    const email = profile?.email ?? user.email;
    if (!email) return json({ error: "no email on account" }, 400);

    const fullName = profile?.display_name
      ?? (user.user_metadata as Record<string, unknown> | null)?.full_name as string | undefined
      ?? "";
    const [firstName, ...rest] = fullName.split(" ").filter(Boolean);
    const lastName = rest.join(" ") || "Member";

    // 2. Try to find an existing Vinoshipper customer by email
    let vsCustomerId: string | number | null = null;
    let source: "found" | "created" = "found";

    const existing = await vsFindCustomerByEmail(email);
    if (existing) {
      vsCustomerId = existing.id;
    } else {
      // 3. Create a new Vinoshipper customer
      const created = await vsCreateCustomer({
        firstName: firstName || "Member",
        lastName,
        email,
        phone: profile?.phone ?? undefined,
      }) as { id: string | number };
      vsCustomerId = created.id;
      source = "created";
    }

    // Persist on the profile (upsert in case the profile row doesn't exist yet)
    await adminClient.from("customer_profiles").upsert({
      id: user.id,
      email,
      display_name: fullName || null,
      vinoshipper_customer_id: String(vsCustomerId),
      vinoshipper_linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>);

    return json({ ok: true, vinoshipperCustomerId: vsCustomerId, source });
  } catch (err) {
    console.error("vinoshipper-link-customer error", err);
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