## Phase 1 — GTM GCLID Capture Spec (container `GTM-5DBQXWP7`, Vinoshipper)

Goal: capture every `gclid` (and `gbraid` / `wbraid`) that lands on a Vinoshipper-hosted page, persist it long enough to survive checkout, and forward it into the order so Z3a's email-match has a click ID to pair. No app code changes — paste-ready spec only.

Deliverable: `docs/gtm/gclid-capture-spec.md` in the repo containing the exact GTM objects below.

### A. Variables (User-Defined)

1. `dlv - gclid`, `dlv - gbraid`, `dlv - wbraid` — Data Layer Variable, Version 2, default `undefined`.
2. `cookie - rdw_gclid` — 1st-Party Cookie, name `rdw_gclid`.
3. `cjs - Best GCLID` — Custom JS, returns URL value → cookie fallback:
```js
function(){ return {{dlv - gclid}} || {{cookie - rdw_gclid}} || undefined; }
```

### B. Triggers

1. `Trigger - PV - Has Click ID` — Page View, `{{Page URL}}` matches RegEx `[?&](gclid|gbraid|wbraid)=`.
2. `Trigger - DOM Ready - VS Checkout` — DOM Ready, `{{Page Path}}` matches RegEx `^/(checkout|cart|order|thank|confirmation)`.
3. `Trigger - Form Submit - VS Checkout` — Form Submit (Check Validation), same path filter.

### C. Tags

1. `Tag - Persist Click ID to Cookie` (Custom HTML, Trigger #1):
```html
<script>
(function(){
  var u=new URL(location.href);
  var v=u.searchParams.get('gclid')||u.searchParams.get('gbraid')||u.searchParams.get('wbraid');
  if(!v) return;
  document.cookie='rdw_gclid='+encodeURIComponent(v)+'; Max-Age='+(90*24*60*60)+'; Path=/; SameSite=Lax; Secure';
  window.dataLayer=window.dataLayer||[];
  window.dataLayer.push({event:'rdw_gclid_captured', gclid:v});
})();
</script>
```
2. `Tag - Inject Hidden gclid Field` (Custom HTML, Trigger #2) — adds `<input name="custom_gclid">` to every form so VS submits the click ID with the order.
3. `Tag - GA4 Event - rdw_checkout_with_gclid` — GA4 event tag, param `gclid={{cjs - Best GCLID}}`, Trigger #3. Audit match-rate in GA4 BigQuery export.
4. (Optional fallback) Beacon to a future `/functions/v1/gclid-beacon` if VS strips the hidden field — documented but not built in v1.

### D. Verification in GTM Preview

- Visit `…?gclid=TEST123` → `rdw_gclid` cookie set + dataLayer push fires.
- Browse to `/cart` then `/checkout` → hidden `custom_gclid` input present on the form.
- Submit a sandbox order → `custom_gclid` appears in the VS order payload received by `vinoshipper-webhook`.

### E. Downstream handoff

Webhook + `_shared/serverConversions.ts` already accept `gclid`. After GTM ships, confirm Lindy's Z3a worker reads `custom_gclid` from the order's custom fields and attaches it to the OCI row.

---

## Phase 2 — Z3 OCI Proxy (Google Ads Offline Click Conversions)

Goal: extend the existing `google-ads-proxy` pattern with a new edge function that accepts batched OCI rows from Lindy and calls `customers/{id}:uploadClickConversions`. Unblocks the 13 stuck conversions ($1,669.02).

### Architecture

```text
Lindy worker
   │  POST /functions/v1/google-ads-oci-upload
   │  Authorization: Bearer LINDY_PROXY_TOKEN
   │  body: { conversion_action_id, dry_run?, conversions:[…] }
   ▼
google-ads-oci-upload (new edge fn)
   ├─ verify LINDY_PROXY_TOKEN
   ├─ refresh Google Ads access token (shared with google-ads-proxy)
   ├─ POST googleads.googleapis.com/v20/customers/{cid}:uploadClickConversions
   │     { partialFailure:true, validateOnly: dry_run }
   └─ log each row to public.oci_upload_log
```

### Files

1. `supabase/functions/_shared/googleAdsAuth.ts` — extract the OAuth refresh block currently inline in `google-ads-proxy/index.ts`. Both functions import from here.
2. `supabase/functions/google-ads-proxy/index.ts` — refactor to use the shared helper (no behavior change).
3. `supabase/functions/google-ads-oci-upload/index.ts` — new function. Zod-validate body. Build payload:
```json
{
  "conversions": [{
    "conversionAction": "customers/{cid}/conversionActions/{action_id}",
    "conversionDateTime": "2026-05-15 14:22:01-07:00",
    "conversionValue": 169.99,
    "currencyCode": "USD",
    "orderId": "VS-96354108417",
    "gclid": "Cj0KCQjw..."
  }],
  "partialFailure": true,
  "validateOnly": false
}
```
Headers: `Authorization: Bearer <access>`, `developer-token`, `login-customer-id`.
Returns `{ uploaded, partial_failures, errors }` to Lindy.

4. New migration — `public.oci_upload_log`:
```sql
create table public.oci_upload_log (
  id uuid primary key default gen_random_uuid(),
  uploaded_at timestamptz not null default now(),
  conversion_action_id text not null,
  order_id text,
  gclid text,
  conversion_value numeric,
  currency text,
  status text not null check (status in ('uploaded','partial_failure','error')),
  error_message text,
  raw_response jsonb
);
alter table public.oci_upload_log enable row level security;
create policy "admins read oci log" on public.oci_upload_log
  for select using (public.is_admin_or_owner(auth.uid()));
-- inserts via service role only
```

5. `supabase/config.toml` — add `[functions.google-ads-oci-upload]\nverify_jwt = false`.

### Secrets / dependencies

- Reuses `LINDY_PROXY_TOKEN` and all `GOOGLE_ADS_*` secrets already present. **No new secrets.**
- Hard external dependency: **Blair must reconnect Google Ads OAuth in Lindy** before live upload — otherwise the OAuth refresh returns `invalid_grant` and the function will surface a clean 502. Function will still deploy and accept dry-runs.

### Test plan

1. `supabase--curl_edge_functions` POST with `dry_run:true` and 1 synthetic row → expect Google Ads `validateOnly` OK.
2. Live POST with 1 real stuck row → expect `oci_upload_log.status='uploaded'`.
3. Backfill the 13 stuck conversions in a single batched call.
4. Spot-check Google Ads UI 4–6h later for the `Imported - Web` conversion bump.

### Out of scope

- Enhanced Conversions for Leads (hashed email/phone user_identifiers) — schema supports it but ship gclid-only first.
- Admin UI for re-running uploads — Lindy is the trigger.
- Z3a email-match itself — that's Lindy-side; this proxy just ingests what she sends.

---

## Sequencing

1. **Phase 1 first** (~5 min build, hand off to Blair to paste into GTM-5DBQXWP7). Unblocks Z3a match quality immediately as it propagates.
2. **Phase 2 second** — shared OAuth helper, new edge function, migration, dry-run test, then live-fire the 13 stuck conversions (after Google Ads OAuth reconnect).

The two phases are independent — Phase 2 can ship before Phase 1 verification completes in GTM.</parameter>
<parameter name="summary">GTM GCLID capture spec doc first, then Z3 OCI upload edge function + log table