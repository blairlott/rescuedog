---
name: Backend Viewer Role
description: Read-only `viewer` app_role for team members who need to see backend data (CMS/CRM/Wine Club/Dropship/Kennel/etc.) without edit rights
type: feature
---

`viewer` is an enum value of `app_role` (added 2026-05-21). Granted to non-editor team members (e.g., Jana Ritter, Mike Bell).

**How it works**
- Helper: `public.is_backend_viewer(uid)` returns true for `owner`/`admin`/`executive`/`viewer`.
- Every public SELECT policy that gates on a backend role helper has been extended with `OR public.is_backend_viewer(auth.uid())` (one-time DO-block sweep in migration). **When adding new tables, include `OR is_backend_viewer(auth.uid())` in any backend-staff SELECT policy** so viewers retain coverage.
- INSERT/UPDATE/DELETE policies were NOT changed — viewer has zero write paths.
- Frontend: `useUserRole().canViewBackend`, `useUserRole().isBackendViewer`. `useCmsAuth.isCmsEditor` is true for viewer (read), but `canEdit()` returns false. `adminAreas.ts` adds `viewer`+`executive` to every area's allowed roles.

**Pre-signup grants**: `public.pending_role_grants` (admin-managed). `handle_new_user` trigger consumes pending grants by lowercase email match on first sign-in.
