## Test the gclid → Google Ads OCI pipeline end-to-end

Run all three test paths to confirm the pipeline works and unlock Google Ads scaling.

---

### Path A — Synthetic pipeline test (proves wiring, ~5 min)

1. Insert one fake row into `ab_checkout_intents`:
   - `email`: pick a real recent VS customer's email (so the join matches a real `vs_transactions` row)
   - `gclid`: `test_gclid_RDW_20260527_synthetic`
   - `site_variant`: `control`, `ab_test`: current test id
   - `created_at`: now
2. POST `gclid-oci-loop` with `{ "dry_run": false, "lookback_days": 30 }` using the admin session.
3. Expected: row inserted into `oci_gclid_matches` with `status='error'` and `error_message` containing Google's `INVALID_GOOGLE_CLICK_ID` (because the gclid is fake). Same row mirrored into `oci_upload_log` with `status='partial_failure'`.
4. **What this proves:** match logic, OAuth, payload shape, partial-failure parsing, and DB writeback all work. The 401 cron-auth issue is fully resolved.
5. Cleanup: delete the synthetic intent + the two log rows so they don't pollute reporting.

### Path B — Real ad-click test (proves attribution, needs user action)

This is the one that actually confirms "scale-ready" — Google must accept and attribute a real conversion.

1. **User action required:** open incognito, click a live Google Ad for rescuedog.com, complete a real Vinoshipper purchase under a known email (e.g. a personal/test email). Tell me the email + approximate time when done.
2. Wait for the next `vinoshipper-poll-15min` tick to land the transaction in `vs_transactions` (or trigger it manually).
3. POST `gclid-oci-loop`. Expected: `oci_gclid_matches` row with `status='uploaded'`, `uploaded_at` set, no error.
4. **3-6 hours later:** check Google Ads → Tools → Conversions → Diagnostics for the purchase action. Should see one new "Imported - clicks" conversion with the matching `orderId`.
5. **What this proves:** real attribution lands in Google Ads. Once confirmed, Smart Bidding can start optimizing on these uploads.

### Path C — Historical backfill (opportunistic, no user action)

1. Query for VS customers from the last 60 days whose email appears in `ab_checkout_intents` OR `abandoned_carts` with a non-null `gclid`, but whose `invoice` is NOT yet in `oci_gclid_matches`.
2. Report counts: how many historical matches exist that we haven't uploaded.
3. If the count is meaningful (say >10), run `gclid-oci-loop` with `lookback_days: 60` — it will pick them up automatically since the function already scans both tables and dedups via `oci_gclid_matches`.
4. **What this proves:** how much attribution we've been silently missing, and recovers it in one shot.

---

### Order of execution

1. **A first** (5 min, zero risk) — confirms the cron-auth fix and full pipeline wiring.
2. **C immediately after** (no waiting) — surfaces any free attribution wins from historical data.
3. **B last** — requires user to click an ad + buy, then a 3-6h wait for Google to show the conversion.

### Technical notes

- All POSTs use `supabase--curl_edge_functions` with the preview session's admin JWT (the function accepts admin/owner/ad_ops_manager roles in addition to the cron secret).
- Synthetic-row cleanup uses `supabase--migration` (DELETE requires it; `insert` tool only handles INSERT/UPDATE).
- Path C query is read-only via `supabase--read_query`.
- No code changes — pure verification of the work already shipped.
