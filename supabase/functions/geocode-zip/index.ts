import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple in-memory cache per cold start
const cache = new Map<string, { lat: number; lng: number; city?: string; state?: string }>();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const zip = (url.searchParams.get("zip") || "").trim();
    if (!/^\d{5}$/.test(zip)) {
      return new Response(JSON.stringify({ error: "Invalid zip" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (cache.has(zip)) {
      return new Response(JSON.stringify(cache.get(zip)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nomUrl = `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=USA&format=json&limit=1&addressdetails=1`;
    const res = await fetch(nomUrl, {
      headers: {
        "User-Agent": "RescueDogWines-Locator/1.0 (admin@rescuedogwines.com)",
        "Accept-Language": "en",
      },
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Geocode upstream error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return new Response(JSON.stringify({ error: "Zip not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const hit = data[0];
    const result = {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      city: hit.address?.city || hit.address?.town || hit.address?.village,
      state: hit.address?.state,
    };
    cache.set(zip, result);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});