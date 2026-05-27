/**
 * Age verification helper. The age gate writes the verified flag to either
 * localStorage (Remember Me) or sessionStorage. Two key spellings exist in
 * the wild — `rdw-age-verified` (canonical, written by AgeGate.tsx) and
 * `rdw_age_verified` (legacy, written by CartRecommendations + CheckoutPage).
 * Accept either spelling from either store so a verified visitor never
 * sees the gate twice.
 */
const KEYS = ["rdw-age-verified", "rdw_age_verified"] as const;

export function isAgeVerified(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (const k of KEYS) {
      if (localStorage.getItem(k) === "true") return true;
      if (sessionStorage.getItem(k) === "true") return true;
    }
  } catch { /* storage disabled */ }
  return false;
}

/**
 * Defense-in-depth: call at the top of every wine-transaction click handler
 * (Add to Cart for wine, Checkout, Buy Now, Subscribe, Join Wine Club).
 * If the visitor never confirmed 21+ (e.g. they stripped the AgeGate
 * `inert` attribute via dev tools and clicked through), we wipe every age
 * flag in case one got planted client-side and reload the page so AgeGate
 * re-mounts and re-prompts. Returns `false` when we blocked the action so
 * callers can `if (!requireAgeVerified()) return;`.
 *
 * Vinoshipper enforces its own age + ID verification at the hosted
 * checkout endpoint (PCI + compliance live there) — this is the
 * client-side second layer.
 */
export function requireAgeVerified(): boolean {
  if (isAgeVerified()) return true;
  if (typeof window === "undefined") return false;
  try {
    for (const k of KEYS) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }
  } catch { /* ignore */ }
  try { window.location.reload(); } catch { /* ignore */ }
  return false;
}