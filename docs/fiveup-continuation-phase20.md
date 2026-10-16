# Continuation Prompt — Phase 20 / Discord D1: identity shipped, D2 next

D1 of the six-step Discord build is done in code and applied to the live
database. What remains before five testers can link is portal work in
Discord, listed in `docs/discord-setup.md`.

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

Phase 19's handoff is `docs/fiveup-continuation-phase19.md`; it still carries
the points economy spec and the standalone-product track verbatim.

## What D1 shipped

**Migration** `20261015130000_phase20_member_identities.sql`, **applied to
the live database** via the Management API.

Two tables and both roads into one row:

- **`member_identities`** — unique on `(provider, external_id)` *and* on
  `(user_id, provider)`. One Discord account per member, one member per
  Discord account, and the uniqueness **holds across an unlink**: unlinking
  sets `status = 'unlinked'` and keeps the row, so nobody can claim a
  departed member's snowflake in the gap. `provider = 'skool'` needs no
  schema change when the Zapier tie-back arrives. `role_granted_at` is null
  until the Discord Member role actually lands, which is what makes `/link`
  a retry rather than an error.
- **`member_link_codes`** — Crockford base32 (no I, L, O or U), 8
  characters, 15 minutes, single use. RLS with **no policy at all**: nobody
  reads this table as a member.

- **Road 1, OAuth.** `link_discord_from_auth_identity()` reads the snowflake
  out of `auth.identities` for the calling member. There is no
  client-supplied id to forge — a member can only link the Discord account
  they just proved they control.
- **Road 2, the code.** `issue_member_link_code(provider, external_id,
  handle)` is **service role only** and re-checks `auth.role()` in its own
  body; a member calling it could otherwise mint a code against someone
  else's snowflake. `redeem_member_link_code(code)` writes the row under the
  member's own session.
- Plus `unlink_member_identity`, `member_for_external_identity` (the bot's
  snowflake → member lookup, service role only), `mark_member_role_granted`,
  and `admin_reassign_member_identity` — moving a Discord account between
  members is deliberately an admin act rather than something the uniqueness
  rules permit by accident.

**The endpoint.** `src/app/api/discord/interactions/route.js` —
`runtime = 'nodejs'`, verification over `await request.text()`, 401 on a bad
signature (Discord probes with one when you save the URL and refuses
anything else), 503 when `DISCORD_PUBLIC_KEY` is unset, and `after()` from
`next/server` running deferred work once the three-second deferral is sent.
Ed25519 verification is `node:crypto` with the fixed SPKI prefix — **no new
dependency was added for this phase**.

**The site.** A Discord card on `/account` offering whichever road is
configured, `POST/DELETE /api/discord/link` for redeem and unlink (unlink
takes the Member role back), and `/account/discord/linked` finishing the
OAuth road.

**Verify:** `node verify-phase20.mjs` — 70 checks. `verify-phaseA` 66,
`verify-phase19` 28, `verify-phase17` 12, `verify-phase15` 11 all still
green. Build clean, lint clean.

**Branch:** `claude-phase-20-identity`, cut from `main`.

## The two seams, and the rule that keeps them honest

The handoff's standalone-product track asked for both seams before D1–D3.
They are built, and `verify-phase20.mjs` checks them by grepping imports —
a seam nobody tests is a seam that closes.

1. **The bot never imports Supabase.** Nothing under `src/lib/discord/`
   imports `@supabase/*`, `@/lib/supabase/*` or the adapter. Command
   handlers receive a `port` argument.
2. **The rules engine never imports Discord.** Nothing under
   `src/lib/community/` imports `@/lib/discord/*`. `src/lib/community/port.js`
   names the operations an adapter owes;
   `src/lib/community/proofsignals/adapter.js` is the only file under
   `community/` that knows Supabase exists, and it still knows nothing about
   Discord — `provider` arrives as a string argument.
   `src/lib/community/rules/*` imports no backend at all.

**Route handlers are the composition roots** and the only files allowed to
import both sides: the interactions route, `/api/discord/link`, and
`/account/discord/linked`.

One deliberate duplication: the link-code alphabet and normalisation exist
twice, in `public.normalize_member_link_code` and in
`src/lib/community/rules/link-codes.js`. `verify-phase20.mjs` round-trips
messy input through both and asserts they agree, rather than trusting it.

## Decisions taken in D1

- **Both roads**, per the spec's pick. The OAuth provider is the one-click
  path; the code is the only path for someone who found Discord first.
- **No new npm dependency.** `discord-interactions` was the spec's
  suggestion; `node:crypto` with a 12-byte DER prefix does the same job.
- **Unlinking removes the Member role.** The role is the entire linking
  incentive, so leaving it behind would make linking optional in practice.
- **Codes are 8 characters of Crockford base32, 15 minutes, single use**, and
  issuing a new one retires the old. Every failure — wrong, expired,
  superseded — returns the same sentence, so the error is not an oracle.
- **`/link` is the retry path for a failed role grant.** A member who linked
  before joining the server runs it again after joining and gets the role,
  with no admin involved.

## Still open — flagged rather than assumed

Three questions have a commercial or naming consequence and were left for
Robbie rather than defaulted:

1. **Is the server called Questmates?** Blocks step 1 of setup. Members
   bookmark the invite, so the name is awkward to change later. The
   alternative is an unbranded server with the name saved for the game
   layer — and the standalone-product track argues for keeping brand equity
   *off* the thing being sold.
2. **Does `proofsignals.net` point at the Vercel project?** Blocks step 6.
   The Interactions Endpoint URL is effectively permanent.
3. **Plan codes.** Everything is written against `sprout` / `bloom` /
   `flourish`. If Proof Lab free and Proof Lab Pro map onto those, which maps
   to which, and is `flourish` still a tier being sold? Blocks D2's gate
   seeding.

## Unfinished: D2–D6

| Step | Scope |
| --- | --- |
| D2 | `groups` + `group_members`; create/invite/join/leave/close RPCs; `recommend_group_members`; the three new plan gates; `in_group_id` and `discord_thread_id` on `matches`; dashboard Groups tab |
| D3 | `/group *` and `/me`, private-thread creation — the endpoint and verification already exist |
| D4 | Widen `create_match`'s own source guard; the service-role act-as path; `assert_active_user`; `/feedback` |
| D5 | Challenge cohorts (`kind = 'challenge'`, 2–12 people), `#checkpoints`, the Pro gate |
| D6 | `review_channels` catalog (migrate `asset_channels.channel_name` off free text), `member_channel_identities`, `review_nodes`, `review_events`, `review_separation_for_match`, the end-of-match prompt, `/account` reviews section, admin master view |

D3 is now smaller than the spec's estimate: the interactions endpoint,
signature verification, the deferred-response pattern and the command router
all shipped with D1. D3 is the `/group` handlers and thread creation.

### What D2 needs decided first

The spec's own recommendations, which a yes unblocks:

- **Cap numbers.** `max_concurrent_matchups` 1 / 3 / 5,
  `feedback_groups_per_month` 1 / 3 / unlimited, `max_concurrent_groups`
  1 / 3 / 5. Gate rows, so changing them later costs nothing.
- **Group pairings do not consume match quota** — charge the group, not its
  six internal pairings, via `in_group_id` on `matches`.
- **An asset is required to join a feedback group**, enforced at join time.
  The schema requires it anyway (no asset → no match → no feedback).
- **Group sizes:** feedback groups 4–6, challenge cohorts up to 12.
- **Who creates groups:** free members one open group at a time, Pro three,
  through `plan_feature_limit`.

## Decisions locked — do not relitigate

Groups are **both** user-created and matcher-suggested · Discord ships
**before** points · private groups are Discord **private threads**, not
channels (500-channel cap) · a match-up is a `matches` row plus
`discord_thread_id`, `groups` is for 3+ · challenge cohorts can be as small
as 2 · **no admin approval on match-ups** — caps are enforced in
`create_match`, with one new `max_concurrent_matchups` gate · group pairings
are **exempt** from monthly match quota via `in_group_id` · review
separation shows **degrees 1–4 bare**, no guidance text, never names an
intermediary, never compares channels · non-member edges are **admin-only**
to view and dispute · **URL-only dedupe** for non-member nodes, no global
name picker · **no points for any review** · points are recommended *to*
you, never requested *by* you · the dues refund is retired · the
match-surface gate is seeded `web` until D3 lands.

## Constraints that bite (verified in the migrations)

1. `feedback_submissions.match_id` is `not null` — feedback cannot exist
   without a match row.
2. `matches` requires an asset on **both** sides, so joining a feedback
   group has to require an asset.
3. `matches.source` — **still half done.** Phase A widened the table CHECK to
   include `'discord'`. `create_match`'s own member-input check still accepts
   only browse/queued, so the service-role writer remains D4 work.
4. `member_feedback_ratings` is `unique (rater_user_id, rated_user_id)` — one
   rating per ordered pair, ever. The spec's pick is to widen it to
   `(rater, rated, feedback_submission_id)` in D4.
5. **The bot still cannot call existing member RPCs.** They resolve the
   caller from `auth.uid()`, which is null for a service-role call. D1 did
   not need this — its bot-facing RPCs take the external id as an argument
   and check `auth.role()` themselves. D4's act-as argument is still owed.

## Ops notes

Migrations are applied live via the Supabase Management API (see the
`db-migration-verify-workflow` memory); the repo is not linked to the CLI.
Production still needs `RESEND_*` and `ANTHROPIC_API_KEY`, and now the
`DISCORD_*` set in `docs/discord-setup.md`. **Point `proofsignals.net` at the
Vercel project before setting the Interactions Endpoint URL** — that URL is
effectively permanent once Discord verifies it.

## The standalone-product track

Unstarted, and unchanged from Phase 19's handoff: a short written brief on
whether the Discord layer is sellable — market, what extracts, what the two
seams cost, competitive scan (MEE6/Arcane; Circle/Heartbeat/Mighty Networks;
anything already bridging Skool and Discord), and a recommendation. Not code.

Two things are now cheaper to say about it than they were: **the seams
exist**, so "what extracts" has a concrete answer rather than an estimate,
and the sellable core is visibly `src/lib/community/` — port, rules and one
replaceable adapter — while `src/lib/discord/` is the part a buyer who wants
no Discord would throw away.
