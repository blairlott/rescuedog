---
name: Post-Build QA + Slack Loop
description: Mandatory QA, debug, and optimization pass after every build, plus Slack update with Lindy+Claude review before publish
type: preference
---
**Standing order — runs after EVERY build, before any publish:**

1. **QA pass** — verify the change actually works: build output clean, target flow exercised (edge fn curl, DB read, or browser smoke), no new console/runtime errors, no broken imports/types.
2. **Debug pass** — scan recent console logs, edge function logs (`supabase--edge_function_logs`), and runtime errors for regressions introduced by the change. Fix anything new before moving on.
3. **Resource/perf optimization pass** — check for: N+1 queries, missing indexes on new filters, oversized client bundles, unbatched edge fn calls, unnecessary re-renders, missing memoization on hot paths, redundant Shopify/Supabase round-trips. Fix or note.
4. **Slack update** — post a build summary to `#lindy-lovable` via Slack connector: what shipped, files touched, QA result, any follow-ups. Tag Lindy + request Claude QA review in the same thread so the feedback loop stays tight.
5. **Only then** mention publish / surface `<presentation-open-publish>`.

**How to apply:** Treat steps 1–4 as part of "done" — never declare a task complete or invite publish without them. If backend is degraded (DB pooler down, etc.), say so in the Slack post and defer publish suggestion until verified.
