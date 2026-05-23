
## Goal

1. Loop Lindy in on Slack to co-design the best "build while Blair is offline" method.
2. Ship a live **`/kennel/backlog`** page so the approved queue is visible in The Kennel (not buried in /cms).
3. Start knocking items off the top of the stack.

---

## Step 1 — Ask Lindy on Slack (one message, this turn)

Post this in `#lindy-lovable` via the slack-events bot path (or `lindy-promote` reverse channel if it's the path Lindy listens on). Message body:

> Lindy — Blair approved 13 items in /cms/lindy-inbox. Lovable only builds when prompted in-chat, so the backlog is static while he's offline.
>
> Three options to make this autonomous. Which fits your runtime best?
>
> **A. Lindy executes non-code items herself** (GTM tags, ad-set changes, Mailchimp, sheets, emails). Code items wait for Blair. Lowest risk, fastest unblock.
>
> **B. Lindy pings Lovable chat via API** for code items — needs a Lovable inbound webhook + per-prompt budget cap.
>
> **C. GitHub PR workflow** — Lindy opens PRs from approved items; Blair (or a CI bot) merges; Lovable rebuilds from main.
>
> For each, tell me: (1) which categories you'll own, (2) what guardrails you want (budget cap, allowlist of areas, max items/day), (3) what signal you need back from Lovable (status row in `lindy_inbox`, Slack thread reply, email).
>
> Default if no answer in 24h: A + B (Lindy auto-runs her items; code items queue with a daily digest to Blair).

We wait for Lindy's reply in `lindy_inbox` (it'll land as `slack_message` and auto-approve) before wiring any executor.

---

## Step 2 — Build `/kennel/backlog` (live view)

A Kennel-only page (admin/ad-ops/owner gated; **not** visible to CMS editors — per Blair's Slack note about hiding from low-level CMS).

**Sections (top to bottom):**

1. **Header strip** — total approved count, count by priority, "Last refreshed" timestamp.
2. **Filters** — area chips (`kennel | cms | admin | all`), priority (`high | normal | low`), source (`lindy | slack | human`), search box over title/body.
3. **Card list** — each row:
   - Priority pill (red=high, grey=normal)
   - Title + area + submitted timestamp + submitter
   - Collapsed body (expand-on-click; first 220 chars preview)
   - Status badge: `approved | in_progress | done | blocked | needs_blair`
   - Owner: Lindy / Lovable / Blair (auto-suggested from area + content)
   - Action buttons: **Start** (sets in_progress), **Mark Done**, **Block** (with note), **Push back to Lindy**, **Copy prompt** (for pasting into Lovable chat)
4. **"What's actually moving" rail** (sidebar) — items where `status='in_progress'` with last-update time.
5. **Daily digest button** — emails Blair a Markdown summary of yesterday's done/blocked/started.

**Data model additions to `lindy_inbox`:**
- `workflow_status` enum: `approved | in_progress | done | blocked | needs_blair` (separate from review `status` so we don't lose the approval signal)
- `owner` text: `lindy | lovable | blair | unassigned`
- `workflow_updated_at` timestamptz
- Index on `(workflow_status, created_at)`

**Routing & access:**
- New route `/kennel/backlog` in `src/App.tsx`
- New page `src/pages/kennel/KennelBacklogPage.tsx`
- Add nav link in Kennel sidebar; gate via `can_view_kennel(auth.uid())`
- Hide the existing `/cms/lindy-inbox` link from CMS sidebar for non-admin roles (per Blair's Slack instruction); page stays reachable by URL for admins only.

---

## Step 3 — Start working items top-down

Once the page is live, I'll begin executing the items I can do directly in Lovable. Priority order from the backlog:

1. **#5 RLS on `lindy_inbox` for anon** — already done today; mark `done`.
2. **#8 Grant Lindy CMS admin access** — confirm `lindy@…` user has `cms_editor` role; small migration if not. (Owner: Lovable)
3. **#9 Fix /cms/lindy-inbox UI — human-readable cards** — refactor the page to match the new backlog card design we're shipping for /kennel/backlog. (Owner: Lovable)
4. **#7 Blair email deliverability** — check Resend logs for `blair.lott@rescuedogwines.com` and report. (Owner: Lovable, diagnostic only)
5. **#1 & #4 GTM GCLID tags** (`GTM-5DBQXWP7`, `GTM-NHTH66HM`) — **Lindy-owned**, marked `needs_lindy` in the backlog. I can't deploy GTM containers; surface as blocked-on-Lindy.
6. **#2 Evergreen Max Volume activation** — **Lindy-owned** (Meta ad set edits). Surface as blocked-on-Lindy.
7. **#6 Tiered seed audience scoring**, **#10 MABWiser bandit**, **#12 Segflow**, **#13 IAB taxonomy** — design specs needed first. Park as `needs_blair` until he scopes.

Each item I touch in this batch: I update `workflow_status` in `lindy_inbox`, post a one-liner Slack thread reply to Lindy, and append a Changelog entry to the Lindy manual per the core memory rule.

---

## Technical details

- **Migration**: add `workflow_status`, `owner`, `workflow_updated_at` columns + index to `public.lindy_inbox`; backfill `workflow_status='approved'` where `status='approved'`. RLS: admins/kennel viewers can read; only admins can update workflow fields.
- **RPC** `update_backlog_item(_id uuid, _status text, _owner text, _note text)` — security definer, admin-only, writes `workflow_status`, optional Slack thread reply via a new `slack-post` edge function.
- **Edge function** `slack-post` (new) — posts to `#lindy-lovable` using the existing `SLACK_BOT_TOKEN`, so backlog actions echo into Slack for Lindy.
- **Frontend**: `useBacklogItems()` hook with React Query polling every 30s + Realtime subscription to `lindy_inbox`.
- **Hide CMS link**: in `src/components/cms/CmsNav.tsx` (or wherever the Lindy Inbox link lives), filter the link out unless `roles` includes `owner|admin`.

---

## Out of scope for this plan

- Actually building the Lovable-API inbound webhook (Option B) until Lindy confirms.
- Touching wine/merch catalog code.
- Any GTM/Meta API writes (those are Lindy's lane).

---

## Done criteria

- Slack message sent to Lindy and landed in `lindy_inbox` for audit.
- `/kennel/backlog` renders 13 cards, filters work, status updates persist, Realtime refresh works.
- `/cms/lindy-inbox` no longer appears in CMS nav for non-admin CMS roles.
- Items #5 and #8 marked `done`; #1/#2/#4 marked `needs_lindy`; #6/#10/#12/#13 marked `needs_blair`; #7 has a diagnostic note attached.
- Changelog entries appended to `/mnt/documents/Lindy_User_Manual_and_Roadmap.docx`.
