# Continuation Prompt — Phase 21 / D2a: plans have a writer. D2 next

Phase 20 shipped Discord identity linking (D1). Phase 21 closes the gap that
the Skool-billing decision opened — `plan_code` now has exactly one writer
and an audit trail — and makes the app defer to the WordPress apex on
marketing.

**D2 (groups and caps) is the next build step, and nothing blocks it.**

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

`docs/fiveup-continuation-phase20.md` carries D1 and the two extraction
seams. `docs/fiveup-continuation-phase19.md` still holds the points economy
spec and the standalone-product track verbatim.
`docs/discord-setup.md` is the Discord portal walkthrough.

## What Phase 21 shipped

**Migration** `20261016120000_phase21_plan_grants.sql`, **applied to the live
database** via the Management API.

### Plans have one writer

`plan_code` decides match quotas, browse access, publishing, the Discord Pro
role and which points spends a member is eligible for. Before this it was
written by two things: the `'sprout'` default in `handle_new_auth_user`, and
a direct table write. There was no RPC and no admin control — fine while
nothing was sold, not fine now that `bloom` means "paid Skool member".

- **`set_member_plan(user_id, plan_code, source, external_ref, note)`** —
  admin or service role, refuses the retired `flourish`, writes nothing when
  the plan is unchanged (an audit trail full of no-ops hides the changes),
  and appends a `plan_grants` row on every real move.
- **`plan_grants`** — append-only history: plan, previous plan, source,
  external reference, who granted it, note, timestamp.
- **`member_plan_state(user_id)`** — plan plus where it came from. A member
  may read their own; admins read anyone's. Reports `source = 'signup'` when
  no grant row exists, which is what every free account looks like.
- **`admin_search_members(query)`** — finds a member by email, display name
  or handle, with plan, plan source, and their Discord and Skool references.
  The admin has an email, and email lives in `auth.users`; without this the
  control would mean pasting UUIDs, which is how a feature gets abandoned.
- **Admin UI** — a Member plans section on `/admin`, admin-only, with
  sprout/bloom buttons and an optional Skool-email reference. Supplying a
  reference records `source = 'skool'`; a bare decision records `'admin'`.

**`source` is the cheap hedge.** Skool is the billing system and there is no
Stripe. Recording *where* an entitlement came from means adding Stripe later
is a second caller of one RPC, not a refactor of everything that reads a
plan. The Skool webhook is deliberately unbuilt — admin-by-hand is the launch
mechanism and the permanent fallback for every case email matching misses.

### Marketing defers to the apex

`proofsignals.net` is WordPress on SiteGround; the app is
`app.proofsignals.net`. The app's `/`, `/how-it-works`, `/pricing`,
`/community`, `/safety` and `/demo` duplicate that site, so they now carry
`MARKETING_ROBOTS` (`index: false, follow: true`) and have left the sitemap.
The app publishes **the record** — `/u/[username]` and `/a/[slug]`, the pages
Skool and the apex link into — plus `/proof-market`, which is a product
surface WordPress does not duplicate.

Unindexed rather than disallowed in `robots.txt` on purpose: a disallowed
page is never crawled, so its noindex is never seen and an already-indexed
page stays indexed. Crawlable plus noindex is what actually removes it.

**Verify:** `node verify-phase21.mjs` — 61 checks. `verify-phase20` 70,
`verify-phaseA` 66, `verify-phase19` 28, `verify-phase17` 12,
`verify-phase15` 11 all green. Build and lint clean.

**Branch:** `claude-phase-21-plans-and-surfaces`, stacked on
`claude-phase-20-identity` (PR #21), which is stacked on `main`.

## The bug worth remembering

The append-only trigger was first written `FOR EACH STATEMENT`. That broke
**every account deletion in the system**, including accounts that had never
granted anything.

`plan_grants.granted_by_user_id` is `on delete set null`, so deleting any
profile makes Postgres issue a referential-integrity
`UPDATE plan_grants SET granted_by_user_id = NULL WHERE ...`. A
statement-level trigger **fires even when that update matches no rows**, so
the trigger aborted the delete regardless.

The fix is `FOR EACH ROW` plus one narrowly permitted update: nulling
`granted_by_user_id` when every other column is byte-identical. Everything
that makes the row evidence — subject, plan, previous plan, source,
reference, note, timestamp — stays immutable, and a deleted admin leaves a
null rather than a dangling pointer. `verify-phase21.mjs` covers both
deletion directions and three ways of trying to smuggle a change through the
permitted one.

**Generalise it:** the points ledger will want the same append-only
property, and it will have the same problem. Use `FOR EACH ROW`, and decide
explicitly what the FK actions are allowed to do before writing the trigger.

## Decisions locked in Phases 20–21

| Thing | Call |
| --- | --- |
| Discord server name | **5⭐️s** — Questmates stays unspent for the game layer |
| App host | **`app.proofsignals.net`**; apex is WordPress on SiteGround |
| `sprout` | Free Skool member |
| `bloom` | Paid Skool member — the "Pro" tier throughout the spec |
| `flourish` | **Retired.** Dormant in the enum; `set_member_plan` refuses it |
| Billing | **Skool.** No Stripe, and none planned until ProofSignals opens outside Skool |
| Plan sync | **Admin by hand now**; the Zapier webhook when volume justifies it |
| Marketing | WordPress owns it; the app noindexes its duplicates |

## Next: D2 — groups and caps on the site

The spec's ordering rule: **groups work on the site before they work in
Discord.** The site is the source of truth and the bot is a client of it, so
every Discord command in D3 lands on a tested RPC.

Scope: `groups` + `group_members`; create / invite / join / leave / close
RPCs; `recommend_group_members`; the three new plan gates; `in_group_id` and
`discord_thread_id` on `matches`; a Groups tab on the dashboard.

**Done when:** a member creates a private group and invites from the
recommendations; a free member is stopped at their concurrency cap by the
database; a group pairing does not consume match quota.

### Everything D2 needs is now decided

- **Cap numbers** (gate rows, changeable without a deploy):

  | Gate key | `sprout` | `bloom` | `flourish` (dormant) |
  | --- | --- | --- | --- |
  | `max_concurrent_matchups` | 1 | 3 | 3 |
  | `feedback_groups_per_month` | 1 | 3 | 3 |
  | `max_concurrent_groups` | 1 | 3 | 3 |

  Seed `flourish` as a twin of `bloom`: a dormant tier with undefined gates
  is a surprise waiting for whoever assigns it by accident.

- **Group pairings do not consume match quota.** Add `in_group_id` to
  `matches` and skip the monthly usage increment when it is set. The member
  made one decision — join a group — so charge them one group, not six
  pairings. Concurrency still applies to real 1-on-1 match-ups.
- **An asset is required to join a feedback group**, enforced at join time
  with a clear message. The schema requires it anyway: no asset → no match →
  no feedback.
- **Group sizes:** feedback groups 4–6, challenge cohorts up to 12 (and as
  small as 2).
- **Who creates groups:** `sprout` one open group at a time, `bloom` three,
  through `plan_feature_limit`.
- **`recommend_group_members`** wraps `eligible_match_candidates` for the
  owner, filters by the group's Track, drops anyone already in or invited,
  and keeps only candidates passing `pair_respects_separation_preferences`
  against **every** current member — a four-person group needs all six pairs
  to pass, where a two-person match had one.

### One thing D2 should not repeat

`recommend_group_members` calls `eligible_match_candidates`, which carries
the Phase A surface guard and raises `matching is handled in Discord` unless
the surface is `web`, the caller is the service role, or the caller is an
admin. The gate is seeded `web`, so it passes today — but D3's flip to
`discord` would silently break the recommender for members. Either call the
underlying query rather than the gated RPC, or make the recommender pass the
guard explicitly, and have `verify-phase22.mjs` assert it works with the
gate set to `discord`.

## Phase 21b — the pricing lander

Migration `20261016130000_phase21b_public_plan_caps.sql`, applied live.
`node verify-phase21b.mjs` — 32 checks.

`public_plan_caps()` is a security-definer reader over a **whitelist** of
`plan_feature_gates` keys, granted to `anon`. The policy on the table itself
was deliberately not widened: publishing a cap is now a one-line act and a
new internal gate (like `match_surface`, or whatever D2 and the points phase
add) stays private by default.

Three things worth knowing:

- **`PLANS` was the worst of `mock-data.js`.** It restated caps as hardcoded
  strings while `plan_feature_gates` was the only thing enforcing them, named
  three tiers at $0/$29/$79 when there are two and no Stripe, and tied no
  card to a `plan_code`. It now lives in `src/lib/fivestarz/plans.js` as
  copy only — every number comes from the gates. `mock-data.js` gained a
  header separating its real configuration from its fake sample data, which
  is still read by the dashboard and Browse.
- **A long-standing flex bug surfaced.** `FeatureText` returned a bare
  fragment, and every caller renders it inside a `display: flex` row — so a
  feature line containing a link became three side-by-side columns instead of
  one sentence. It returns a `<span>` now. This affected the homepage too.
- **Phase A's brand guard needed narrowing, not weakening.**
  `verify-phaseA.mjs` asserted no "Proof Lab" string survives in the UI,
  because the marketplace was renamed Proof Market. "IndieOps Proof Lab" is
  now a Skool group — a different thing sharing the words. The check now
  allows the group sense *and* separately forbids "Proof Lab" attached to a
  marketplace noun, because exclusion alone would have let "the Proof Lab
  listings" through. Both relapse shapes were tested against the new rule.

## Points economy: three rules decided 2026-10-17

The points phase is still unbuilt (it follows D5), but these are locked and
are in the build spec under *Nothing pays without a pre-registered goal*.

**Nothing pays without a pre-registered goal.** Pre-definition already stopped
a reward being invented after the fact; this stops one being claimed for
something that was already true. **The starting state is recorded before the
work, and the award pays on the change.**

- **Catalog goals capture a baseline when selected.** When a member picks a
  milestone goal, or a group freezes its `point_schedule`, the starting
  number and its evidence link are written down then. "Reach 1,000 followers"
  pays only someone who was below 1,000 at registration. The
  `(member, goal, platform)` uniqueness stops double payment but does nothing
  about someone already past the milestone on day one.
- **Anything outside the catalog is registered with the admin first** —
  beginning state, end state that counts, how it will be evidenced. The admin
  approves, adjusts or rejects and **sets the award at that point**. An
  unregistered accomplishment cannot be claimed later, whatever the evidence.
- **Registering is declaring intent, not asking for points.** The direction
  rule holds: the award still arrives when someone *else* recommends it and
  the admin approves. A member may say what they are about to do; they cannot
  award themselves for having done it.
- **An approved custom goal is published to its group**, the way a frozen
  schedule is. Admin-set awards put discretion back into a deliberately flat
  map, and publishing the goal and its award at approval time is what keeps
  the fairness story intact.

**SOC 2 compliance stays out of the catalog**, as the archetype of the custom
path. A flat 25 or 50 misprices it in both directions, and its evidence is not
public — a SOC 2 report is delivered under NDA, so what exists is an auditor's
attestation letter, not a page anyone can open. Registered up front with scope
and audit window, evidenced as `screenshot`, priced by the admin.

*Schema shape for whoever builds it:* a `point_goals` row per registration —
`user_id` or `group_id`, `catalog_key` (null for custom), `baseline_state`,
`baseline_evidence_url`, `target_state`, `evidence_kind`, `award_points`,
`status`, `approved_by_user_id`. Claims reference `point_goal_id`. The ledger
and this table both want to be append-only: **use `FOR EACH ROW`** and work
out what the FK actions are allowed to do first — see *The bug worth
remembering* above.

## Still open

- **The Skool → plan webhook.** Deferred, not forgotten. When built:
  `POST /api/skool/membership` guarded by `SKOOL_WEBHOOK_SECRET`, driven by
  Zapier polling Skool (its official app offers two polling triggers, all
  keyed by email), resolving the member by email and calling
  `set_member_plan(..., 'skool', <email>)`. It should also write the
  `member_identities(provider = 'skool')` row — **exactly** the row the
  points economy's course-unlock Zap needs later. D1 already supports
  `provider = 'skool'` with no schema change. Needs a Skool Pro plan.
- ~~`/pricing` still advertises Free / $29 / $79~~ **Done 2026-10-16 as
  Phase 21b.** `/pricing` is now a lander feeding the two Skool groups:
  **IndieOps Proof Lab** (free, `sprout`) and **IndieOps Incubator** (paid,
  `bloom`, with the all-access software pass). Caps on each card are read
  live from `plan_feature_gates` through the new anon-readable
  `public_plan_caps()`, so the cards cannot drift from what the database
  enforces — and D2's three new gates will appear on the cards by themselves
  once seeded, with no edit and no deploy. `PLANS` moved out of
  `mock-data.js` into `src/lib/fivestarz/plans.js`.
  Live destinations (2026-10-17): the free card opens
  `https://www.skool.com/indieops-proof-lab-2789/about`, the paid card opens
  `https://indieops.co/incubator/apply`, and the Incubator is **$99 / month**,
  billed through Skool after an accepted application. Both URLs are defaults
  in `plans.js` rather than env-only — they are public links on a public page,
  so a deploy that forgets an env var should still reach the right place.
  `NEXT_PUBLIC_SKOOL_FREE_URL` / `NEXT_PUBLIC_SKOOL_PAID_URL` remain as
  overrides. `/pricing` stays noindexed: it is a page you send people to,
  not one they find.
- **Discord setup steps 6–7** wait on `app.proofsignals.net` pointing at
  Vercel. Steps 1–5 can be done any time; see `docs/discord-setup.md`.
- **One rating per pair, ever.** `member_feedback_ratings` is
  `unique (rater_user_id, rated_user_id)`. The spec's pick is to widen it to
  `(rater, rated, feedback_submission_id)` in D4, because repeat pairings are
  the normal case in a group product.
- **The standalone-product brief.** Unstarted. Market, what extracts now
  that the seams exist, what multi-tenancy costs, the competitive scan
  (MEE6/Arcane; Circle/Heartbeat/Mighty Networks; anything already bridging
  Skool and Discord), and a recommendation.

## Decisions locked — do not relitigate

Groups are **both** user-created and matcher-suggested · Discord ships
**before** points · private groups are Discord **private threads**, not
channels (500-channel cap) · a match-up is a `matches` row plus
`discord_thread_id`, `groups` is for 3+ · challenge cohorts can be as small
as 2 · **no admin approval on match-ups** — caps are enforced in
`create_match` · group pairings are **exempt** from monthly match quota via
`in_group_id` · review separation shows **degrees 1–4 bare**, no guidance
text, never names an intermediary, never compares channels · non-member
edges are **admin-only** to view and dispute · **URL-only dedupe** for
non-member nodes, no global name picker · **no points for any review** ·
points are recommended *to* you, never requested *by* you · the dues refund
is retired · the match-surface gate is seeded `web` until D3 lands.

## Constraints that bite (verified in the migrations)

1. `feedback_submissions.match_id` is `not null` — feedback cannot exist
   without a match row.
2. `matches` requires an asset on **both** sides, so joining a feedback
   group has to require an asset.
3. `matches.source` — **still half done.** Phase A widened the table CHECK to
   include `'discord'`. `create_match`'s own member-input check still accepts
   only browse/queued, so the service-role writer remains D4 work.
4. `member_feedback_ratings` is `unique (rater_user_id, rated_user_id)`.
5. **The bot still cannot call existing member RPCs.** They resolve the
   caller from `auth.uid()`, which is null for a service-role call. D1's
   bot-facing RPCs take the external id as an argument and check
   `auth.role()` themselves; D4's act-as argument is still owed.
6. **`user_profiles` takes no direct writes** from `anon` or `authenticated`
   (revoked in `20260715120000`). That is why a member cannot promote
   themselves to `bloom` despite the permissive `profiles_update_self`
   policy — **do not loosen it.**

## The two seams

Unchanged from Phase 20, and `verify-phase20.mjs` enforces them by grepping
imports: nothing under `src/lib/discord/` imports Supabase, nothing under
`src/lib/community/` imports Discord, and route handlers are the only
composition roots. D2's group RPCs belong behind the community port when D3
reaches them — add the operations to `src/lib/community/port.js` first, so
the next adapter knows what it owes.

## Ops notes

Migrations are applied live via the Supabase Management API (see the
`db-migration-verify-workflow` memory); the repo is not linked to the CLI.
Production needs `RESEND_*`, `ANTHROPIC_API_KEY`, and the `DISCORD_*` set in
`docs/discord-setup.md`. Set `NEXT_PUBLIC_SITE_URL` to
`https://app.proofsignals.net` in Vercel, and optionally
`NEXT_PUBLIC_MARKETING_URL` to the apex.
