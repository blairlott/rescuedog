/**
 * v2 store feature flag. Off by default so production never exposes
 * the test routes. Flip to `true` in preview/dev via env or by editing
 * this file locally during QA.
 */
export const V2_STORE_ENABLED =
  (import.meta.env.VITE_V2_STORE_ENABLED ?? "false") === "true";