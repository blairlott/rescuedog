/**
 * Newsletter / exit-intent signup discount code.
 * Persisted in localStorage so it can auto-apply at checkout for users
 * who keep their session. Users who lose the session still receive the
 * same code via the Mailchimp welcome automation.
 */
const KEY = "rdw_signup_promo";
export const SIGNUP_PROMO_CODE = "RDWNEWS";

export function saveSignupPromo(email: string) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ code: SIGNUP_PROMO_CODE, email, at: Date.now(), used: false }),
    );
  } catch {}
}

export function getSignupPromo(): { code: string; email: string } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.code || parsed.used) return null;
    return { code: parsed.code, email: parsed.email || "" };
  } catch {
    return null;
  }
}

export function markSignupPromoUsed() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    localStorage.setItem(KEY, JSON.stringify({ ...parsed, used: true, used_at: Date.now() }));
  } catch {}
}
