# Vinoshipper webhook secret rotation — surgical

## Pre-flight findings (read-only, already done)

1. **Is `VINOSHIPPER_WEBHOOK_SECRET` currently set?** **No.** It does not appear in the project's Edge Function secrets list. That matches the symptom: `vinoshipper-webhook` short-circuits with `500 server_misconfigured: VINOSHIPPER_WEBHOOK_SECRET not set` for every inbound event since launch, so nothing is being written and nothing is being authorized.
2. **Log table name:** the function inserts every received event into **`public.vinoshipper_webhook_events`** (columns include `subject`, `event`, `identifier`, `payload`, `raw_body`, `signature_header`, `signature_valid`, `source_ip`, `processed`, `processing_error`, `processed_at`, `created_at`). A separate table `vinoshipper_webhook_logs` also exists but is not what this function writes to — the active log is `vinoshipper_webhook_events`.

## Steps (build mode)

### Step 1 — Generate the secret
Run a one-shot in the sandbox:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
This produces a 64-char hex string (32 bytes of CSPRNG entropy). Capture it as `NEW_SECRET`. It will be displayed exactly once in chat, clearly labeled "COPY NOW INTO VINOSHIPPER".

### Step 2 — Store as Edge Function secret
Call `secrets--add_secret` for `VINOSHIPPER_WEBHOOK_SECRET`. The Lovable secrets form requires the user to paste the value — I will instruct Blair to paste the exact `NEW_SECRET` string from step 1 into the form (no other transformation). On save, Lovable propagates it to all Edge Functions automatically; no redeploy needed.

### Step 3 — Verify it is actually loaded by `vinoshipper-webhook`
Hit the deployed function with an intentionally wrong token to prove the env var is now read (and the misconfig branch is gone):
```
curl -i -X POST "https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/vinoshipper-webhook?token=wrong" \
  -H "Content-Type: application/json" -d '{"subject":"ORDER","event":"APPROVED","identifier":"probe"}'
```
- Before rotation: `500 server_misconfigured`.
- After rotation: `401 unauthorized` (proves env var is loaded — secret is present but the probe token doesn't match).

Then repeat with `?token=$NEW_SECRET` and expect `200 {"received":true,...}` plus a row in `vinoshipper_webhook_events` with `signature_valid=true`.

### Step 4 — Output block (single chat message)
- ✅ Confirmation: `VINOSHIPPER_WEBHOOK_SECRET` set and loaded (probe returned 401, not 500; live probe returned 200).
- 🔑 The new secret, displayed **once**, labeled exactly: `COPY NOW INTO VINOSHIPPER — this is the only time it will appear here.`
- 🌐 Full webhook URL, paste-ready:
  ```
  https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/vinoshipper-webhook?token=<NEW_SECRET>
  ```
  Blair pastes this into VS dashboard → Webhooks for both ORDER and CLUB_MEMBERSHIP subjects.
- 📊 Verification SQL for Blair to run after triggering a VS test order:
  ```sql
  SELECT created_at, subject, event, identifier,
         signature_valid, processed, processing_error
  FROM public.vinoshipper_webhook_events
  ORDER BY created_at DESC
  LIMIT 20;
  ```
  Healthy row = `signature_valid = true`, `processed = true`, `processing_error IS NULL`.

## Explicit non-goals (will NOT touch)
- No edits to `supabase/functions/vinoshipper-webhook/index.ts` or any other function code.
- No other secret added, updated, rotated, or deleted.
- No migrations, schema changes, RLS edits, or backfill of missing Monday orders (separate follow-up).
- No other security/cleanup work this turn.

## One thing to confirm before I execute
The `secrets--add_secret` tool requires you to paste the generated value into a secure form yourself — I cannot write it directly into the secret store. Workflow will be:
1. I generate and display `NEW_SECRET` in chat.
2. I trigger the add-secret form for `VINOSHIPPER_WEBHOOK_SECRET`.
3. You paste the exact same string into that form and submit.
4. I run the curl probes to confirm load, then post the final output block.

Approve and I'll execute exactly this — nothing more.
