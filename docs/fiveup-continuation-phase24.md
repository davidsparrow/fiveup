# Continuation Prompt — Phase 24 / D4: pairing and feedback in Discord

Everything through **D3 — groups in Discord** is on
`claude-phase-23-groups-in-discord` and applied to the live database.
`verify-phase23.mjs` is **126 checks green**, and every earlier suite still
passes: 22 152, 20 70, A 66, 21 61, 21b 36, 19 28, 17 12, 15 11, 14 24.

**The next build step is D4 — `create_match` from Discord, and `/feedback`.**

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

In the repo: `docs/discord-setup.md` is the portal walkthrough, now with a
step 8 for the groups channel and a D3 test script. Phase 22's and phase 23's
handoffs carry the locked decisions; **everything in their "decisions" tables
still holds** and is not repeated here. Phase 19's holds the points-economy
spec verbatim.

## Where things stand

| Area | State |
| --- | --- |
| **D1 — identity** | Shipped. `member_identities`, both roads, the interactions endpoint, `/link` |
| **D2a — plan grants** | Shipped. `set_member_plan`, `plan_grants`, admin control |
| Pricing lander | Shipped |
| **D2 — groups and caps** | Shipped. Tables, nine RPCs, three readers, three gates, a Groups tab, a Track picker |
| **D3 — groups in Discord** | **Shipped, and not yet live.** Code complete and verified; the portal steps are outstanding |
| **D4 — pairing and feedback** | **Next.** Smaller than the spec: the act-as path and the group RPCs are done |
| D5–D6 | Not started |
| Points economy | Specced, unbuilt. Follows D5 |
| Standalone-product brief | Not started. Written deliverable, not code |

## What D3 shipped

`supabase/migrations/20261106120000_phase23_discord_groups.sql` — three
functions, no new tables, applied live.

1. **`member_for_external_identity` gains `track`.** The bot's only member
   read, and `/group create` inherits the creator's cohort from it.
2. **`my_pairable_assets(p_acting_user_id)`.** The assets
   `assert_pairable_asset` would accept. Discord has no dropdown and this
   schema has no default-asset column, so the handler needs the list.
3. **`member_overview(p_acting_user_id)`.** Everything `/me` says in one
   round trip. Security definer because `plan_feature_limit` and the three
   count helpers are revoked from `authenticated`.

All three revoke `EXECUTE` **by role name**, and `verify-phase23` asserts the
ACL mentions no `anon`.

**Commands.** `/me`, and `/group` with eleven subcommands: `create`, `list`,
`discover`, `join`, `accept`, `decline`, `invite`, `members`, `recommend`,
`leave`, `close`. The handoff's D3 scope named six; `list`, `discover`,
`accept`, `decline` and `leave` were added because without them the six are
dead ends — an invite nobody can accept, a `join` with no way to find a name,
and a free member stuck at a cap of 1 with no way to leave from Discord.

**Rooms.** A group is a **private thread off one configured channel**
(`DISCORD_GROUPS_CHANNEL_ID`), not a thread wherever the command ran. New
`rest.js` operations: `createGroupThread`, `addThreadMember`,
`removeThreadMember`, `postThreadMessage`, `archiveThread`.

**Port.** Five new operations — `listPairableAssets`, `memberOverview`,
`discoverGroups`, `respondToInvite`, `leaveGroup` — all in a new
`OPTIONAL_OPERATIONS` list with a `hasOperation()` helper, because an adapter
whose backend has no rooms, assets or caps still implements a coherent
product. `REQUIRED_OPERATIONS` is unchanged at seven.

**Rules.** `community/rules/naming.js` (name matching, shared),
`rules/assets.js` (the asset decision), `rules/groups.js` (every formatter,
the error translation, and the status helpers).

**`register.mjs --dry-run`** validates the command surface against Discord's
documented limits with **no credentials**, which is how D3 was proved without
the portal. The validator is `commands/validate.js`, and `verify-phase23`
asserts it catches six specific mistakes — a validator that only ever returns
`[]` is indistinguishable from no validator.

## Decisions taken during D3

| Thing | Call |
| --- | --- |
| Asset choice in Discord | **Auto-pick when there is exactly one, name them when there are more.** Never "pick the newest": entering someone into a four-person review of the wrong asset is worse than one extra round trip. An optional `asset:<name>` option resolves by exact name, then unique partial, then uuid |
| Where rooms live | **One configured parent channel.** Rooms stay findable and moderatable, and `/group create` works in a DM, where there is no channel to thread from |
| A group's track | **Inherited from its creator**, per the locked "a Track is the entry cohort, singular" decision. No `track` option on the command |
| Thread membership | `invitable: false`. Only the bot and moderators may add people; otherwise any thread member could pull someone in and route around `invite_to_group` and its caps |
| A failed room | **Reported, never fatal.** The row is written first, the thread second. A group with no thread is a working group; a thread with no group would be a room with no rules |
| Closing a group | The thread is **archived, not deleted**. The feedback in a room is the room's record of itself |
| Database error messages | **Passed through verbatim** by default. They name which rule was hit — 'this group is full (4 of 4 seats)', 'which is the limit on your plan'. `describeGroupError` translates only the handful where Discord's next step differs from the site's |
| A cap of `null` | **Never rendered as "unlimited"** in `/me`. `plan_feature_limit` returns null for a missing gate row, and a seeding mistake that reads as a free pass is the trap phase 22 flagged. `plans.js`'s `formatCap` still says "Unlimited" for /pricing, which is right for marketing copy about a tier — the two are deliberately different |
| `/challenge` | **Not registered.** Cohorts are admin-created and `join_group` refuses them by name until D5, so the command would only produce a refusal |

## Next: D4

**Scope:** `create_match` reachable from Discord, `/feedback`, the site entry
point a group pairing links to, and widening `member_feedback_ratings`.

Concretely, and in this order:

1. **`create_match` needs `p_acting_user_id`.** Copy the shape from the group
   RPCs: `resolve_acting_member(p_acting_user_id)` plus
   `assert_active_user()`. Until this lands the bot cannot create a match at
   all.
2. **Widen `create_match`'s member-input source check to accept
   `'discord'`.** The table CHECK already allows
   `auto | browse | queued | discord | group`; the function's own check still
   refuses `'discord'` from a member.
3. **`createPairing` in `port.js` first**, then the adapter, then the handler.
   That order is the house rule and it is cheap.
4. **Widen `member_feedback_ratings`** from `unique (rater_user_id,
   rated_user_id)` to `(rater, rated, feedback_submission_id)`. **This now
   matters more than it did:** a group of four produces six pairings, and two
   people who meet again in a second group produce feedback but no second
   rating.
5. **`/feedback`** and the site entry point a group pairing links to.

### Four things D4 must know

1. **`pair_in_group` already exists and works** — it is `/group pair`'s
   absence that is the gap, not the RPC's. It calls `create_match`, so it
   inherits the Phase A surface gate; `recommend_group_members` calls
   `match_candidates_for` (the ungated core) and does not. That asymmetry is
   intended. **Do not "fix" it by widening the gate.**
2. **Every group RPC takes `p_acting_user_id` and the adapter passes it.** A
   service-role call that names nobody is refused rather than acting as null;
   a member passing someone else's id is refused.
3. **The handlers are testable because they take a `port`.** `verify-phase23`
   drives `handleInteraction` directly with synthetic interactions. Keep that
   property: a handler that reached for the adapter would break both the seam
   check and every assertion.
4. **`describeGroupError` is where a new database message gets its Discord
   wording** — and the default is to pass it through. Add a branch only when
   the next step in Discord differs from the next step on the site.

## Traps and lessons from D3

1. **`open` is a visibility, not a status.** `groups.status` is
   `forming | active | closed`. Two subcommand filters were written
   `g.status === "open"`, matched nothing, and made `/group invite` and
   `/group close` tell every owner "you do not own any open groups". Use
   `isGroupLive()`. Nothing errors — a wrong status string is just a filter
   that always removes everything.
2. **The adapter is a second place every RPC field must be named.** `track`
   was added to the SQL, documented in `port.js` and read by the handler, and
   every Discord-created group would still have had `track = null`, because
   `resolveMember`'s mapping dropped it. A missing key is `undefined`, not an
   error. **Assert the value, not the call.**
3. **`my_groups` and `discoverable_groups` have complementary blind spots.**
   `my_groups` returns only `active | invited | requested`;
   `discoverable_groups` omits every room the caller already has a row in. So
   asking to join a room you already requested looked identical to asking for
   one that does not exist. `/group join` now checks both, and
   `describeExistingRelationship` says which.
4. **A filtered-out group is not a missing group.** Closing an already-closed
   group resolved against `my_groups` (the owner's seat stays active) but was
   removed by the subcommand's filter, so the member was told "no group of
   yours is called that" about a group they were in.
   `describeIneligibleGroup` is the second pass that explains why.
5. **Never pipe a verify run through `head`.** SIGPIPE kills Node before the
   `finally` block — three test users and two groups were left in the
   production database that way. Redirect to a file and read the file.
6. **Fixture identifiers must be unique per run.** A fixed base plus a
   counter collides with the residue from any interrupted run, and the unique
   index on `(provider, external_id)` then fails every later run.
7. **D1's `revoke all ... from public` had left
   `member_for_external_identity` executable by `authenticated`** — the same
   shape as the `match_candidates_for` hole, one guard deep inside a function
   that reads other members' identities. The body check was correct, so it
   was not exploitable, but D3 revoked by role name and `verify-phase20`'s
   assertion had to be widened to accept "permission denied" as well as the
   body's own message. **Any function added before phase 22 is worth an ACL
   check.**

## Constraints that bite

Phase 22's and phase 23's lists still hold, with these changes:

1. `feedback_submissions.match_id` is `not null` — unchanged.
2. `matches` requires an asset on **both** sides — unchanged.
3. `matches.source` — the table CHECK allows
   `auto | browse | queued | discord | group`, and `create_match` accepts
   `group` from members. **Its member-input check still refuses `'discord'`;
   that and the act-as argument are D4's first two jobs.**
4. `member_feedback_ratings` is still `unique (rater_user_id,
   rated_user_id)`. **D4 widens it.**
5. **The bot still cannot call `create_match`.** Solved for every group RPC
   via `resolve_acting_member`; this is the last one.
6. `user_profiles` takes no direct writes from `anon` or `authenticated`.
   `track` relies on that the same way `plan_code` does.
7. `plan_feature_gates` is readable only `to authenticated`;
   `public_plan_caps()` is the whitelist. `member_overview` is the member's
   own-caps reader and is deliberately not in it.

## Still open

- **Discord portal steps 1–8.** Now including the new step 8, the groups
  channel. Until step 7 runs, D3's commands exist in this repo and not in the
  server. `register.mjs --dry-run` is green, so the definitions themselves
  are known good.
- **Track roles in Discord.** `src/lib/fivestarz/tracks.js` carries a
  `channel` per track (`#ai-builders`, …) and its comment claims D3 grants a
  Track role. **D3 does not** — it is not in the handoff's D3 scope and it
  needs four role ids that are not in the env spec. Either build it in D4
  with `DISCORD_TRACK_ROLE_IDS`, or correct that comment.
- **No `/group pair` command.** `pair_in_group` exists and is tested; the
  Discord verb for it is D4's, alongside `create_match`.
- **The Skool → plan webhook.** Deferred, not forgotten.
  `POST /api/skool/membership` guarded by `SKOOL_WEBHOOK_SECRET`, Zapier
  polling Skool keyed by email, calling `set_member_plan(..., 'skool',
  <email>)`. Needs a Skool Pro plan. `user_profiles.track` is meant to come
  from the Skool join poll and nothing imports it yet — members set their own
  Track by hand on `/account`, and now a group inherits whatever that says.
- **Four test accounts from phase 21 are still in the production database**,
  created 2026-10-16: `verify21-member-22e8-1yco@example.com`,
  `verify21-admin-…`, `verify21-other-…`, `verify21-doomed-…`. That run's
  cleanup used `.catch(() => {})` — the pattern phase 22 fixed. They look
  harmless (`verify-phase21` passes with them present), and they were left
  rather than deleted because dropping auth users in production is not a
  cleanup to do unasked. `delete from auth.users where email like
  'verify21-%'` is the sweep when you want it.

- **The standalone-product brief.** Market, what extracts now that the seams
  exist, what multi-tenancy costs, a competitive scan (MEE6/Arcane;
  Circle/Heartbeat/Mighty Networks; anything bridging Skool and Discord), and
  a recommendation. Written deliverable, not code.
- **`mock-data.js` still feeds real surfaces.** `ME`, `ME_PROFILE`,
  `MATCHES`, `MEMBERS`, `HISTORY_ITEMS`, `PROOF_LISTINGS`. The dashboard
  header's stat tiles (`4/12`, `2/6`, `Posted 14`, `Pending 2`) are still
  hardcoded strings. `member_overview()` now returns most of what those tiles
  want — it was written for `/me` but the site can read it too.
- **No group surface outside the dashboard tab.** No `/groups/<id>` page, no
  email when you are invited, and `my_groups` is polled on tab open rather
  than subscribed.
- **No `/group` pagination.** Every formatter ends in `clamp()` at 1900
  characters, so a member in many groups gets a truncated list rather than a
  broken reply. Fine for now; a real limit later.

## Ops notes

Migrations are applied live via the Supabase Management API (see the
`db-migration-verify-workflow` memory); the repo is not linked to the CLI.
An explicit `begin; ... commit;` in the file body works fine.

**The Supabase project auto-pauses.** It was `INACTIVE` at the start of this
phase after three weeks idle, and every Management API query returned
`"Database is possibly not accessible at the moment"` with a 400 —
which looks like a credentials problem and is not. Check
`GET /v1/projects/<ref>` for `status` first.

Production env: `RESEND_*`, `ANTHROPIC_API_KEY` and
`NEXT_PUBLIC_SITE_URL=https://app.proofsignals.net` are set. Still to add:
`DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`,
`DISCORD_GUILD_ID`, `DISCORD_MEMBER_ROLE_ID`,
`DISCORD_GROUPS_CHANNEL_ID` (optional — no rooms without it, every command
still works), `NEXT_PUBLIC_DISCORD_INVITE_URL`,
`NEXT_PUBLIC_DISCORD_OAUTH_ENABLED`.

**Rollback for D3:** unregister the commands (run `register.mjs` against an
empty definitions list). The site keeps working, the groups stay, the data is
untouched. To go further, unset `DISCORD_PUBLIC_KEY` and the endpoint returns
503. The migration needs no rollback — it adds three readers and takes
nothing away.

**One caution on `verify-phase22.mjs`:** it flips the live `match_surface`
gate to `discord` and back. Its `finally` block restores it and says so — one
more reason never to pipe a verify run through `head`.
