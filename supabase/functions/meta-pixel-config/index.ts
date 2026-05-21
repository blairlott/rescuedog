// Returns the public Meta Pixel ID so the browser can boot fbevents.js.
// Pixel IDs are publishable — every Meta-using site exposes them in HTML.
// We serve via edge function only to avoid hardcoding the ID in the repo.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const pixelId = Deno.env.get("META_PIXEL_ID") ?? null;
  const testEventCode = Deno.env.get("META_TEST_EVENT_CODE") ?? null;
  return new Response(
    JSON.stringify({ pixelId, testEventCode }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
});