// Award loyalty points to a customer.
// Callable by:
//   - Admins from the CRM (admin-scoped)
//   - Internal callers (Vinoshipper webhook, merch order completion) using service role
//
// Earn rule: 1 point per $1 spent (excludes shipping & tax).
// Idempotency: if order_id is provided, repeated calls for the same
// (user_id, order_id, event_type) are no-ops.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AwardBody {
  user_id: string;
  // Either subtotal_cents (auto-converted at 1 pt per $1) or explicit delta_points
  subtotal_cents?: number;
  delta_points?: number;
  event_type?: string; // e.g. "earn_order", "earn_referral", "manual_adjust"
  reason?: string;
  order_id?: string | null;
  metadata?: Record<string, unknown>;
}

function pointsFromCents(cents: number): number {
  // 1 point per whole dollar, floored.
  return Math.max(0, Math.floor(cents / 100));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  let body: AwardBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.user_id || typeof body.user_id !== "string") {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const delta =
    typeof body.delta_points === "number"
      ? Math.trunc(body.delta_points)
      : typeof body.subtotal_cents === "number"
        ? pointsFromCents(body.subtotal_cents)
        : 0;

  if (delta === 0) {
    return new Response(JSON.stringify({ error: "no points to award" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Caller authentication: admin via JWT, or internal via service-role header.
  const authHeader = req.headers.get("Authorization") ?? "";
  const internalKey = req.headers.get("x-internal-key");
  const isInternal = internalKey && internalKey === SERVICE_KEY;

  // Use service-role client for the actual RPC call (the SQL function gates by auth.role()).
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  if (!isInternal) {
    // Verify the caller is an admin user.
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .in("role", ["owner", "admin"])
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const { data, error } = await admin.rpc("award_loyalty_points", {
    _user_id: body.user_id,
    _delta_points: delta,
    _event_type: body.event_type ?? "earn_order",
    _reason: body.reason ?? "Order points",
    _order_id: body.order_id ?? null,
    _subtotal_cents: typeof body.subtotal_cents === "number" ? body.subtotal_cents : null,
    _metadata: body.metadata ?? {},
  });

  if (error) {
    console.error("[award-loyalty-points] rpc error", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      ledger_id: data,
      points_awarded: delta,
      idempotent_skip: data === null,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});