---
name: CMS Dev Toggles
description: Pre-launch master/sub toggles in CMS → Settings → Dev Controls that gate account features and customer email notifications
type: feature
---
Table: `public.dev_toggles` (category, key, enabled, locked, label, description, sort_order).
Categories: `account_features`, `notifications`. Each category has a `__master__` row plus per-feature sub-rows.

**Locked-ON exceptions (cannot be disabled — DB trigger enforces this):**
- `account_features.subscribe_and_save`
- `notifications.subscribe_and_save_confirm`

Locked-ON rows bypass the master gate.

**Frontend gate:** `useIsFeatureEnabled(category, key)` from `src/hooks/useDevToggles.ts`. Use this to gate routes, nav links, and account-area widgets.
**Admin UI:** `src/components/cms/DevControlsPanel.tsx`, exposed via the "Dev Controls" tab on `CmsDashboard`.
**Edge-side gate:** `isNotificationEnabled(key)` / `isAccountFeatureEnabled(key)` from `supabase/functions/_shared/devToggles.ts`. Fails CLOSED (returns false on error). 30s in-memory cache per cold instance.

Already wired into: `abandoned-cart-sweep`, `welcome-series-dispatch`, `reengagement-sweep`. ADD the gate to any new email/Mailchimp/transactional send path before it ships.

Defaults in dev: master OFF for both groups; all sub-rows OFF; only the two Subscribe & Save locked-ON rows are enabled.