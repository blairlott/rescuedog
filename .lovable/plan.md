## Changes

**1. Default UI window → 30d** (`src/pages/kennel/KennelOciLogPage.tsx`)
- Change `useState<WindowFilter>("7d")` → `"30d"` so the log table shows all 712 historical rows on load.
- Update the toast "no matches" copy from "...last 7 days" to use the actual lookback (30).

**2. Default loop lookback → 30d** (`src/pages/kennel/KennelOciLogPage.tsx`)
- Both `runLoop` calls (dry + real) post `lookback_days: 7` → change to `30`.

**3. Edge function default → 30d** (`supabase/functions/gclid-oci-loop/index.ts`)
- Change `let lookbackDays = 7;` → `30` so the every-2h cron (which posts no body) also scans 30 days.
- Header copy in the page ("runs every 2h, matching VS sales → captured GCLIDs") stays; no functional change beyond default window.

No schema or RLS changes. No backfill SQL needed — the 711 older rows already exist in `oci_upload_log`; widening the window simply exposes them in the UI.

## Why

You confirmed downtime caused missed matches. Pulling the window to 30d on the cron, manual run, and the table view lets the next run sweep up anything VS booked in the last month, and surfaces the full historical log on the page by default.
