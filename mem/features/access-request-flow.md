---
name: Backend Access Request Flow
description: Self-serve flow for read-only viewers to request elevated edit access; admin notified by email and in-portal banner
type: feature
---

When a user with read-only backend access (typically `viewer` or `executive`) opens `/admin`, each area tile shows a **Read-only** badge plus a "Request full access →" link to `/admin/request-access?area=<key>&level=edit`.

**On submit:**
1. Row inserted into `public.access_requests` (status=`pending`).
2. `send-transactional-email` invoked with template `access-request-admin-notification` (registered as INTERNAL — test-mode email routing sends only to Blair + Lindy).
3. Admin (owner/admin role) sees a notification banner at the top of `/admin` listing pending requests with quick "Review in CRM → Users" deep link.

Approvals are handled in **CRM → Users** (`/crm/admin`) by adding the relevant role to the user.

Template: `supabase/functions/_shared/transactional-email-templates/access-request-admin-notification.tsx`.
