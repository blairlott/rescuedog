/**
 * Stable per-browser visitor ID used to make experiment assignments sticky
 * across sessions before auth. Stored in localStorage; falls back to a
 * per-tab ephemeral ID if storage is unavailable.
 */
const KEY = "rdw_visitor_id";

let memoryId: string | null = null;

function rand(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return `v_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function getVisitorId(): string {
  if (typeof window === "undefined") return memoryId ?? (memoryId = rand());
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = rand();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return memoryId ?? (memoryId = rand());
  }
}