---
name: AI Architecture
description: Bake AI into the system via Lovable AI Gateway; expose read-only surface to Lindy for human-in-loop workflows only
type: preference
---
**Default: bake AI in.** All core AI features (depletion parsing, retailer discovery, signal scoring, compliance checks, Mailchimp sync) run as Lovable Cloud edge functions using Lovable AI Gateway. No third-party AI orchestrator in the critical path.

**Lindy is allowed only for:**
- Human-in-the-loop approval chains (Slack ping → approve → CRM action)
- One-off scrapes from systems we don't have a first-party adapter for
- Email drafts where a human edits before send

**Lindy access pattern:** read-only Postgres role OR a `/api/lindy/*` edge function. Lindy never writes to core tables. It can only insert into `lindy_inbox`, which a human or internal job promotes.

**Claude / external models:** only add if a specific task beats Gemini/GPT-5 in our own evals. Default to Lovable AI Gateway models — no extra key, unified logging, automatic retry.

**Why:** lower latency, single bill, single auth surface, compliance logic (tied-house) stays in-house, no drift between Lindy state and CRM.