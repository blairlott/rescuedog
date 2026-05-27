## Two issues, two fixes

### Fix 1 — `getStoredGclid()` returns the wrong value
`src/lib/abVariant.ts` line 94-96:
```ts
export function getStoredGclid(): string | null {
  return readCookie("gclaw"); // returns "GCL.{seconds}.{gclid}" — wrapped value
}
```
The `gclaw` cookie is `GCL.{seconds}.{gclid}`. Sending that whole string to Google Ads as the click ID is what produced the `INVALID_CONVERSION_VALUE` PARTIAL row visible in the screenshot.

Replace it to re-export the already-correct unwrapper from `metaAttribution.ts`:
```ts
export { getGclid as getStoredGclid } from "@/lib/metaAttribution";
```
(That function correctly parses `parts.slice(2).join(".")`.)

### Fix 2 — Surface why intents aren't being recorded
`ab_checkout_intents` has only 38 rows, all without `gclid`. Two follow-ups:

a. **Audit where `recordCheckoutIntent` is called** — `rg "recordCheckoutIntent"` from `src/lib/abCheckoutIntent.ts`. Likely it's only on the Vinoshipper modal "Continue" click, which misses subscription/Shopify-merch flows entirely. List the call sites in a short note (no code change in this turn — just a finding for you to direct).

b. **Add a small fallback in `gclid-oci-loop`**: also look up the gclid via `meta_capi_events` or a `gclid` recorded on the cart-snapshot row (we already store `gclid` in `cart-snapshot/index.ts`). If `ab_checkout_intents` has no row for an email but a `cart_snapshots` row does, use that. This widens the match net and uses the data we're already collecting.

### Out of scope (call out, don't build)

- The "only 38 intents in 30 days" problem is a tracking-coverage issue. Not fixable by the OCI loop — needs a separate review of which checkout flows do/don't call `recordCheckoutIntent`. I'll surface the call-site list as part of Fix 2a, and you decide where to add more capture calls.
- The historical PARTIAL row will stay PARTIAL — Google Ads OCI rejects can't be retroactively cleaned up; only the next run with the corrected click ID format will succeed.

### Verify after deploy
- Reload `/kennel/oci-log` and click **Dry Run** — `scanned` should still be ~192. `matched` will only rise once `ab_checkout_intents` (or `cart_snapshots`) actually contains a gclid for a recent customer's email. So after Fix 1 + Fix 2b, manually arrive at the site with `?gclid=test123` in the URL, complete a checkout, then re-run.
