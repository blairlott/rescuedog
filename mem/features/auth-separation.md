---
name: Customer vs back-office auth separation
description: Customer-facing auth (login/signup/account) must never overlap with back-office auth (admin/CRM/CMS/Finance/Kennel/Club Admin). Staff emails are rejected from customer flows and vice versa.
type: constraint
---
**Rule:** Front-end customer user management is separate from back-end (staff) user management. No overlap.

**Enforcement (logical separation, single Supabase auth):**
- `src/lib/staffEmail.ts` — single source of truth for staff email domains (currently `@rescuedogwines.com`).
- Customer surfaces (`/login`, `/signup`, `useCustomerAuth`) REJECT staff emails with `STAFF_EMAIL_MESSAGE` and redirect them to `/admin`.
- Back-office surfaces (`/admin`, `/crm/login`, `/cms/login`, `/finance/login`, `/club/admin`) REQUIRE staff emails (already enforced on `/admin`) and check `user_roles` for the appropriate role.
- `user_roles` RLS prevents self-escalation: only `owner`/`admin` can insert/update/delete rows.
- `useCustomerAuth` does NOT invoke `vinoshipper-link-customer` or `vinoshipper-sync-membership` for staff emails — staff are not customers in Vinoshipper and the API rejects them ("email is associated with another user type").
- Header `isStaff` toggle is the ONLY place back-office shortcuts (`/admin`, `/crm/login`) appear on the customer site.

**Why:** A staff member should never be treated as a customer (no club enrollment, no Vinoshipper linking, no rewards), and a customer should never accidentally land in a back-office login. Avoids data corruption in Vinoshipper, prevents accidental role escalation, and keeps the two surfaces independently revocable.

**Do NOT:**
- Add a single "unified" login page that serves both.
- Allow customer signup to set any `app_role`.
- Call customer-only edge functions (Vinoshipper link/sync, rewards, club) from a staff session without an `isStaffEmail` guard.
- Hardcode `@rescuedogwines.com` in new code — import `isStaffEmail` from `@/lib/staffEmail`.