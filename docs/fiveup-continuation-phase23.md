# Continuation Prompt — Phase 23 / D3: groups in Discord. Nothing blocks it.

Everything through **D2 — groups and caps** is on this branch
(`claude-phase-22-groups-and-caps`) and applied to the live database.
`verify-phase22.mjs` is 152 checks green, and every earlier suite still
passes: 21b 36, 21 61, 20 70, A 66, 19 28, 17 12, 15 11, 14 24.

**The next build step is D3 — the group commands in Discord.** Every RPC it
needs exists, is tested, and already accepts the act-as argument a bot has to
use. Start there.

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

In the repo: `docs/discord-setup.md` is the portal walkthrough.
`docs/fiveup-continuation-phase22.md` carries D2's full spec and the locked
decisions; **everything in its "Decisions locked" section still holds** and is
not repeated here. `docs/fiveup-continuation-phase19.md` holds the
points-economy spec verbatim.

## Where things stand

| Area | State |
| --- | --- |
| **D1 — identity** | Shipped. `member_identities`, both linking roads, the interactions endpoint, `/link` |
| **D2a — plan grants** | Shipped. `set_member_plan`, `plan_grants`, admin control |
| **Pricing lander** | Shipped. The three D2 caps now appear on `/pricing` on their own |
| **D2 — groups and caps** | **Shipped.** Tables, nine RPCs, three readers, the three gates, `in_group_id`, a Groups tab, a Track picker |
| **D3 — groups in Discord** | **Next. Not started.** Smaller than the spec estimates |
| D4–D6 | Not started. D4 is smaller than it was — see below |
| Points economy | Specced, unbuilt. Follows D5 |
| Standalone-product brief | Not started. Written deliverable, not code |

## What D2 shipped

`supabase/migrations/20261017120000_phase22_groups_and_caps.sql`, twelve
sections, applied live.

**Tables.** `groups` (kind, name, created_by, track, visibility, max_members,
`discord_thread_id`, `discord_channel_id`, opens_at/closes_at, status) and
`group_members` (role, joined_via, asset_id, status, invited_by, joined_at).
`matches` gained `in_group_id` and `discord_thread_id`.
`user_profiles` gained `track`.

**Gates**, all three seeded sprout 1 / bloom 3 / flourish 3. `flourish` is a
twin of `bloom` rather than the spec's 5 / null / 5 — the tier is retired, and
a dormant tier whose `plan_feature_limit` returns null reads as *unlimited* to
several callers.

**RPCs.** `create_group`, `invite_to_group`, `respond_to_group_invite`,
`join_group`, `review_group_join_request`, `leave_group`,
`remove_group_member`, `close_group`, `set_group_asset`,
`set_group_discord_ids`, `pair_in_group`, `recommend_group_members`, and the
readers `my_groups`, `discoverable_groups`, `group_roster`.

**UI.** A Groups tab on the dashboard (`GroupsTab.jsx`) doing create,
discover, request, approve, invite from recommendations, accept, decline,
pair, leave, close. A Track picker on `/account` (`TrackCard.jsx`).

**Port.** `createGroup`, `inviteMember`, `joinGroup`, `recommendMembers` are
now in `REQUIRED_OPERATIONS`, with `listGroups`, `groupRoster`, `closeGroup`
and `recordGroupRoom` implemented alongside them. The ProofSignals adapter
implements all eight.

### The three "done when" clauses, as verify assertions

- *a member creates a private group and invites from the recommendations* —
  `[creating a group]`, `[the recommender]`.
- *a free member is stopped at their concurrency cap by the database* —
  `[the concurrency cap]`. Note **how** it binds: `sprout` has
  `browse_matches_per_month = 0`, so a free member cannot initiate a match at
  all, and their cap of 1 bites when *someone else* asks. That is the path
  that exists today. D4's Discord writer is what will make it bind from their
  own side too.
- *a group pairing does not consume match quota* — `[a group pairing does not
  consume match quota]`, which checks `user_monthly_usage` and the concurrency
  count both stand still.

## Decisions taken during D2

The phase 22 handoff's locked list still holds. These are additions.

| Thing | Call |
| --- | --- |
| **Member Track** | One per member, on `user_profiles.track`. Set by `set_member_track` (self, or admin / service role), picked on `/account` |
| Track multiplicity | **Multiplicity is `groups`, not a second track column.** A Track is the entry cohort from the Skool join poll — singular. Missions / Build Groups are `groups` rows (`kind = 'challenge'` from D5). If that proves wrong the additive fix is a `member_tracks` join table, and only the recommender's filter has to change |
| Where the Track picker lives | `/account`, **not** `/account/preferences` — that page redirects to Discord whenever the match surface is not `web`, so a control there would vanish exactly when D3 needs it |
| Site discovery | Yes. `discoverable_groups()` lists `listed` and `open` rooms, with RLS to match. The site is the source of truth, so a Discord outage degrades to a usable product |
| Joining a listed group | **A request, auto-gated by the caps.** New `group_members.status = 'requested'`; the owner or an admin approves. Caps are checked at request time for a useful message and **again at approval**, because the cap that binds is the one in force when the seat is taken |
| `declined` status | Added. The spec wants a declined invite to leave an auditable row; without a status of its own it would have to masquerade as `removed` |
| Quota exemption label | `matches.source = 'group'`, with `check ((in_group_id is null) = (source <> 'group'))`. A quota-exempt row is visibly different in the data, and the exemption cannot drift from the label |
| Concurrency and groups | Group pairings are exempt from **both** the monthly quota and `max_concurrent_matchups`. Counting them would make a sprout cap of 1 unsatisfiable the moment they joined a four-person group |
| Challenge cohorts | Admin-only to create, and `join_group` refuses them with "challenge cohorts open in a later phase". They take no creator seat and are not counted against the feedback-group caps |
| Group sizes | Enforced by `kind`: feedback 4–6, challenge 2–12 |
| `groups.created_by` | **Nullable, ON DELETE SET NULL** — departing from the spec's `not null`. With `not null` the FK must cascade, and one member deleting their account would evaporate a four-person room and strip the provenance off the matches made inside it |
| Ownership succession | Happens on **both** paths: `leave_group` hands the room to the longest-standing member, and `trg_group_members_succeed_owner` does the same when a cascade removes an owner's row. Without the trigger a deleted owner leaves a room nobody can invite into, approve for, recommend for, or close |
| `group_members.asset_id` | **ON DELETE SET NULL**, and the "active implies an asset" table CHECK dropped with it. See the traps below |
| The act-as path | **Landed early.** `resolve_acting_member(p_acting_user_id)` honours the argument only for `auth.role() = 'service_role'`; `assert_active_user(uuid)` is the by-id form of `assert_active_caller()`. Every group RPC takes it |

## Next: D3 — groups in Discord

**Scope:** `/group create / recommend / invite / join / members / close`,
`/me`, private-thread creation and membership.

**Smaller than the spec estimates.** The interactions endpoint, Ed25519
verification, the deferred-response pattern and the command router all shipped
with D1; the RPCs and the port operations all shipped with D2. What is
genuinely left is the Discord side: command definitions, handlers under
`src/lib/discord/commands/`, thread creation through `rest.js`, and
`recordGroupRoom` to write the thread id back.

**Done when:** five testers run every command in the test guild and the rows
match what the site shows.

**Rollback:** unregister the commands. The site keeps working.

### Three things D3 must know

1. **Flipping the match surface to `discord` is safe for the recommender and
   not for pairing, by design.** `recommend_group_members` calls
   `match_candidates_for` — the ungated core — so it survives the flip;
   `verify-phase22` asserts exactly that. `pair_in_group` calls `create_match`
   and therefore inherits the Phase A gate, so when the surface flips, web
   pairing stops and pairing happens in the room. That is the intended
   direction, not a regression. **Do not "fix" it by widening the gate.**

2. **Every group RPC already takes `p_acting_user_id`.** Call them through the
   adapter, which passes it. A service-role call that names nobody is refused
   rather than silently acting as null, and a member passing someone else's id
   is refused.

3. **`set_group_discord_ids` is the only write a member cannot make.** Service
   role or admin only, and it is `coalesce`-based: passing null for one id
   leaves that id alone.

## Traps and lessons from D2 — these cost real time

Four of these were found by `verify-phase22` after the migration was already
applied and looked fine. All four are the same shape: **a guard that silently
does nothing**.

1. **`PERFORM` resets `FOUND`.** `join_group` did
   `select … into v_row; … perform assert_a(); perform assert_b(); … if found
   then update … where id = v_row.id`. By then `FOUND` reported the last
   `PERFORM`, so the update ran against a null id, matched nothing, and
   returned success. Members appeared to join open groups and did not.
   **Capture `found` into a local boolean immediately after the `SELECT`.**

2. **Three-valued logic opens owner-only guards.** `group_role_of()` returns
   null for someone with no seat, and `null = 'owner'` is null, not false — so
   `if not (<null> or false or false) then raise` never fires. A non-member
   could invite to someone else's group, approve their own join request, and
   read another group's recommendations. The fix is `is_group_owner()`, which
   returns `exists(...)` and therefore never null, plus `coalesce(…, false)`
   on every `auth.role() = 'service_role'` and nullable-column comparison.
   The same hardening went onto the Phase A surface guard in both functions
   that carry it. **Any `if not (A or B or C) then raise` in this codebase is
   worth re-reading with null in mind.**

3. **`revoke all on function … from public` does almost nothing here.**
   Supabase ships an `ALTER DEFAULT PRIVILEGES` granting `EXECUTE` on every
   new function in `public` to `anon` and `authenticated` **by name**, and
   revoking the `PUBLIC` pseudo-role leaves named grants untouched. Section 10
   read as if it had locked these down; it had not. That mattered most for
   `match_candidates_for`, which exists *because* it has no caller check —
   left executable by `authenticated`, any member could pass another member's
   user id with one of their asset ids (both readable under existing policies)
   and read back that person's whole candidate list including the
   `shortest_path_degree` to every other member. The relationship graph is not
   public. **Section 11 revokes by role name, and `verify-phase22` asserts the
   ACL mentions neither role.** Do this for every internal function you add.

4. **A `RESTRICT` foreign key on a column that cascades from the same parent
   is a coin flip.** `group_members.asset_id` was `ON DELETE RESTRICT`.
   Deleting an account cascades both its `assets` and its `group_members` rows
   from the same parent row, so whether `RESTRICT` fired depended on the order
   PostgreSQL happened to run two cascade triggers in. It did not fire. "It
   did not fire" is not a guarantee, and an account that cannot be deleted is
   precisely the failure Phase 21 shipped. It is now `ON DELETE SET NULL`, the
   conflicting table CHECK is gone, the requirement lives in
   `assert_pairable_asset` on every path to `active`, and `set_group_asset`
   plus a notice on the Groups tab let a member refill an emptied seat.

5. **Append-only triggers must be `FOR EACH ROW` — still true, and the new
   trigger obeys it.** `trg_group_members_succeed_owner` is `AFTER DELETE FOR
   EACH ROW` and **raises nothing at all**, because it runs inside account
   deletion. The points ledger will hit this again.

6. **Make verify cleanup report its failures.** `admin.auth.admin.deleteUser`
   resolves with `{ error }` instead of throwing, so a `.catch(() => {})`
   silently left 27 test accounts and nine orphaned groups in the live
   database across three runs. The `finally` block now prints what it could
   not remove.

7. **A fixture helper that mutates shared state will bite.** `mkAsset` set
   `user.assetId` on every call, so creating a spare asset repointed the
   member's default and the asset-deletion test deleted the wrong row. It now
   only sets the first.

## After D3

| Step | Scope |
| --- | --- |
| D4 | **Smaller than it was.** The act-as path and `assert_active_user` shipped in D2. What is left: widen `create_match`'s own member-input source check to accept `'discord'`, give `create_match` the `p_acting_user_id` argument (copy the shape from the group RPCs), `/feedback`, the site entry point a group pairing links to, and widen `member_feedback_ratings` to `(rater, rated, feedback_submission_id)` |
| D5 | Challenge cohorts. `kind = 'challenge'` exists and is admin-only; `join_group` refuses it with a message naming this phase. Still owed: the cohort channel, `opens_at` / `closes_at` behaviour, `#checkpoints`, and the Pro gate — now just `plan_code = 'bloom'` |
| D6 | `review_channels` catalog (migrate `asset_channels.channel_name` off free text), `member_channel_identities`, `review_nodes`, `review_events`, `review_separation_for_match`, the end-of-match prompt, `/account` reviews section, admin master view |

Then the points economy: `interactions`, the ledger, the admin approval queue,
`/assist` and `/claim`.

## Constraints that bite

The phase 22 list still holds, with three changes:

1. `feedback_submissions.match_id` is `not null` — unchanged.
2. `matches` requires an asset on **both** sides — unchanged, and it is why
   `assert_pairable_asset` guards every path to an active seat.
3. `matches.source` — **still half done, but less so.** The table CHECK now
   allows `auto | browse | queued | discord | group`, and `create_match`
   accepts `group` from members. Its member-input check still refuses
   `'discord'`; that and the act-as argument are D4's.
4. `member_feedback_ratings` is `unique (rater_user_id, rated_user_id)` —
   unchanged. Widen it in D4. **This now matters more:** a group of four
   produces six pairings, and two people who meet again in a second group will
   produce feedback but no second rating.
5. **The bot cannot call existing member RPCs** — solved for the group RPCs
   (`resolve_acting_member`), still true for `create_match`.
6. `user_profiles` takes no direct writes from `anon` or `authenticated` —
   unchanged, and `track` relies on it the same way `plan_code` does.
7. `plan_feature_gates` is readable only `to authenticated`;
   `public_plan_caps()` is the whitelist. All three D2 keys were already in it
   from Phase 21b, so `/pricing` picked them up with no code change.

## The two seams

Unchanged, and `verify-phase20` plus `verify-phase22` both check them.
`src/lib/discord/` imports no Supabase; `src/lib/community/` imports no
Discord; route handlers are the composition roots.

The port now owes an adapter eight group operations. **D4 adds
`createPairing`** — put it in `port.js` first.

## Still open

- **Discord portal steps 1–7.** All unblocked, and now a prerequisite for D3
  rather than an aside. `docs/discord-setup.md` has the walkthrough; the
  server is **5⭐️s**; steps 6 and 7 go together.
- **The Skool → plan webhook.** Deferred, not forgotten.
  `POST /api/skool/membership` guarded by `SKOOL_WEBHOOK_SECRET`, driven by
  Zapier polling Skool (keyed by email), calling
  `set_member_plan(..., 'skool', <email>)` and writing the
  `member_identities(provider = 'skool')` row. Needs a Skool Pro plan.
  **New reason to want it:** `user_profiles.track` is meant to come from the
  Skool join poll, and nothing imports it yet — members set their own Track by
  hand on `/account` until something does.
- **The standalone-product brief.** Market, what extracts now that the seams
  exist, what multi-tenancy costs, a competitive scan (MEE6/Arcane;
  Circle/Heartbeat/Mighty Networks; anything already bridging Skool and
  Discord), and a recommendation. Written deliverable, not code.
- **`mock-data.js` still feeds real surfaces.** `ME`, `ME_PROFILE`,
  `MATCHES`, `MEMBERS`, `HISTORY_ITEMS`, `PROOF_LISTINGS`. The dashboard
  header's stat tiles (`4/12`, `2/6`, `Posted 14`, `Pending 2`) are still
  hardcoded strings — now conspicuous next to a Groups tab that reads live
  counts. Each one is a query waiting to be written.
- **No group surface outside the dashboard tab.** No `/groups/<id>` page, no
  email when you are invited, and `my_groups` is polled on tab open rather
  than subscribed. All fine for D3, all worth a look before real members
  arrive.

## Ops notes

Migrations are applied live via the Supabase Management API (see the
`db-migration-verify-workflow` memory); the repo is not linked to the CLI.

Production env: `RESEND_*`, `ANTHROPIC_API_KEY`, and
`NEXT_PUBLIC_SITE_URL=https://app.proofsignals.net` are set. Still to add
for D3: `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`,
`DISCORD_GUILD_ID`, `DISCORD_MEMBER_ROLE_ID`,
`NEXT_PUBLIC_DISCORD_INVITE_URL`, `NEXT_PUBLIC_DISCORD_OAUTH_ENABLED`.
Optional: `NEXT_PUBLIC_MARKETING_URL`, `NEXT_PUBLIC_SKOOL_FREE_URL`,
`NEXT_PUBLIC_SKOOL_PAID_URL`.

**Rollback for D2:** raise the three gate limits. The tables stay.
**Rollback for anything Discord-side:** unset `DISCORD_PUBLIC_KEY`. The
endpoint returns 503, the site keeps working, no data changes.

**One caution on `verify-phase22.mjs`:** it flips the live `match_surface`
gate to `discord` and back. The `finally` block restores it and says so, but
if you kill the run mid-way, check the gate before walking away.
It also needs ~40 sign-ins and will back off around Supabase's rate limit, so
a full run takes a few minutes.
