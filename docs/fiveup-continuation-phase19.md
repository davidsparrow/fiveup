# Continuation Prompt — Phase 19: review solicitation retired; Discord next

Two threads live here: finishing the Discord build (D1–D6, specced but not
started) and a new commercial question — whether the Discord layer is a
standalone product.

## Read these first

The design lives in **Claude Docs**, not in this repo. Read them with the
Claude Docs connector (`read` project id → file id → node id). Never
WebFetch an artifact URL.

- **Questmates Discord Build Spec** (the live one, edit it as decisions land)
  https://claude.ai/code/artifact/cba64031-9739-4da1-a29a-dc3c2e83db9e
- **fiveup / ProofSignals Refactor Plan** (2026-09-24, partly superseded)
  https://claude.ai/code/artifact/a79ea4fc-3bd9-4a66-8174-cd0000229abd
- **IndieOps Launch Strategy v2** (2026-09-17, the layer model and gates)
  https://claude.ai/code/artifact/898d94d2-8215-47da-9003-3883e8bff339

## What Phase 19 did

The platform never raises online reviews. `request_review_post` did the
opposite — it let a feedback recipient ask their reviewer to post a public
review on a named external channel, drove the match lifecycle into
`awaiting_post`, and rendered "Post Requested" on the dashboard. Retired.

- **Migration** `20261015120000_phase19_retire_review_solicitation.sql`,
  **already applied to the live database** via the Management API. Dropped
  `request_review_post`, `respond_review_post_request`, `mark_review_posted`.
  Renamed `review_post_requests` → `external_review_reports`, anchored on
  `match_id` instead of one feedback submission, with `subject_user_id`,
  `author_user_id`, `reported_by_user_id`, `corroborated_by_user_id`.
  Statuses are now `reported` / `confirmed` / `disputed` / `retracted`.
- **`report_external_review(match_id, channel, i_am_the_author, posted_url)`**
  records a review that happened elsewhere, in either direction, and
  **auto-confirms when the other participant reports the same thing** — the
  rule that keeps the admin queue bounded.
  `retract_external_review_report(id)` lets the reporter take it back.
- **`submit_feedback` now lands a finished match on `completed`**, not
  `awaiting_post`. `awaiting_post` and `posted` stay in the `match_status`
  enum as dormant values (removing one means recreating the type).
- **Pipeline lost its last two stages.** `match-pipeline.js` is now
  matched → your feedback → their feedback → complete. The dashboard's
  "Request Post" button became a quiet "Record an outside review" control
  (`ReportReviewModal`), and `listMyMatches` returns `externalReviewReports`
  instead of `theirFeedbackPostRequest`.
- `HowPage.jsx` needed no edit — its copy already said public review links
  are "never expected, never requested".

**Verify:** `node verify-phase19.mjs` (28 checks) and `node
verify-phase17.mjs` (12, rewritten for the four-stage pipeline). Build clean.

**Branch state:** `claude-phase-19`, cut from `claude-phase-18`.
**Not committed, not pushed.** Phases 16–18 are also unpushed. Changed:
`seed-demo.mjs`, `DashboardPage.jsx`, `data.js`, `match-pipeline.js`,
`mock-data.js`, `verify-phase17.mjs`; new: the migration and
`verify-phase19.mjs`.

## Unfinished: the Discord build, D1–D6

None of it is started. The repo still contains no `discord` or `skool`
string outside Phase 19's comments.

| Step | Scope |
| --- | --- |
| D1 | `member_identities`; Discord as a Supabase auth provider; Link Discord on `/account`; `/link` one-time-code fallback; Member role on success |
| D2 | `groups` + `group_members`; create/invite/join/leave/close RPCs; `recommend_group_members`; the three new plan gates; `in_group_id` and `discord_thread_id` on `matches`; dashboard Groups tab |
| D3 | The interactions endpoint, Ed25519 verification, `/group *`, `/me`, private-thread creation |
| D4 | Widen `matches.source`; the service-role act-as path; `assert_active_user`; `/feedback` |
| D5 | Challenge cohorts (`kind = 'challenge'`, 2–12 people), `#checkpoints`, the Pro gate |
| D6 | `review_channels` catalog (migrate `asset_channels.channel_name` off free text), `member_channel_identities`, `review_nodes`, `review_events`, `review_separation_for_match`, the end-of-match prompt, `/account` reviews section, admin master view |

## Decisions locked — do not relitigate

Groups are **both** user-created and matcher-suggested · Discord runs
**alongside** the web matching surface (the Sep 24 "Phase A" archive is
dropped) · Discord ships **before** points · private groups are Discord
**private threads**, not channels (500-channel cap) · a match-up is a
`matches` row plus `discord_thread_id`, `groups` is for 3+ · challenge
cohorts can be as small as 2 · **no admin approval on match-ups** — caps are
enforced in `create_match`, with one new `max_concurrent_matchups` gate ·
group pairings are **exempt** from monthly match quota via `in_group_id` ·
review separation shows **degrees 1–4 bare**, no guidance text, never names
an intermediary, never compares channels · non-member edges are
**admin-only** to view and dispute · **URL-only dedupe** for non-member
nodes, no global name picker.

## Constraints that bite (verified in the migrations)

1. `feedback_submissions.match_id` is `not null` — feedback cannot exist
   without a match row.
2. `matches` requires an asset on **both** sides, so joining a feedback
   group has to require an asset.
3. `matches.source` carries `check (source in ('auto','browse','queued'))`
   **and** `create_match` raises on anything but browse/queued. Adding
   `discord` is a migration plus a function replace, not a convention.
4. `member_feedback_ratings` is `unique (rater_user_id, rated_user_id)` —
   one rating per ordered pair, ever. Open question whether to widen it.
5. **The bot cannot call existing member RPCs.** They resolve the caller
   from `auth.uid()`, which is null for a service-role call. Fix is an
   act-as argument honoured only when `auth.role() = 'service_role'`.

## Open questions

Twenty of them, at the end of the spec in three groups. The ones that block
the next step: the cap numbers, whether group pairings consume match quota,
group sizes, who can create a group, and whether a 1-on-1 gets a thread.

## New track: is the Discord layer a standalone product?

The ask: explore extracting the Discord app architecture as a codebase that
could be sold to other Skool groups, or to Skool itself.

**Do this before writing D1–D3 code**, because the cheap insurance is a seam,
and the seam is nearly free to build now and expensive to retrofit: the bot
layer should never import Supabase directly. Have `src/lib/discord/*` depend
on a narrow adapter interface (resolve identity, create group, add member,
list recommendations, record interaction) with a ProofSignals implementation
behind it. That one rule is the difference between "extract it" and
"rewrite it", and it costs a day.

What to work out:

- **What is actually generic?** Identity linking, thread-backed groups with
  per-plan caps, an anti-repeat recommender, the HTTPS interactions pattern,
  an assist ledger with an approval queue, leaderboards, a web record of it
  all. What is *not*: assets, feedback submissions, stars, review
  separation, the moderation blocklist. The sellable core is the community
  operations layer, not the reputation product.
- **Who is the buyer?** Skool group owners who also run a Discord is the
  plausible market. Selling to Skool itself is probably a non-starter and
  worth checking rather than assuming: Skool positions *against* Discord,
  and already ships a (like-based) points and levels system it will not want
  replaced. Verify both claims before building a pitch on them.
- **Multi-tenancy is the real engineering cost.** Today's design is
  single-tenant throughout — one guild, one Supabase project, one
  service-role key, RLS written against a single community. Two paths:
  `tenant_id` on every table with RLS rewritten, or one managed install per
  customer. The second is far cheaper to reach and sells as a service;
  price the first before choosing it.
- **Discord's own limits help here.** An HTTPS interactions bot needs no
  privileged intents and no gateway connection, so scaling to many servers
  is mostly a verification exercise, not an infrastructure one.
- **Competitive scan**, which has not been done at all: MEE6, Arcane and the
  engagement-bot tier; Circle, Heartbeat and Mighty Networks on the cohort
  side; whatever exists specifically bridging Skool and Discord. The honest
  question is whether the Squad/Mission/Assist model is differentiated or
  just unbundled.

Deliverable for this track: a short written brief — market, what extracts,
what the seam costs, and a recommendation — not code. Then decide.

## Ops notes

Migrations are applied live via the Supabase Management API (see the
`db-migration-verify-workflow` memory); the repo is not linked to the CLI.
Production still needs `RESEND_*` and `ANTHROPIC_API_KEY`. Discord will add
`DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`,
`DISCORD_GUILD_ID`, `DISCORD_INVITE_URL`. **Point `proofsignals.net` at the
Vercel project before setting the Interactions Endpoint URL** — that URL is
effectively permanent once Discord verifies it.
