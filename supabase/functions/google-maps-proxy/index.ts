// Server-side proxy for Google Maps Platform calls that the browser key is
// NOT authorized to make (Geocoding, Routes). Goes through the Lovable
// Google Maps connector gateway so the API key never reaches the browser.
//
// JWT-gated to admins / ad-ops / sales reps so anonymous callers can't burn
// our Maps Platform quota.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";
const ALLOWED_ROLES = new Set([
  "owner",
  "admin",
  "ad_ops_manager",
  "sales_rep",
  "ambassador_manager",
]);

type Body =
  | { op: "geocode"; address: string }
  | { op: "route"; origin: string; destination: string; intermediates?: string[] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return J(405, { error: "method_not_allowed" });

  // ---- Auth: signed-in user with an allowed role
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return J(401, { error: "unauthorized" });
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return J(401, { error: "unauthorized" });
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
  if (!(roles ?? []).some((r: { role: string }) => ALLOWED_ROLES.has(r.role))) {
    return J(403, { error: "forbidden" });
  }

  // ---- Credentials check
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
    return J(503, {
      error: "google_maps_connector_not_configured",
      hint: "Connect Google Maps in Connectors → Google Maps. The browser key alone cannot make Geocoding/Routes calls.",
    });
  }
  const gwHeaders = {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
    "Content-Type": "application/json",
  };

  // ---- Body
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return J(400, { error: "invalid_json" });
  }

  try {
    if (body.op === "geocode") {
      const addr = (body.address ?? "").toString().trim();
      if (!addr || addr.length > 500) return J(400, { error: "invalid_address" });
      const r = await fetch(
        `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(addr)}`,
        { headers: gwHeaders },
      );
      const data = await r.json();
      const hit = data?.results?.[0];
      if (!hit?.geometry?.location) {
        return J(200, { result: null, status: data?.status ?? "ZERO_RESULTS" });
      }
      return J(200, {
        result: {
          lat: hit.geometry.location.lat,
          lng: hit.geometry.location.lng,
          formatted_address: hit.formatted_address,
        },
      });
    }

    if (body.op === "route") {
      const origin = (body.origin ?? "").toString().trim();
      const destination = (body.destination ?? "").toString().trim();
      const intermediates = Array.isArray(body.intermediates)
        ? body.intermediates.map((x) => String(x).trim()).filter(Boolean).slice(0, 25)
        : [];
      if (!origin || !destination) return J(400, { error: "origin_and_destination_required" });

      // Routes API (replaces deprecated Directions API).
      const payload = {
        origin: { address: origin },
        destination: { address: destination },
        intermediates: intermediates.map((address) => ({ address })),
        travelMode: "DRIVE",
        optimizeWaypointOrder: intermediates.length > 0,
      };
      const r = await fetch(`${GATEWAY}/routes/directions/v2:computeRoutes`, {
        method: "POST",
        headers: {
          ...gwHeaders,
          "X-Goog-FieldMask":
            "routes.legs.distanceMeters,routes.legs.duration,routes.legs.startLocation,routes.legs.endLocation,routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex",
        },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      const route = data?.routes?.[0];
      if (!route) return J(200, { result: null, error: data?.error ?? null });

      const legs = (route.legs ?? []).map((l: any, i: number) => ({
        distanceMeters: l.distanceMeters ?? 0,
        durationSeconds: Number(String(l.duration ?? "0s").replace(/s$/, "")) || 0,
        startAddress: i === 0 ? origin : (intermediates[(route.optimizedIntermediateWaypointIndex ?? [])[i - 1] ?? i - 1] ?? ""),
        endAddress: i === legs?.length ? destination : "",
      }));

      return J(200, {
        result: {
          legs,
          totalDistanceMeters: route.distanceMeters ?? 0,
          totalDurationSeconds: Number(String(route.duration ?? "0s").replace(/s$/, "")) || 0,
          optimizedWaypointOrder: route.optimizedIntermediateWaypointIndex ?? [],
        },
      });
    }

    return J(400, { error: "unknown_op" });
  } catch (e) {
    return J(502, { error: "upstream_failed", detail: e instanceof Error ? e.message : String(e) });
  }
});