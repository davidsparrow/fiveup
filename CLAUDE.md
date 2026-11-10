# fiveup / ProofSignals

Next.js 16 + React 19 + Supabase (SSR client, RLS on every table, logic in
security-definer RPCs), Resend for email, deployed on Vercel. Brand is
**ProofSignals**; `fiveup` / `fivestarz` are the old names still in paths.

**Hosting:** the apex `proofsignals.net` is a WordPress site on SiteGround;
this app lives on `app.proofsignals.net`. `getSiteUrl()` is the app host —
canonicals, OG images, the sitemap and every link the Discord bot posts use
it. `getMarketingUrl()` is the apex, for the few links that really mean the
marketing site.

**Plans:** `sprout` = free Skool member, `bloom` = paid Skool member,
`flourish` retired but dormant in the enum (`set_member_plan` refuses it).
Skool is the billing system; there is no Stripe. `plan_code` has exactly one
writer — `set_member_plan`, admin or service role — which appends to the
append-only `plan_grants` audit table and records the entitlement's `source`
so adding Stripe later is a second caller, not a refactor. Members take no
direct writes on `user_profiles`; don't loosen that.

## Start here

**`docs/fiveup-continuation-phase24.md` is the current handoff.** It carries
what last shipped, what is unfinished, the schema constraints that bite, and
the traps that cost real time. Read it before planning anything. Phase 22's
and phase 23's docs hold the locked product decisions and are still current —
each later phase adds to that list rather than replacing it. Phase 19's still
holds the points-economy spec verbatim.

The Discord side is being built as D1–D6. D1 (identity linking), D2a (plan
grants), the pricing lander, D2 (groups and caps) and **D3 (groups in
Discord) have shipped; D4, pairing and feedback in Discord, is next.**

D3's code is complete and verified against the live database, but it is **not
yet live in Discord**: the portal steps in `docs/discord-setup.md` are still
outstanding, and until step 7 runs the commands exist in this repo and not in
the server. `node src/lib/discord/register.mjs --dry-run` validates the
command surface with no credentials, which is how D3 was checked without it.

**Groups:** `groups` + `group_members` cover feedback groups now and challenge
cohorts from D5. Both tables take **no direct writes** from `anon` or
`authenticated` — the RPCs in `20261017120000` are the only road, and each one
takes an optional `p_acting_user_id` honoured only for the service role, which
is how the bot calls them. A pairing inside a group is a `matches` row with
`in_group_id` set and `source = 'group'`, exempt from monthly quota and from
`max_concurrent_matchups`.

**`open` is a visibility, not a status.** `groups.status` is
`forming | active | closed`; `groups.visibility` is `private | listed | open`.
A filter written as `status === 'open'` matches nothing and fails silently —
it shipped in D3's first draft and made `/group invite` and `/group close`
answer "you do not own any open groups" for every group. Use
`isGroupLive()` from `community/rules/groups.js`. Also note `my_groups` carries
only `active | invited | requested` seats, and `discoverable_groups` omits any
room the caller already has a row in — so "not found" and "already in it" are
indistinguishable unless a caller checks both.

The live design docs are **Claude Docs, not files in this repo**. Read them
with the Claude Docs connector (`read` project id → file id → node id);
never WebFetch an artifact URL.

- Questmates Discord Build Spec — the active one
  https://claude.ai/code/artifact/cba64031-9739-4da1-a29a-dc3c2e83db9e
- fiveup / ProofSignals Refactor Plan (2026-09-24, partly superseded)
  https://claude.ai/code/artifact/a79ea4fc-3bd9-4a66-8174-cd0000229abd
- IndieOps Launch Strategy v2 (2026-09-17, layer model and phase gates)
  https://claude.ai/code/artifact/898d94d2-8215-47da-9003-3883e8bff339

## Migrations

The repo is **not** linked to the Supabase CLI. Migrations in
`supabase/migrations/` are authored as idempotent SQL and applied live via the
Supabase Management API:

```
POST https://api.supabase.com/v1/projects/<ref>/database/query
  Authorization: Bearer $SUPABASE_PERSONAL_ACCESS_TOKEN   # from .env.local
  User-Agent: curl/8.4.0                                  # the WAF 403s other UAs
  {"query": "<sql>"}
```

Empty `[]` means success. The whole body runs in one transaction, so a
failure rolls everything back. `alter type ... add value` must go in its own
request before anything references the new value.

**There is no migration-history table.** The live database has no
`supabase_migrations.schema_migrations`, so the CLI has never managed it and
`supabase migration list` reports all 41 migrations as unapplied — a
bookkeeping gap, not a schema gap. **Never run `supabase db push` here:** with
no history it would replay all 41 against a database that already has them,
and the non-idempotent ones (`create type`, `add constraint`, phase 19's
rename block) would fail or misbehave inside a single transaction. If the CLI
is ever wanted, `supabase migration repair --status applied <version>` stamps
history without executing SQL.

**`node audit-migrations.mjs` answers "what has not been applied?"** It
reconstructs the expected end state from the migration files in chronological
order and compares it against live introspection — objects, policies,
indexes, triggers, constraints, RLS, every grant/revoke resolved to a final
intent per (function, role), function bodies against `pg_proc.prosrc`, and the
`plan_feature_gates` seeds. Sections 6–8 go past existence: a standing
TRUNCATE invariant, all 24 trigger definitions compared field by field
(timing, events, row-vs-statement, function, `WHEN`), and all 72 policy
`USING` / `WITH CHECK` clauses compared exactly. **1204 checks, currently
clean.** It does **not** cover data backfills, nor the definitions of CHECK
constraints, indexes, table-level grants, `alter column` or `comment on` —
those are still existence-only.

**`node audit-selftest.mjs` proves the audit catches things.** Sixteen
expectations across five cases, each introducing one defect into a migration
file — a `FOR EACH STATEMENT` trigger, a trigger on the wrong function, a
narrowed event list, a swapped enum literal, an unparseable column, a policy
on the wrong role and command, a dropped `WITH CHECK`, and an AND/OR
regrouping whose token sequence is byte-identical to the original. It patches
files only, never the database, and asserts the tree is clean again at the
end. Extend it whenever you extend the audit: a validator that only ever
reports CLEAN is indistinguishable from no validator.

Three traps these were written around, all of which produced wrong answers
first: matching only the first column of a multi-column `ALTER TABLE` skipped
22 of 43 `add column` statements; comparing a comment-stripped file body
against `prosrc` (which keeps comments) reported 27 healthy functions as
stale; and **`pg_get_expr` does not return the text anyone wrote** — it
deparses the parse tree, so normalising a policy clause by hand means guessing
at the deparser, and guessing leniently gives a comparison that passes
everything. Section 8 instead hands the file's clause to the same deparser
(`create temporary view ... where (<clause>)`, then `pg_get_viewdef(v,
false)`) and compares two canonical strings. Read-only, no heuristics, and a
clause that no longer type-checks fails loudly instead of being normalised
into agreement.

**The Management API throttles.** Section 8 makes many more calls than the
rest; un-retried 429s arrive as per-clause errors that read exactly like real
findings. `sql()` backs off, and the probes are batched 12 to a request.

## SQL gotchas that have each caused a real bug here

- **`revoke all on function ... from public` is not enough.** Supabase grants
  `EXECUTE` to `anon` and `authenticated` **by name** through default
  privileges, so revoking the `PUBLIC` pseudo-role leaves them. Revoke by role
  name for anything internal, and assert the ACL in the verify script.
- **`revoke insert, update, delete` is three quarters of a revoke.**
  PostgreSQL does not apply RLS to `TRUNCATE` at all, so for that one verb the
  grant is the only gate — and Supabase's default `grant all on all tables in
  schema public` hands it to `anon` and `authenticated` on every new table.
  29 of 31 tables were in that state until `20261109120000`. Spell the fourth
  word, and note that `alter default privileges` binds to the **granting**
  role: `supabase_admin` still holds a default ACL that grants TRUNCATE and
  `postgres` cannot change it, which is why `audit-migrations.mjs` section 6
  asserts the end state on every run instead of trusting the migration.
- **`PERFORM` resets `FOUND`.** Capture `found` into a local boolean right
  after the `SELECT INTO` if anything runs before you branch on it.
- **`if not (A or B or C) then raise` opens up when any operand is null.**
  `null = 'owner'` is null, `not null` is null, and `if null` is false — so the
  guard never fires. Use boolean-returning `exists(...)` helpers and wrap
  nullable comparisons in `coalesce(..., false)`.
- **A `RESTRICT` foreign key on a column that cascades from the same parent
  row is a coin flip,** decided by cascade-trigger order. If deleting an
  account could reach it, use `SET NULL` and keep the rule in the RPC.
- **Append-only or audit triggers must be `FOR EACH ROW`,** and anything that
  can run inside account deletion must not raise. A statement-level trigger
  fires even when the `UPDATE` matched no rows, which is how Phase 21 broke
  every account deletion in the system.

## Verification

Each phase commits a service-role Node script at the repo root,
`verify-phaseNN.mjs`. They read `.env.local`, create temp users with
`auth.admin.createUser` (the `handle_new_auth_user` trigger makes their
profile), sign them in with the anon client so RPCs get an `auth.uid()`,
exercise the behaviour, assert, and delete the users. Run with
`node verify-phaseNN.mjs`. Re-run the recent ones after schema changes.

**Never pipe a verify run through `head`.** SIGPIPE kills Node before the
`finally` block, which is where the fixtures are deleted — that is how three
test users and two groups ended up living in the production database. Use
`node verify-phaseNN.mjs > /tmp/out.txt 2>&1` and read the file.

**Fixture identifiers must be unique per run,** not a fixed base plus a
counter. Any run that dies before cleanup leaves rows behind, and a
deterministic sequence then collides with them on every later run — a unique
index turns one interrupted run into a permanently broken suite.

From D3: `verify-phase23.mjs` registers a `module.registerHooks` resolver for
the `@/` alias, so a verify script can import the real route handlers rather
than only the alias-free leaves. It also stubs `globalThis.fetch` for
`discord.com` only — passing Supabase's own fetch straight through — which is
how the thread-creation path is proved with no Discord app registered.

## Branching

One branch per phase, `claude-phase-NN`, stacked on the previous one, merged
to `main` by PR.

## The two seams

The Discord layer is built to be extractable, and two import rules make that
real rather than aspirational:

- Nothing under `src/lib/discord/` imports Supabase. Command handlers take a
  `port` argument.
- Nothing under `src/lib/community/` imports Discord. `port.js` names the
  operations, `proofsignals/adapter.js` is the only file there that knows
  Supabase exists, and `rules/*` imports no backend at all.

Route handlers are the composition roots and the only files allowed to import
both sides. `verify-phase20.mjs`, `verify-phase22.mjs` and
`verify-phase23.mjs` check both rules by grepping imports — if you need to
break one, the honest move is to add a composition root, not to loosen the
check.

**The adapter is a second place every RPC field has to be named.** Adding a
key to an RPC's returned `jsonb` does nothing until `adapter.js` maps it: D3
added `track` to `member_for_external_identity`, documented it in `port.js`
and read it in the handler, and every Discord-created group would still have
had `track = null`, because the adapter's `resolveMember` dropped it. Nothing
errors — the field is simply `undefined`. Assert the value, not the call.

## Naming

**Proof Market** is the marketplace on this site, at `/proof-market`. It was
renamed from "Proof Lab" and must never be called that again.

**IndieOps Proof Lab** is the free Skool group, at
`skool.com/indieops-proof-lab-2789`. Marketing copy talks about it freely —
"our Proof Lab", "The Proof Lab", "the only Proof Lab worth joining" are all
fine. The paid Skool group is the **IndieOps Incubator**, $99/month.

So the two senses are separated by context, not by wording.
`verify-phaseA.mjs` enforces exactly three things: `/proof-lab` is never a
route, "Proof Lab" never appears inside the marketplace's own files, and
"Proof Lab" is never attached to a marketplace noun (listings, deals,
sellers, categories). The `proof_lab_*` table and RPC identifiers in the
database are deliberately untouched.

## House rule

The platform never raises online reviews — it does not ask for them, suggest
them, compare channels, or reward them. Members may *report* that one
happened. Phase 19 removed the feature that broke this rule; don't
reintroduce it.
