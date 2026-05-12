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
      .select("vinoshipper_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    const apiKey = Deno.env.get("VINOSHIPPER_API_KEY");
    let vinoshipperResult: unknown = null;
    let vinoshipperError: string | null = null;

    // Best-effort call to Vinoshipper. Endpoint shapes need confirmation
    // against the live API docs once the key is available.
    if (apiKey && profile?.vinoshipper_customer_id) {
      try {
        const path =
          body.action === "switch"
            ? `/customers/${profile.vinoshipper_customer_id}/club-membership`
            : `/customers/${profile.vinoshipper_customer_id}/club-membership/${body.action}`;
        const res = await fetch(`https://vinoshipper.com/api/v3${path}`, {
          method: body.action === "switch" ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            tier: body.to_tier,
            pauseCycles: body.pause_cycles,
            reason: body.reason,
          }),
        });
        vinoshipperResult = await res.json().catch(() => null);
        if (!res.ok) vinoshipperError = `Vinoshipper ${res.status}`;
      } catch (e) {
        vinoshipperError = e instanceof Error ? e.message : String(e);
      }
    } else if (!apiKey) {
      vinoshipperError = "VINOSHIPPER_API_KEY not configured — change recorded locally only";
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