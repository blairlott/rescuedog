## Goal

Give Blair a simple admin view of the `oci_upload_log` table so he can watch Lindy's Google Ads OCI uploads land in real time, spot partial failures fast, and confirm the 13 stuck conversions clear once OAuth is reconnected.

## Placement: Kennel, not CRM

OCI uploads are ad-attribution telemetry, not sales-rep data. They belong with the rest of the Kennel ad-ops tooling (which already has `/kennel/log` for the cron job log, `/kennel/capi` for Meta CAPI, etc.), behind `KennelGuard` and gated by `is_ad_ops()`. Adding it to `/crm` would force a sales rep persona into an ads-attribution screen.

Route: **`/kennel/oci-log`**

## Files

1. **`src/pages/kennel/KennelOciLogPage.tsx`** (new)
   - Header: "Google Ads OCI Uploads"
   - Sub-copy: "Offline click conversions pushed to Google Ads by Lindy's Z3 worker."
   - Filters bar:
     - Status pill toggle: `All` / `Uploaded` / `Partial Failure` / `Error` (default `All`)
     - Date range: last 24h / 7d / 30d (default 7d)
     - Search by `order_id` (text input, debounced)
   - Summary tiles (top of page):
     - Total rows in window
     - Uploaded count (green)
     - Partial-failure count (amber)
     - Error count (red)
     - Sum of `conversion_value` for status=`uploaded`
   - Table (paginated 50/page):
     - `uploaded_at` (relative + tooltip absolute)
     - `status` badge
     - `order_id` (mono)
     - `gclid` (truncated, click-to-copy)
     - `conversion_value` + `currency`
     - `conversion_action_id` (mono)
     - `error_message` (truncated; click row to expand `raw_response` JSON viewer)
   - Empty state copy: "No uploads yet. Lindy's Z3 worker will start populating this after the next post-purchase batch."

2. **`src/lib/kennel/ociLog.ts`** (new) — thin data layer:
   - `fetchOciLog({status, since, search, limit, offset})` → returns rows + total count via Supabase client + RLS (admins/owners only — already enforced by the migration).
   - `fetchOciLogSummary({since})` → returns the 4 summary counts + value sum.

3. **`src/App.tsx`** — add inside the `/kennel` block:
   ```tsx
   <Route path="oci-log" element={<KennelOciLogPage />} />
   ```
   plus the lazy import.

4. **Kennel sidebar/nav** — locate the existing Kennel nav component (sibling of `KennelLayout`) and add an "OCI Uploads" entry next to "Log". Visible only when `is_ad_ops()` returns true (the layout already does that gate).

## RLS

Already covered by the Phase-2 migration:
```sql
create policy "admins read oci upload log"
  on public.oci_upload_log for select
  using (public.is_admin_or_owner(auth.uid()));
```
No additional policy needed. The page surfaces a clear "You don't have access" state if the query returns 0 rows due to RLS rather than empty data.

## Out of scope (intentional)

- No re-upload / retry button — Lindy owns the trigger; this is read-only.
- No CSV export in v1 (can add later if Blair asks).
- No realtime subscription — page polls on filter change; uploads are batch, not streaming.
- No Phase-1 GTM verification embedded here — that's a one-time GTM Preview task, not an ongoing dashboard.

## Verification

1. Visit `/kennel/oci-log` as admin → empty state shown.
2. After a Lindy upload (or a manual `supabase--curl_edge_functions` test with `dry_run:false`), refresh → rows appear with correct status.
3. Trigger a deliberately invalid row (bad `conversion_action_id`) → status `error`, `error_message` shows the API response.
4. Verify a non-admin user gets the "no access" state.