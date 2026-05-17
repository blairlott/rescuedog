import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "switch" | "pause" | "resume" | "cancel";

interface Body {
  action: Action;
  to_tier?: string;
  pause_cycles?: number;
  reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body.action) return json({ error: "action required" }, 400);

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await serviceClient
      .from("customer_profiles")
      .select("vinoshipper_customer_id, first_name, last_name, email, current_wine_club_tier")
      .eq("id", user.id)
      .maybeSingle();

    const apiKeyId = Deno.env.get("VINOSHIPPER_API_KEY_ID");
    const apiSecret = Deno.env.get("VINOSHIPPER_API_SECRET");
    const producerId = Deno.env.get("VINOSHIPPER_PRODUCER_ID");
    let vinoshipperResult: unknown = null;
    let vinoshipperError: string | null = null;

    // Best-effort call to Vinoshipper. Vinoshipper uses HTTP Basic auth with
    // keyId:secret. Endpoint shapes follow the v3 club-membership pattern.
    if (apiKeyId && apiSecret && profile?.vinoshipper_customer_id) {
      try {
        const basic = btoa(`${apiKeyId}:${apiSecret}`);
        const path =
          body.action === "switch"
            ? `/customers/${profile.vinoshipper_customer_id}/club-membership`
            : `/customers/${profile.vinoshipper_customer_id}/club-membership/${body.action}`;
        const url = `https://vinoshipper.com/api/v3${path}${producerId ? `?producerId=${producerId}` : ""}`;
        const res = await fetch(url, {
          method: body.action === "switch" ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${basic}`,
            Accept: "application/json",
          },
          body: JSON.stringify({
            tier: body.to_tier,
            pauseCycles: body.pause_cycles,
            reason: body.reason,
          }),
        });
        vinoshipperResult = await res.json().catch(() => null);
        if (!res.ok) vinoshipperError = `Vinoshipper ${res.status}: ${typeof vinoshipperResult === "object" ? JSON.stringify(vinoshipperResult) : ""}`;
      } catch (e) {
        vinoshipperError = e instanceof Error ? e.message : String(e);
      }
    } else if (!apiKeyId || !apiSecret) {
      vinoshipperError = "Vinoshipper API credentials not configured — change recorded locally only";
    } else {
      vinoshipperError = "No linked Vinoshipper customer";
    }

    // Always log the event for audit / staff follow-up.
    await serviceClient.from("wine_club_events").insert({
      user_id: user.id,
      event_type:
        body.action === "switch" ? "switched" : body.action === "cancel" ? "cancelled" : body.action === "pause" ? "paused" : "resumed",
      to_tier: body.to_tier ?? null,
      metadata: {
        pause_cycles: body.pause_cycles,
        reason: body.reason,
        vinoshipper_result: vinoshipperResult,
        vinoshipper_error: vinoshipperError,
      },
    });

    // Notify staff so they can verify / manually action in Vinoshipper if sync failed.
    try {
      await serviceClient.functions.invoke("send-transactional-email", {
        body: {
          templateName: "wine-club-staff-action",
          recipientEmail: "info@rescuedogwines.com",
          idempotencyKey: `wc-action-${user.id}-${body.action}-${Date.now()}`,
          templateData: {
            action: body.action,
            customerEmail: profile?.email ?? user.email,
            customerName: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || undefined,
            userId: user.id,
            vinoshipperCustomerId: profile?.vinoshipper_customer_id ?? undefined,
            fromTier: profile?.current_wine_club_tier ?? undefined,
            toTier: body.to_tier,
            pauseCycles: body.pause_cycles,
            reason: body.reason,
            vinoshipperSynced: !vinoshipperError,
            vinoshipperError: vinoshipperError ?? undefined,
            submittedAt: new Date().toISOString(),
          },
        },
      });
    } catch (notifyErr) {
      console.error("Staff notification failed:", notifyErr);
    }

    return json({
      ok: true,
      vinoshipper_synced: !vinoshipperError,
      vinoshipper_error: vinoshipperError,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}