## Remove "Sync from live site" from Supported Rescue Organizations

The Mission page admin toolbar still has a **Sync from live site** button (used pre-launch to pull the rescue partner list from the legacy WordPress site). Now that we're launched, the directory is edited in-place via Add Partner / row edit, so the sync button is obsolete and confusing.

### Changes (`src/pages/MissionPage.tsx`)
- Remove the `Sync from live site` button from the Edit Mode toolbar (lines 248–251).
- Remove the now-unused `handleSyncFromLive` function, `isSyncing` state, and the `RefreshCw` icon import.
- Keep the `+ Add Partner` button and the rest of the admin Edit Mode bar untouched.

### Not touching
- The `sync-rescue-partners` edge function and the `useRescuePartners` hook stay in place (no other callers, but harmless and may be useful for one-off re-imports). Tell me if you want them deleted too and I'll add a cleanup step.
