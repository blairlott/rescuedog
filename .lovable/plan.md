## Goal

Tighten access to API tokens and integration secrets so only **you (owner)** can view them by default. Anyone else — including admins — only sees them if you explicitly grant access. Also introduce a `developer` role for future use.

## Scope

Sensitive surface = `public.integration_credentials` (the DB-backed store for provider API keys/secrets used by `_shared/credentials.ts`). Runtime Edge Function secrets in Lovable Cloud are already owner-managed in the UI and not affected.

## Changes

### 1. New `developer` app role
- Extend the `app_role` enum with `developer`.
- No automatic access to credentials — it's a label for future assignments (e.g. CRM access, edge function debugging surfaces). Owners can hand it out later.
- Add `useUserRole` flag `isDeveloper` for future UI gating.

### 2. New `credential_grants` table
Explicit allow-list of who (besides owner) can read secrets.

```text
credential_grants
  id uuid pk
  user_id uuid  -- granted user
  scope text    -- 'all' | provider name (e.g. 'vinoshipper', 'shopify')
  can_write boolean default false
  granted_by uuid
  granted_at, expires_at (nullable), note text
  unique(user_id, scope)
```

Security definer helper `can_access_credential(uid, provider) → bool`:
- true if user is **owner** (not admin — owners only), OR
- has a non-expired row in `credential_grants` matching `scope = 'all'` or `scope = provider`.

Separate `can_write_credential(uid, provider)` requires `can_write = true` on the matching grant (or owner).

### 3. Tighten `integration_credentials` RLS
- DROP existing `Admins can view integration credentials` policy.
- SELECT: `is_owner(uid) OR can_access_credential(uid, provider)`.
- INSERT/UPDATE/DELETE: `is_owner(uid) OR can_write_credential(uid, provider)`.
- Service role retains full access (edge functions unaffected — they use service role via `_shared/credentials.ts`).

Result: admins, executives, viewers, ad_ops_manager, etc. **lose** read access to secrets unless explicitly granted.

### 4. Owner-only management UI
New page **`/admin/secrets-access`** (owner-gated):
- Lists all `integration_credentials` rows (masked values).
- "Grant access" dialog: pick user (from `profiles`), choose scope (All providers / specific provider), read or read+write, optional expiry + note.
- Revoke button per grant.
- Audit log section showing recent reads/writes from existing `integration_credentials_audit` trigger.

Add a sidebar link in `AdminTopNav` visible only when `isOwner === true`.

### 5. Audit & safety
- Keep existing audit trigger.
- Add `useUserRole.isOwner` already exists — reuse for gating.
- Migration is additive; no data loss.

## Out of scope
- Lovable Cloud runtime secrets panel (already owner-controlled in platform UI).
- Rotating any existing keys.
- Re-permissioning other tables flagged in the security scan (separate task if you want).

## Acceptance
- A non-owner admin signed in cannot `select * from integration_credentials` via the client.
- After you grant `dev@example.com` scope `shopify` read, they see only Shopify rows.
- Edge functions continue to resolve credentials normally (service role bypass).
- `developer` role exists and shows up in role pickers; no implicit permissions attached yet.
