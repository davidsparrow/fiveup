# Continuation Prompt — Phase 22 / D2: groups and caps. Nothing blocks it.

Everything through the pricing lander is **merged to `main`** (PRs #21, #22,
#23) and applied to the live database. `app.proofsignals.net` is live.

**The next build step is D2 — groups and caps on the site.** It is fully
specced and every decision it needs has been made. Start there.

## Read these first

The design lives in **Claude Docs**, not in this repo. Read them with the
Claude Docs connector (`read` project id → file id → node id). Never
WebFetch an artifact URL.

- **Questmates Discord Build Spec** — the active one. Edit it as decisions
  land. https://claude.ai/code/artifact/cba64031-9739-4da1-a29a-dc3c2e83db9e
- **fiveup / ProofSignals Refactor Plan** (2026-09-24, partly superseded)
  https://claude.ai/code/artifact/a79ea4fc-3bd9-4a66-8174-cd0000229abd
- **IndieOps Launch Strategy v2** (2026-09-17, layer model and phase gates)
  https://claude.ai/code/artifact/898d94d2-8215-47da-9003-3883e8bff339

In the repo: `docs/discord-setup.md` is the Discord portal walkthrough.
`docs/fiveup-continuation-phase19.md` holds the points-economy spec verbatim.
Phases 20 and 21 have their own continuation docs for detail on D1 and D2a.

## Where things stand

| Area | State |
| --- | --- |
| **D1 — identity** | Shipped. `member_identities`, both linking roads, the interactions endpoint, `/link` |
| **D2a — plan grants** | Shipped. `set_member_plan`, `plan_grants`, admin control |
| **Pricing lander** | Shipped. `/pricing` feeds the two Skool groups, caps read live from the gates |
| **D2 — groups and caps** | **Next. Not started.** |
| D3–D6 | Not started. D3 is smaller than the spec says — see below |
| Points economy | Specced, unbuilt. Follows D5 |
| Standalone-product brief | Not started. Written deliverable, not code |

**Live infrastructure.** `app.proofsignals.net` is pointed at Vercel and
propagated. `NEXT_PUBLIC_SITE_URL` is set — the live `robots.txt` reports
`Host: https://app.proofsignals.net`. The interactions endpoint answers:

```
GET https://app.proofsignals.net/api/discord/interactions
→ {"endpoint":"discord-interactions","ready":false,"canGrantRoles":false}
```

`ready:false` is correct and expected: it means `DISCORD_PUBLIC_KEY` is not
set in Vercel yet. **Every Discord portal step is now unblocked** — see
`docs/discord-setup.md`. Nothing in D2 depends on them.

**Verification suites, all green on `main`:** `verify-phase21b` 36,
`verify-phase21` 61, `verify-phase20` 70, `verify-phaseA` 66,
`verify-phase19` 28, `verify-phase17` 12, `verify-phase15` 11.

## Next: D2 — groups and caps on the site

The spec's ordering rule: **groups work on the site before they work in
Discord.** The site is the source of truth and the bot is a client of it, so
every Discord command in D3 lands on a tested RPC, and a Discord outage
degrades to a usable product rather than no product.

**Scope:** `groups` + `group_members`; create / invite / join / leave / close
RPCs; `recommend_group_members`; the three new plan gates; `in_group_id` and
`discord_thread_id` on `matches`; a Groups tab on the dashboard.

**Done when:** a member creates a private group and invites from the
recommendations; a free member is stopped at their concurrency cap *by the
database*; a group pairing does not consume match quota.

**Rollback:** raise the new gate limits. The tables stay.

### Every decision D2 needs is already made

- **Cap numbers** — gate rows, so changing them later costs nothing:

  | Gate key | `sprout` | `bloom` | `flourish` (dormant) |
  | --- | --- | --- | --- |
  | `max_concurrent_matchups` | 1 | 3 | 3 |
  | `feedback_groups_per_month` | 1 | 3 | 3 |
  | `max_concurrent_groups` | 1 | 3 | 3 |

  Seed `flourish` as a twin of `bloom`. A dormant tier with undefined gates
  is a surprise waiting for whoever assigns it by accident.

- **Group pairings do not consume match quota.** Add `in_group_id` to
  `matches` and skip the monthly usage increment when it is set. The member
  made one decision — join a group — so charge them one group, not its six
  internal pairings. Concurrency still applies to real 1-on-1 match-ups.
- **An asset is required to join a feedback group**, enforced at join time
  with a clear message. The schema requires it anyway: no asset → no match →
  no feedback.
- **Group sizes:** feedback groups 4–6; challenge cohorts up to 12, and as
  small as 2.
- **Who creates groups:** `sprout` one open group at a time, `bloom` three,
  through `plan_feature_limit`.
- **`recommend_group_members(p_group_id, p_limit)`** wraps what exists rather
  than adding matching logic: call `eligible_match_candidates` for the
  owner, filter by the group's Track, drop anyone already in or invited, and
  keep only candidates passing `pair_respects_separation_preferences`
  against **every** current member. That last part is the only genuinely new
  rule — a four-person group needs all six pairs to pass, where a two-person
  match had one.

### Two traps waiting in D2

**1 · The surface gate will break the recommender in D3.**
`eligible_match_candidates` carries the Phase A guard and raises
`matching is handled in Discord` unless `match_surface()` is `'web'`, the
caller is the service role, or the caller is an admin. The gate is seeded
`web`, so it passes today — but D3 flips it to `discord` and the recommender
would silently stop working for members. Either call the underlying query
rather than the gated RPC, or make the recommender pass the guard
explicitly. **Have `verify-phase22.mjs` assert the recommender still works
with the gate set to `discord`,** or this surfaces as a bug in D3.

**2 · Append-only tables need `FOR EACH ROW`.** Phase 21 learned this the
hard way: a `FOR EACH STATEMENT` trigger fires even when an `UPDATE` matches
no rows, so the referential-integrity update that `ON DELETE SET NULL`
issues for *every* deleted profile aborted every account deletion in the
system. If any D2 table is append-only, use `FOR EACH ROW` and work out what
the FK actions are allowed to do before writing the trigger. The points
ledger will hit this too.

### After D2

| Step | Scope |
| --- | --- |
| D3 | `/group create / recommend / invite / join / members / close`, `/me`, private-thread creation. **Smaller than the spec estimates** — the interactions endpoint, Ed25519 verification, the deferred-response pattern and the command router all shipped with D1 |
| D4 | Widen `create_match`'s own source guard; the service-role act-as path; `assert_active_user`; `/feedback`; widen `member_feedback_ratings` to `(rater, rated, feedback_submission_id)` |
| D5 | Challenge cohorts (`kind = 'challenge'`), the cohort channel, `opens_at`/`closes_at`, `#checkpoints`, the Pro gate — which is now just `plan_code = 'bloom'` |
| D6 | `review_channels` catalog (migrate `asset_channels.channel_name` off free text), `member_channel_identities`, `review_nodes`, `review_events`, `review_separation_for_match`, the end-of-match prompt, `/account` reviews section, admin master view |

Then the points economy: `interactions`, the ledger, the admin approval
queue, `/assist` and `/claim`.

## Decisions locked — do not relitigate

### Product and commercial

| Thing | Call |
| --- | --- |
| Discord server name | **5⭐️s** — Questmates stays unspent for the game layer |
| App host | **`app.proofsignals.net`**; apex is WordPress on SiteGround |
| Free tier | `sprout` = **IndieOps Proof Lab**, the free Skool group |
| Paid tier | `bloom` = **IndieOps Incubator**, $99/month, by application |
| `flourish` | **Retired.** Dormant in the enum; `set_member_plan` refuses it |
| Billing | **Skool.** No Stripe, and none until ProofSignals opens outside Skool |
| Plan sync | **Admin by hand**; the Zapier webhook when volume justifies it |
| Marketing | WordPress owns it; the app noindexes its duplicates |
| `/pricing` | Noindexed. A page you send people to, not one they find |

### Architecture

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

### Points economy (specced, unbuilt)

**No points for any review, internal or external, ever.** Nothing in the
earning table is reachable through a review — a design constraint, not a
policy to remember.

**Nothing pays without a pre-registered goal** (decided 2026-10-17):

- **Catalog goals capture a baseline when selected.** When a member picks a
  milestone goal, or a group freezes its `point_schedule`, the starting
  number and its evidence link are written down then. "Reach 1,000
  followers" pays only someone who was below 1,000 at registration. The
  `(member, goal, platform)` uniqueness stops double payment but does
  nothing about someone already past the milestone on day one.
- **Anything outside the catalog is registered with the admin first** —
  beginning state, end state that counts, how it will be evidenced. The
  admin approves, adjusts or rejects and **sets the award at that point**.
  An unregistered accomplishment cannot be claimed later, whatever the
  evidence.
- **Registering is declaring intent, not asking for points.** The award
  still arrives when someone *else* recommends it and the admin approves.
- **An approved custom goal is published to its group**, the way a frozen
  schedule is — admin-set awards otherwise put discretion back into a
  deliberately flat map.
- **SOC 2 compliance stays out of the catalog**, as the archetype of the
  custom path: a flat 25 or 50 misprices it, and a SOC 2 report is delivered
  under NDA, so what exists is an auditor's attestation letter rather than a
  page anyone can open.

Awards are **25** (assistance) and **50** (witnessed accomplishment), pegged
at **10 points ≈ $1**. Spends: software access for members outside the paid
group, swag for members inside it, Skool course unlocks for anyone.

*Schema shape:* a `point_goals` row per registration — `user_id` or
`group_id`, `catalog_key` (null for custom), `baseline_state`,
`baseline_evidence_url`, `target_state`, `evidence_kind`, `award_points`,
`status`, `approved_by_user_id`. Claims reference `point_goal_id`.

## Constraints that bite (verified in the migrations)

1. `feedback_submissions.match_id` is `not null` — feedback cannot exist
   without a match row.
2. `matches` requires an asset on **both** sides, so joining a feedback
   group has to require an asset.
3. `matches.source` — **half done.** Phase A widened the table CHECK to
   include `'discord'`. `create_match`'s own member-input check still
   accepts only browse/queued, so the service-role writer remains D4 work.
4. `member_feedback_ratings` is `unique (rater_user_id, rated_user_id)` —
   one rating per ordered pair, ever. Widen it in D4.
5. **The bot cannot call existing member RPCs.** They resolve the caller from
   `auth.uid()`, which is null for a service-role call. D1's bot-facing RPCs
   take the external id as an argument and check `auth.role()` themselves;
   D4's act-as argument is still owed.
6. **`user_profiles` takes no direct writes** from `anon` or `authenticated`
   (revoked in `20260715120000`). That is why a member cannot promote
   themselves to `bloom` despite the permissive `profiles_update_self`
   policy — **do not loosen it.**
7. **`plan_feature_gates` is readable only `to authenticated`.** Anything a
   logged-out visitor must see goes through `public_plan_caps()`, a
   whitelist. Add a key there to publish it; internal switches stay private
   by default.

## The two seams

`verify-phase20.mjs` enforces both by grepping imports — a seam nobody tests
is a seam that closes.

1. **The bot never imports Supabase.** Nothing under `src/lib/discord/`
   imports `@supabase/*`, `@/lib/supabase/*` or the adapter. Command
   handlers receive a `port` argument.
2. **The rules engine never imports Discord.** Nothing under
   `src/lib/community/` imports `@/lib/discord/*`.
   `src/lib/community/port.js` names the operations an adapter owes;
   `proofsignals/adapter.js` is the only file there that knows Supabase
   exists; `rules/*` imports no backend at all.

Route handlers are the composition roots and the only files allowed both.

**D2's group RPCs belong behind the port when D3 reaches them.** Add
`createGroup`, `inviteMember`, `joinGroup`, `recommendMembers` to
`port.js` as you build them, so the next adapter knows what it owes.

## Still open

- **Discord portal steps 1–7.** All unblocked. `docs/discord-setup.md` has
  the walkthrough; the server is **5⭐️s**, and steps 6 and 7 go together.
- **The Skool → plan webhook.** Deferred, not forgotten.
  `POST /api/skool/membership` guarded by `SKOOL_WEBHOOK_SECRET`, driven by
  Zapier polling Skool (keyed by email), calling
  `set_member_plan(..., 'skool', <email>)` and writing the
  `member_identities(provider = 'skool')` row — **exactly** the row the
  points economy's course-unlock Zap needs later. Needs a Skool Pro plan.
- **The standalone-product brief.** Market, what extracts now that the seams
  exist, what multi-tenancy costs, a competitive scan (MEE6/Arcane;
  Circle/Heartbeat/Mighty Networks; anything already bridging Skool and
  Discord), and a recommendation. Written deliverable, not code.
- **`mock-data.js` still feeds real surfaces.** `ME`, `ME_PROFILE`,
  `MATCHES`, `MEMBERS`, `HISTORY_ITEMS`, `PROOF_LISTINGS` are prototype
  placeholders the dashboard and Browse still read. The file's header says
  which exports are real configuration and which are not. Each one is a
  query waiting to be written.

## Ops notes

Migrations are applied live via the Supabase Management API (see the
`db-migration-verify-workflow` memory); the repo is not linked to the CLI.

Production env: `RESEND_*`, `ANTHROPIC_API_KEY`, and
`NEXT_PUBLIC_SITE_URL=https://app.proofsignals.net` are set. Still to add
when the Discord portal work happens: `DISCORD_APP_ID`,
`DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`,
`DISCORD_MEMBER_ROLE_ID`, `NEXT_PUBLIC_DISCORD_INVITE_URL`,
`NEXT_PUBLIC_DISCORD_OAUTH_ENABLED`. Optional:
`NEXT_PUBLIC_MARKETING_URL`, `NEXT_PUBLIC_SKOOL_FREE_URL`,
`NEXT_PUBLIC_SKOOL_PAID_URL` (the Skool links are already defaults in
`plans.js`).

**Rollback for anything Discord-side:** unset `DISCORD_PUBLIC_KEY`. The
endpoint returns 503, the site keeps working, no data changes.
