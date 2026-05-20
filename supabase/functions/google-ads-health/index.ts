const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
import { createClient } from "npm:@supabase/supabase-js@2";
import { getGoogleAdsAccessToken, isAuthError } from "../_shared/googleAdsAuth.ts";

// Probes the Google Ads refresh-token flow. On success, auto-enables
// `kennel_oci_enabled` so the OCI LTV uploader can run. On failure,
// returns the OAuth error so the UI can surface it.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await getGoogleAdsAccessToken();
    if (isAuthError(auth)) {
      return json({
        healthy: false,
        error: auth.error,
        hint: auth.hint ?? null,
        details: auth.details ?? null,
        checked_at: new Date().toISOString(),
      }, 200);
    }

    // Healthy → auto-flip the OCI flag on (if not already on).
    let autoEnabled = false;
    try {
      const url = Deno.env.get("SUPABASE_URL")!;
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(url, key);
      const { data: existing } = await sb
        .from("app_settings")
        .select("value")
        .eq("key", "kennel_oci_enabled")
        .maybeSingle();
      const current = existing?.value === true || existing?.value === "true";
      if (!current) {
        await sb
          .from("app_settings")
          .upsert({ key: "kennel_oci_enabled", value: true }, { onConflict: "key" });
        autoEnabled = true;
      }
    } catch (e) {
      // Non-fatal — health check still succeeded.
      console.error("auto-flip failed", e);
    }

    return json({
      healthy: true,
      customer_id: auth.config.customerId,
      login_customer_id: auth.config.loginCustomerId || null,
      auto_enabled_oci: autoEnabled,
      checked_at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ healthy: false, error: "internal_error", message: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}