/**
 * Age verification helper. The age gate writes `rdw_age_verified=true` to
 * localStorage when a visitor confirms they are 21+. Used to gate wine
 * cross-sell, recommendations, and pair-with-wine widgets so we never
 * suggest alcohol to unverified visitors.
 */
export function isAgeVerified(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("rdw_age_verified") === "true";
  } catch {
    return false;
  }
}