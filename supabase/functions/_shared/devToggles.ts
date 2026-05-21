// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const TTL_MS = 30_000;
let cache: { at: number; rows: Array<{ category: string; key: string; enabled: boolean; locked: boolean }> } | null = null;

async function loadAll() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const client = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .from("dev_toggles")
    .select("category, key, enabled, locked");
  if (error) {
    // Fail SAFE: when in doubt, suppress sends (return empty so nothing is enabled).
    console.warn("[devToggles] load failed, defaulting to OFF:", error.message);
    return [];
  }
  cache = { at: Date.now(), rows: data as any };
  return cache.rows;
}

/**
 * Check whether a notification category+key is currently enabled.
 *
 * Rules:
 * - Locked rows that are enabled bypass the master toggle (e.g. Subscribe & Save
 *   confirmation always sends).
 * - Otherwise BOTH the `__master__` row and the specific key row must be enabled.
 * - On any error we return false ("fail closed") so dev toggles cannot
 *   accidentally let traffic through.
 *
 * Usage in any send-path edge function:
 * ```
 * import { isNotificationEnabled } from "../_shared/devToggles.ts";
 * if (!(await isNotificationEnabled("welcome_series"))) return new Response("suppressed", { status: 200 });
 * ```
 */
export async function isNotificationEnabled(key: string): Promise<boolean> {
  const rows = await loadAll();
  const self = rows.find((r) => r.category === "notifications" && r.key === key);
  const master = rows.find((r) => r.category === "notifications" && r.key === "__master__");
  if (!self) return false;
  if (self.locked && self.enabled) return true;
  if (!master?.enabled) return false;
  return !!self.enabled;
}

export async function isAccountFeatureEnabled(key: string): Promise<boolean> {
  const rows = await loadAll();
  const self = rows.find((r) => r.category === "account_features" && r.key === key);
  const master = rows.find((r) => r.category === "account_features" && r.key === "__master__");
  if (!self) return false;
  if (self.locked && self.enabled) return true;
  if (!master?.enabled) return false;
  return !!self.enabled;
}

/** Force the cache to expire (useful in tests or after admin updates). */
export function clearDevTogglesCache() {
  cache = null;
}