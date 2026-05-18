// Shared helpers for Phase 2C local-delivery webhook receivers.
// Verifies an HMAC SHA-256 signature, inserts into local_delivery_events
// with dedup on (platform, external_event_id), and kicks off CAPI/OCI
// fanout flags (actual dispatch handled by a downstream worker).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Constant-time hex compare. */
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Verify HMAC-SHA256 hex signature. If `secret` is empty/undefined we treat
 * the receiver as "not yet live" and reject all requests with 401 unless
 * `?test=true` is set on the URL (for dry-runs from the Supabase dashboard).
 */
export async function verifyHmac(
  rawBody: string,
  providedSig: string | null,
  secret: string | undefined,
  opts: { allowTest?: boolean } = {},
): Promise<boolean> {
  if (!secret) return !!opts.allowTest;
  if (!providedSig) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  // Accept "sha256=..." or raw hex
  const clean = providedSig.replace(/^sha256=/i, "").trim().toLowerCase();
  return safeEq(hex, clean);
}

/** SHA-256 hex of a lowercase email — what Meta CAPI / Google OCI expect. */
export async function hashEmail(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const buf = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(email.trim().toLowerCase()),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface NormalizedDeliveryEvent {
  platform: "instacart" | "doordash" | "gopuff" | "ubereats";
  external_event_id: string;
  customer_email_hash: string | null;
  sku: string | null;
  qty: number | null;
  revenue_cents: number | null;
  occurred_at: string; // ISO
  raw: Record<string, unknown>;
}

export async function persistDeliveryEvent(evt: NormalizedDeliveryEvent) {
  const client = sb();
  const { data, error } = await client
    .from("local_delivery_events")
    .upsert(
      {
        ...evt,
        capi_status: "pending",
        oci_status: "pending",
      },
      { onConflict: "platform,external_event_id", ignoreDuplicates: false },
    )
    .select("id, created_at")
    .maybeSingle();
  if (error) throw error;
  return data;
}