# Capture gclid from legacy WordPress checkout

Bridge the gap between Google Ads clicks landing on legacy WP and the existing `gclid-oci-loop` pipeline in Lovable Cloud. Today: zero ad-driven conversions reach Google Ads OCI because intent capture only runs on Lovable. Goal: every ad-click → WP checkout → Vinoshipper sale becomes an uploaded conversion within ~2 hours.

## What gets built

### 1. New public edge function: `ingest-wp-intent`

- Path: `supabase/functions/ingest-wp-intent/index.ts`
- `verify_jwt = false` (anon-callable from any origin)
- CORS open to `*` (WP is a different origin)
- Accepts POST JSON: `{ email, gclid, ga4_client_id, page_url, user_agent }`
- Validates with zod: email format (optional, may be null at cart-link click), gclid format (`^[A-Za-z0-9_-]{20,200}$`), max lengths
- Inserts into `ab_checkout_intents` with `site_variant='legacy'`, `ab_test='rdw_replatform_dev'`
- Rate limit: simple IP-based throttle (max 30/min per IP via in-memory counter — good enough for early use; upgrade if abused)
- Returns `{ ok: true, id }` on success, structured error otherwise

### 2. Schema check / migration (only if needed)

- Inspect `ab_checkout_intents.site_variant` column — if it's a CHECK constraint or enum that only allows `'lovable'|'legacy'`, we're fine. If it's stricter, add migration to allow `'legacy'`.
- No expected schema change beyond that — the table already accepts the shape we need.

### 3. Smoke test

- Curl the deployed endpoint with a fake payload to confirm 200 + row insert.
- Verify with `read_query` that the row appears with `site_variant='legacy'`.

### 4. Final WP snippet (handed to user, not added to repo)

- Header-injectable `<script>` block for the **Code Snippets** / WPCode plugin.
- Behavior:
  - Captures `?gclid=` on every landing → 90-day `rdw_gclid` cookie (root domain).
  - On any email input change/blur → fires intent with email + gclid.
  - On any click to a vinoshipper.com URL → fires intent even if email is blank (back-stop).
  - Uses `fetch(..., { keepalive: true })` so the request survives the Vinoshipper redirect.
- Where: install via Code Snippets plugin, **Header**, **frontend, site-wide**.

### 5. Lindy manual changelog

Per `mem://features/lindy-manual-changelog`, append a Changelog entry to `/mnt/documents/Lindy_User_Manual_and_Roadmap.docx` documenting the new `ingest-wp-intent` endpoint so Lindy knows it exists.

## How it stitches into existing pipeline

```text
Google Ad click
  → WP page (snippet captures gclid → cookie)
  → WP checkout (snippet POSTs email+gclid to ingest-wp-intent)
  → ab_checkout_intents row (site_variant='legacy')
  → Vinoshipper deep-link checkout (existing)
  → vinoshipper-poll-15min writes vs_transactions row (existing)
  → gclid-oci-loop (every 2h) joins email → uploads to Google Ads (existing)
  → Google Ads Smart Bidding sees real conversions
```

No changes needed to `gclid-oci-loop` — it already joins by email and accepts any `site_variant`.

## Technical details

- Function uses `npm:@supabase/supabase-js@2` service-role client for inserts (bypasses RLS, which is correct for a public ingestion endpoint).
- Email lowercased + trimmed before insert (matches the join key in `gclid-oci-loop`).
- gclid stored raw (no `GCL.` wrapper) — `gclid-oci-loop` already handles both formats.
- IP rate limit: per-instance only (cold starts reset). Acceptable for low-volume launch; revisit if we see abuse.
- All errors return 400 with field-level messages, but **never block the user's checkout** — the WP snippet uses `fetch` async and ignores failures.

## What this does NOT do

- Does not change anything in the Lovable app code.
- Does not require user to deploy / modify the WP theme — only paste a snippet via Code Snippets plugin.
- Does not touch RLS on `ab_checkout_intents` (service-role insert bypasses it).
- Does not address Option 2 (pointing ad URLs at Lovable) — that's a separate decision for later.

## Risks / open questions

- **Email may be null** when the snippet fires on the Vinoshipper-link click. `gclid-oci-loop` requires an email match to join, so those rows are useless unless email was captured first. Mitigation: snippet's Strategy A (watch email inputs) usually fires before Strategy B (the link click), so most flows will have email.
- **Vinoshipper may not surface a typed email until their checkout page** (which is on `vinoshipper.com`, not WP). In that case the snippet only captures the gclid; the join happens later via the customer email from `vs_transactions`. As long as we have *an* intent row with that gclid for that email within the lookback window, the loop will match — but the email needs to come from somewhere. If WP checkout truly never collects email, we'll need to add a pre-checkout email-gate or fall back to passing gclid through to Vinoshipper as a URL param.
- **Rate-limit cheese**: a bot could spam the endpoint. Mitigation: 30/min per IP is fine for now; can add Cloudflare in front later.

## Validation steps after deploy

1. Curl the endpoint with a fake payload → expect 200.
2. Confirm row in `ab_checkout_intents` with `site_variant='legacy'`.
3. User pastes snippet into WP, hits the live site with `?gclid=test123_aaaaaaaaaaaaaaaaaaaa`, fills email on a checkout page.
4. New intent row appears within seconds.
5. Next time you place a real ad-click order, `gclid-oci-loop` will pick it up automatically on its 2-hour cycle (or we trigger it manually).
