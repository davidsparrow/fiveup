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

1. ~~Is the server called Questmates?~~ **Decided 2026-10-15: the server is
   called 5⭐️s.** Questmates stays unspent for the game layer, which is also
   what the standalone-product track wants — brand equity off the thing being
   sold. Worth watching: the name reads as being about star ratings, and the
   house rule is that the platform never raises online reviews. Internal
   stars are the product, so it holds, but `#start-here` copy should carry
   the "stars happen on the site, never in Discord" line early.
2. ~~Does `proofsignals.net` point at the Vercel project?~~ **Decided
   2026-10-15: it does not, and it will not.** See *Hosting* below.
3. ~~Plan codes.~~ **Decided 2026-10-15.** See *Plans and billing* below.

## Hosting: a WordPress apex and an app subdomain

**Decided 2026-10-15.** `proofsignals.net` is a WordPress site on SiteGround.
This Next app lives on **`app.proofsignals.net`**.

This is *better* for D1 than an apex migration, and it unblocks the two
held setup steps sooner: moving the app to a subdomain is one Vercel domain
plus one CNAME and never touches WordPress, so the Interactions Endpoint URL
can be set permanently and correctly without waiting on any marketing
decision. `docs/discord-setup.md` carries the three steps.

Done in code: `getSiteUrl()` now falls back to `https://app.proofsignals.net`
rather than the apex, and `getMarketingUrl()` was added for the few places
that really mean the marketing site. The old fallback would have put the
marketing host into canonical tags, OG image URLs, the sitemap and every link
the bot posts — all pointing at pages that cannot sign a member in.

### Two recommendations this creates, neither implemented

**1 · The app's marketing routes are now duplicates.** `/`, `/how-it-works`,
`/pricing`, `/community`, `/safety` and `/demo` live on the app *and* will
live on WordPress. `src/app/sitemap.js` currently submits all of them, so two
hosts would compete for the same keywords and both need maintaining.

*Recommendation:* WordPress owns marketing; the app owns the record. Drop the
static marketing routes from `sitemap.js`, leave `/u/[username]` and
`/a/[slug]` indexed (they are the SEO asset and the thing Skool links into),
and either `noindex` the app's marketing pages or retire them in favour of
redirects to the apex. Keep `/demo`, `/pricing` and `/safety` reachable on
the app only if a logged-in member needs them.

*Worth knowing:* public profiles become `app.proofsignals.net/u/<handle>`.
Link equity does not consolidate across a subdomain as cleanly as across a
path, so the apex should link into profiles generously. If that ever matters
enough, the fix is to serve `/u/*` and `/a/*` from Vercel on the apex — but
that means the apex leaves SiteGround, so it is a decision to make once, not
to drift into.

**2 · `/pricing` now advertises something that does not exist.** It shows
three tiers at Free / $29 / $79 per month with a Stripe-shaped FAQ
("upgrade or downgrade anytime", "7-day refund", "cancel from your account
settings"). None of that is true under Skool billing, and `Flourish` is
retired.

*Recommendation:* retire `/pricing` from the app and let the WordPress site
carry pricing, since that is where a prospect will land. If it stays, it
becomes two tiers whose CTA is "join the Skool group", and the FAQ rows about
billing periods and refunds come out. **Not changed in this PR** — it is
commercial copy, and the hosting decision may delete the page entirely.

## Plans and billing

**Decided 2026-10-15:**

| `plan_code` | Who | Notes |
| --- | --- | --- |
| `sprout` | Free Skool member | The default from `handle_new_auth_user` |
| `bloom` | Paid Skool member | The "Pro" tier everywhere in the spec |
| `flourish` | — | **Retired. Dormant, not removed.** |

`flourish` stays in the `plan_code` enum because removing a value means
recreating the type — the same call Phase 19 made for `awaiting_post` and
`posted` in `match_status`. Nothing assigns it.

*Recommendation for D2's gate seeding:* seed all three plans and give
`flourish` the same values as `bloom`. A dormant tier with undefined gates is
a surprise waiting for whoever assigns it by accident; a dormant tier that
behaves like Bloom is not.

**Cap numbers, restated for two tiers** (the spec proposed 1/3/5 across
three). These are gate rows and change without a deploy:

| Gate key | `sprout` | `bloom` | `flourish` (dormant) |
| --- | --- | --- | --- |
| `max_concurrent_matchups` | 1 | 3 | 3 |
| `feedback_groups_per_month` | 1 | 3 | 3 |
| `max_concurrent_groups` | 1 | 3 | 3 |

Two consequences worth banking:

- **D5 gets simpler.** The challenge-cohort "Pro gate" is just
  `plan_code = 'bloom'`, and the Discord **Pro** role maps to it one-to-one.
- **The points spend table is now derivable from `plan_code`.** "Software
  access for members outside the paid Skool group" is `sprout`; "swag for
  members inside it" is `bloom`. No separate flag is needed.

### The gap this creates: nothing can set `plan_code`

Verified in the migrations: `plan_code` is set only by
`handle_new_auth_user` (always `'sprout'`) and by direct table writes. There
is **no RPC and no admin UI** that promotes a member to `bloom`. Under the
old model that did not matter, because there was no billing. Now it is the
one thing standing between a paying Skool member and the tier they paid for.

Good news on the security side: Phase 7's hardening already did
`revoke insert, update, delete, truncate on public.user_profiles from anon,
authenticated`, so a member cannot promote themselves through PostgREST
despite the permissive `profiles_update_self` policy. The only writers are
security-definer RPCs and the service role. That is the right starting
position for a column that now carries money — **do not loosen it.**

*Recommended as **D2a**, roughly a day, before or alongside D2:*

1. `set_member_plan(p_user_id, p_plan_code, p_source, p_external_ref)` —
   security definer, **admin or service role only**, writes `plan_code` and
   appends a row to a small `plan_grants` audit table (who, when, which
   source, which reference). An entitlement that changes with no audit trail
   is a support ticket nobody can answer.
2. `plan_source` recorded per grant: `'skool' | 'stripe' | 'admin'`. This is
   the cheap part that makes the Stripe question reversible — see below.
3. `POST /api/skool/membership` — a webhook guarded by a shared secret in
   `SKOOL_WEBHOOK_SECRET`, driven by **Zapier polling Skool** (its official
   app offers two polling triggers, all keyed by email). It resolves the
   member by email, calls `set_member_plan(..., 'skool', ...)`, and writes a
   `member_identities(provider = 'skool')` row as a side effect.
4. An admin control to set a plan by hand — the fallback for every case
   Zapier's email matching misses, and the whole mechanism until the Zap is
   built.

Step 3's side effect is a real convergence worth noticing: the
`member_identities(provider = 'skool')` row it writes is **exactly** the row
the points economy's course-unlock Zap needs later. D1 already supports
`provider = 'skool'` with no schema change.

### On keeping Stripe

There is nothing to keep. Phase 15 routed every plan CTA to the beta modal
with "no payment processing during the beta", and the repo has no Stripe
dependency, no checkout, no webhook and no subscription state. "Keeping
Stripe" means building it.

*Recommendation: do not build it now, and make it cheap to build later.*

- The gap is not billing, it is a **plan-sync path**. That is one webhook and
  one RPC (D2a above). Stripe is checkout, webhooks, subscription state,
  proration, cancellation, dunning and tax — a workstream, not a task.
- Two billing systems for one audience means answering "which one is right?"
  every time they disagree. With "not my intention to advertise widely", the
  second system buys nothing this quarter.
- The dues refund was retired *because* it converted points into money, which
  turned the approval queue from quality control into fraud control. A second
  money rail deserves the same caution.
- **The cheap hedge is `plan_source`.** Build D2a so `plan_code` is written by
  a source-agnostic RPC that records where the entitlement came from. Adding
  Stripe later is then a second writer against the same column — a new route
  handler and a webhook — rather than a refactor of everything that reads a
  plan. That is the same seam thinking as the Discord/community split, and it
  costs one text column now.

The real trigger for Stripe is opening ProofSignals outside Skool. When that
becomes the intention, Stripe is the right answer and D2a will already have
left the door open.

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

Cap numbers and the plan mapping are settled above. Still open, all with the
spec's recommendation attached, so a yes unblocks each:

- **Group pairings do not consume match quota** — charge the group, not its
  six internal pairings, via `in_group_id` on `matches`.
- **An asset is required to join a feedback group**, enforced at join time.
  The schema requires it anyway (no asset → no match → no feedback).
- **Group sizes:** feedback groups 4–6, challenge cohorts up to 12.
- **Who creates groups:** `sprout` one open group at a time, `bloom` three,
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
