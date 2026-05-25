// Thin client for the `google-maps-proxy` edge function. Keeps server-side
// Google Maps APIs (Geocoding, Routes) OFF the browser so the referrer-
// restricted browser key is never used for endpoints it isn't authorized for.
import { supabase } from "@/integrations/supabase/client";

export type GeocodeResult = { lat: number; lng: number; formatted_address: string } | null;

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const { data, error } = await supabase.functions.invoke("google-maps-proxy", {
    body: { op: "geocode", address },
  });
  if (error) throw error;
  if (!data?.result) return null;
  return data.result as GeocodeResult;
}

export type RouteLeg = {
  distanceMeters: number;
  durationSeconds: number;
  startAddress: string;
  endAddress: string;
};

export type RouteResult = {
  legs: RouteLeg[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  optimizedWaypointOrder: number[];
};

export async function computeOptimizedRoute(args: {
  origin: string;
  destination: string;
  intermediates?: string[]; // these get optimized
}): Promise<RouteResult | null> {
  const { data, error } = await supabase.functions.invoke("google-maps-proxy", {
    body: { op: "route", ...args },
  });
  if (error) throw error;
  return (data?.result as RouteResult) ?? null;
}