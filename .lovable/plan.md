## Goal

Make every Lovable Cloud customer account also exist as a Vinoshipper customer, so wine club shipments, age verification, and stored credit cards all live on the Vinoshipper side. The Lovable account stays the login of record; the Vinoshipper customer ID is stored on the profile and reused for club joins, à la carte orders, and member-discount lookups.

## Approach

We already have `supabase/functions/vinoshipper-create-membership` and `supabase/functions/_shared/vinoshipper.ts` (with `vsCreateCustomer`). We extend that pattern so a Vinoshipper customer is created/linked at **signup**, not just at wine-club join.

### 1. Schema change

Add to `customer_profiles`:
- `vinoshipper_customer_id text` (nullable, unique)
- `vinoshipper_linked_at timestamptz`

### 2. New edge function: `vinoshipper-link-customer`

Idempotent server-side function the client calls after signup/login:
1. Auth-gate via JWT (require logged-in user).
2. Load `customer_profiles` for the user.
3. If `vinoshipper_customer_id` already set → return it.
4. Otherwise: try Vinoshipper customer-search by email (`GET /customers?email=…`).
   - If found → store the existing ID on the profile.
   - If not found → call `vsCreateCustomer` with name/email/phone (no shipping address required yet — that's collected at club join / checkout).
5. Persist `vinoshipper_customer_id` + `vinoshipper_linked_at`.
6. Return `{ vinoshipperCustomerId }`.

Adds a matching `vsFindCustomerByEmail` helper to `_shared/vinoshipper.ts`.

### 3. Wire into auth flows

- `CustomerSignupPage`: after `signUp()` succeeds and we have a session, fire-and-forget `supabase.functions.invoke("vinoshipper-link-customer")`.
- `CustomerLoginPage` + Google/Apple OAuth callback: in `useCustomerAuth`'s `onAuthStateChange`, if the user has no `vinoshipper_customer_id` yet, invoke `vinoshipper-link-customer`. This back-fills existing accounts on next login.
- All calls non-blocking: a Vinoshipper outage must not break login.

### 4. Reuse on club join

Update `vinoshipper-create-membership` to:
- Use the stored `vinoshipper_customer_id` if present (skip `vsCreateCustomer`).
- Otherwise create one and write it back to `customer_profiles` in addition to `wine_club_memberships`.
- Always update the customer's shipping address on Vinoshipper before creating the membership.

### 5. Surface the link in the UI

- Account page: small "Vinoshipper account linked" indicator once the ID is set, plus a "Re-link" button that re-invokes the function if the field is empty.
- Wine Club CTA copy clarifies: "Sign in or create an account — your Rescue Dog Wines account is automatically linked to Vinoshipper for shipping, age verification, and secure payment."

## Prerequisite — Vinoshipper API key

The shared client reads `VINOSHIPPER_API_KEY` from Supabase secrets, and that secret is **not yet configured**. The exact auth header (`Authorization: Bearer …` vs `X-API-Key: …`) and the customer-search endpoint shape both need to be confirmed against Vinoshipper's docs once we have credentials.

Before I build this out, I'll need:
1. A Vinoshipper API key (added via the secrets tool).
2. Confirmation of the auth header format and the `GET /customers` query parameter for email lookup (I can verify against their docs once the key is in).

## Out of scope for this change

- Storing credit cards in our DB (cards stay on Vinoshipper — we never touch PAN data).
- Migrating historical customers in bulk (the login back-fill handles them organically as they sign in).
- Replacing the Vinoshipper deep-link wine checkout (still the compliance/payment path).

## Files touched

- `supabase/migrations/<new>.sql` — add 2 columns to `customer_profiles`
- `supabase/functions/_shared/vinoshipper.ts` — add `vsFindCustomerByEmail`
- `supabase/functions/vinoshipper-link-customer/index.ts` — new
- `supabase/functions/vinoshipper-create-membership/index.ts` — reuse stored customer ID, write back
- `src/hooks/useCustomerAuth.tsx` — invoke link function on auth state change
- `src/pages/CustomerSignupPage.tsx` — invoke link function after signup
- `src/pages/AccountPage.tsx` — show link status + re-link button
- `src/pages/WineClubPage.tsx` — small copy clarifier on the auth CTA
