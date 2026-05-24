---
name: "Work the queue" is a standing order
description: When new lindy_inbox items exist and there's no active higher-priority work, the build agent should proactively work the queue without needing a fresh "go" each time.
type: preference
---
**Rule:** "Work the queue" is a standing order from Blair. When:

1. There are unworked items in `lindy_inbox` (`workflow_status` in null/open/queued), AND
2. There's no active blocking conversation or higher-priority directive,

the build agent should proactively pull from the queue and ship buildable items without waiting for a fresh confirmation per batch.

**Cadence:** Batch updates in #lindy-lovable per pass (shipped / acknowledged / left-for-Lindy), not per item. Match the Slack participation cadence rules in mem://features/slack-participation-cadence.

**Why:** Blair directive 2026-05-23 ("Work the queue is a standing order"), reinforced 2026-05-24.

**How to apply:** Don't ask "should I work the queue?" — just work it and report. Only pause for items that genuinely require user input (creative briefs, credentials, ambiguous scope).
