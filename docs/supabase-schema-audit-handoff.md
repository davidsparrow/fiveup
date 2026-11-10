# Continuation Prompt — Supabase schema audit: the Docker cross-check and what is left

**This is not a phase.** It is a verification task that came out of one
question — "which migration statements have not been applied?" — which turned
out to have no recorded answer, because this project has no migration history
and is not managed by the Supabase CLI.

Read `CLAUDE.md` first, especially **Migrations** and **SQL gotchas**. The
current product handoff is `docs/fiveup-continuation-phase24.md` (D4); this
document is orthogonal to it and can be done before, after or alongside.

## Ground rules, from the project owner

- **The owner works in the Supabase web SQL editor, not the CLI.** Hand them
  SQL they can paste. Do not assume a terminal workflow for them.
- **`supabase db push` must never be run against this project.** There is no
  `supabase_migrations.schema_migrations` table, so a push would replay all 42
  migrations against a database that already has them, and the non-idempotent
  ones (`create type`, `add constraint`, phase 19's rename block) would fail or
  misbehave inside a single transaction.
- **`supabase link` and Docker are approved** for read-only work —
  `supabase db diff --linked` and `supabase db dump`. Linking alone changes
  nothing on the server.
- Migrations are applied via the Management API (`POST
  /v1/projects/<ref>/database/query`, `User-Agent: curl/8.4.0`, empty `[]`
  means success), or by the owner pasting SQL into the web editor. Either is
  fine; say which you are proposing.
- The project **auto-pauses** when idle. `GET /v1/projects/<ref>` →
  `status` must be `ACTIVE_HEALTHY`. A paused project returns HTTP 400
  `"Database is possibly not accessible at the moment"`, which reads like a
  credentials problem and is not. Only the owner can restore it (dashboard).

Project ref: `srszeppvzwbrqcfzwexl`. Credentials are in `.env.local`
(`SUPABASE_PERSONAL_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`).

## What is already verified — do not redo this

`node audit-migrations.mjs` is committed at the repo root. It reconstructs the
expected end state from the 42 migration files in chronological order and
compares it against live introspection. **910 checks, clean** as of
2026-11-09.

| Class | Covered | Result |
| --- | --- | --- |
| tables, views, functions, types, columns | 31 / 0 / 185 / 16 / 43 | 0 missing |
| policies, indexes, triggers, constraints, RLS | 64 / 45 / 21 / 9 / 31 | 0 missing |
| privileges **on functions** | 297 statements → 276 final `(function, role)` intents | 0 mismatched |
| function bodies vs `pg_proc.prosrc` | 129 definitions | 0 stale |
| `plan_feature_gates` seeds | 60 `(plan, feature_key)` pairs | 0 missing |

**"CLEAN" does not mean "every migration is applied."** It means every
statement of a shape the script parses has its end state live. Statements
inside a `do $$ ... $$` block are not parsed at all, and neither are
table-level grants — which is why Job 1's own migration is currently unapplied
and the script still reports 910/910 clean. Treat the headline as "no drift in
the covered classes", never as a release gate. Closing this is part of Job 3.

It is verified in **both** directions: a temporary self-test migration
expecting a missing table, two columns, an index, a policy, RLS, a function, a
contradicted privilege, a tampered body and an absent seed row was caught in
all ten cases. If you extend it, extend that self-test too — a validator that
only ever reports clean is indistinguishable from no validator.

**Two bugs it had first, both found by its numbers disagreeing with a raw
statement tally rather than by the script complaining.** Expect more of this
shape:

1. Matching only the first column of a multi-column `ALTER TABLE` skipped **22
   of 43** `add column` statements. Eight ALTERs here add more than one
   column; one adds ten.
2. Comparing a comment-stripped file body against `prosrc`, which preserves
   comments, reported **27 healthy functions as stale**. Statement detection
   wants comments gone; body comparison needs them intact. The script now
   keeps both forms (`body` and `raw`).

Also settled, so nobody re-investigates:

- **Nothing is missing.** All 42 migrations' end states are live. The only
  absent objects are the review-solicitation feature
  (`request_review_post`, `respond_review_post_request`, `mark_review_posted`,
  `validate_review_post_request`, and the `review_post_requests` table, which
  phase 19 **renamed** to `external_review_reports`). That is the house rule in
  CLAUDE.md working: the platform never raises online reviews.
- Enum values all present: `app_role.moderator`,
  `proof_lab_request_status.completed`,
  `moderation_action_type.restore_content`.
- Storage bucket `asset-screenshots` exists and is correctly **not** public.

## Job 1 — apply the TRUNCATE revoke (written, not applied)

`supabase/migrations/20261109120000_revoke_truncate_from_client_roles.sql` is
written and **waiting for the owner's go-ahead**. It was not applied because it
changes privileges on 29 production tables, and the owner asked to be in the
loop on SQL.

**The finding.** 29 of 31 public tables grant `TRUNCATE` to both `anon` and
`authenticated`. This is Supabase's default
`grant all on all tables in schema public`, and only the two tables with an
explicit revoke escaped it: `blocked_phrases` (20260311150000) and
`user_profiles` (20260715120000) — both of which spell
`revoke insert, update, delete, truncate`. Phase 22 wrote
`revoke insert, update, delete` on `groups` and `group_members` and omitted
the fourth word, which is how this surfaced.

**Why it matters even though the other write grants are fine.** PostgreSQL
does not apply RLS to `TRUNCATE`. For every other verb the grant is permissive
and the policy decides — that is Supabase's intended model, and `anon` holding
`INSERT` on a dozen RLS-protected tables is not a bug. For `TRUNCATE` the
grant is the *only* gate.

**Why it is not an incident.** Verified before writing the migration:

- `anon` and `authenticated` are `NOLOGIN`; only `authenticator` opens a
  session and it `SET ROLE`s per request
- neither holds `CREATE` on schema `public`, so the `TRIGGER` privilege from
  the same default is not an escalation path
- PostgREST exposes no TRUNCATE verb
- zero `SECURITY INVOKER` functions use dynamic `EXECUTE`, so there is no
  injection surface that would inherit these grants

So it is latent, not live. Any one of those four changing makes it live, which
is the argument for closing it now.

**Nothing depends on it** — no TRUNCATE appears anywhere in `src/`,
`supabase/migrations/` or the verify scripts.

**To apply:** either the owner pastes the `do $$ ... $$;` block plus the
`alter default privileges` line into the web editor, or you send the file
through the Management API. Then:

```sql
-- expect zero rows
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and (has_table_privilege('anon','public.'||quote_ident(c.relname),'TRUNCATE')
    or has_table_privilege('authenticated','public.'||quote_ident(c.relname),'TRUNCATE'));
```

Then **add that as a standing assertion** to `audit-migrations.mjs` (a sixth
section) so a future table cannot reintroduce it, and add a line to CLAUDE.md's
SQL-gotchas list: *`revoke insert, update, delete` is three quarters of a
revoke — TRUNCATE ignores RLS, so it needs the fourth word.*

## Job 2 — the Docker cross-check

Everything above is my parser agreeing with my own introspection queries.
`supabase db diff` is an **independent** second opinion: it replays the
migrations into a throwaway Postgres and diffs the result against the live
schema using `migra`. Approved by the owner.

```
open -a Docker                                   # or start Docker Desktop
docker info                                      # wait for this to succeed
supabase link --project-ref srszeppvzwbrqcfzwexl  # read-only; asks for the DB password
supabase db diff --linked --schema public > /tmp/diff-public.sql
supabase db diff --linked --schema storage > /tmp/diff-storage.sql
```

**An empty diff is the pass.** Any output is a statement whose effect is not
live, or a live object the migrations do not describe — both worth reading.

Three things to expect, so they are not mistaken for findings:

1. **Drift the migrations deliberately created.** Phase 19's rename means the
   live `external_review_reports` has no `create table` of its own; `migra`
   may propose recreating it. That is a diff, not a defect.
2. **Supabase-managed objects.** Anything in `auth`, `storage`, `realtime`,
   `extensions`, `graphql` is not ours. Diff `public` and `storage` only, and
   ignore storage rows the storage extension owns.
3. **Grants.** `migra`'s privilege coverage is partial. `audit-migrations.mjs`
   section 3 is the authority on function ACLs; treat a disagreement as a
   question, not a verdict, and resolve it by querying `pg_proc.proacl`.

**If Docker will not start,** two routes need neither it nor the CLI:

- **Local Postgres 17.** `brew install postgresql@17`, `createdb shadow`,
  replay all 42 files in filename order with `psql`, then
  `pg_dump --schema-only --schema=public shadow > /tmp/shadow.sql` and compare
  against `supabase db dump --linked -f /tmp/live.sql` or a hand-rolled
  introspection dump. Replay failures are themselves informative: they say
  which migrations are not self-contained.
- **A throwaway second Supabase project** as the shadow, with all 42
  migrations applied fresh through the Management API, then compare the two
  projects' introspection with the same queries `audit-migrations.mjs` uses.
  Costs a project slot; needs no local tooling at all.

## Job 3 — the classes still unverified

`audit-migrations.mjs` checks that these **exist**. It does not check that
their **definitions match**. This is the real remaining gap, and it is the
same shape as the function-body gap that section 4 closed — an object can be
present and wrong.

| Gap | Count | How to close it |
| --- | --- | --- |
| **Policy `USING` / `WITH CHECK` expressions** | 64 clauses | Compare `pg_policies.qual` and `.with_check` against the clause in the last `create policy` for that name. Same normalisation problem as bodies: Postgres reprints the expression canonically (`(auth.uid() = user_id)` for `user_id = auth.uid()`), so exact string equality will not work. Parse-normalise, or compare `pg_get_expr` output after re-parsing the file clause through the server. **Highest value of the four** — these are the actual access-control rules |
| **CHECK constraint expressions** | 7 named CHECKs | `pg_get_constraintdef(oid)` vs the file text. Phase A drops and recreates `matches_source_check` with a widened expression under the same name, so a name-only check cannot tell the old one from the new. Same canonical-reprint problem |
| **Index definitions** | 45 | `pg_indexes.indexdef` vs the file statement. Catches a partial index whose `WHERE` was changed, or a column-order change, under an unchanged name |
| **Trigger definitions** | 21 | `pg_get_triggerdef(oid)` vs the file. Catches a trigger that is `FOR EACH STATEMENT` where the migration says `FOR EACH ROW` — **which is precisely the phase 21 bug that broke every account deletion in the system** (see CLAUDE.md). Low count, high value |
| **Table/column-level grants** | 6 statements | `audit-migrations.mjs` section 3 parses `on function` only. Job 1 covers TRUNCATE specifically; this generalises it to the six `grant`/`revoke` statements that target tables |
| **`alter column`** | 6 statements, all phase 19 | Nullability, defaults and the type change on `external_review_reports.status`. Check `information_schema.columns` |
| **`comment on`** | 23 statements | `obj_description()` / `col_description()`. Cosmetic, lowest value, cheap |
| **`do $$ ... $$` blocks** | 1 today (Job 1's migration), more later | The script parses no statement inside a procedural block, so anything written that way is invisible to it. Either parse the block's `execute format(...)` targets, or — better — assert the *intent* separately, as Job 1's standing "expect zero rows" query does. Several older migrations wrap `alter table ... add constraint` in `do` blocks for idempotency, so this overlaps the constraint row above |
| **Data backfills** | 116 `update public.x set ...` | **Probably not worth automating.** The end state is data-dependent, and on a near-empty members table a row that was never updated is indistinguishable from a row that never existed. Read them once by hand and decide if any carry a durable invariant worth asserting |

Suggested order: triggers (smallest, and the known-dangerous one), then
policies (highest value), then constraints, indexes, table grants, alter
column, comments.

## How the owner can help

They offered to run SQL. Good uses of that:

- Anything needing the **web editor's** elevated session rather than the
  Management API — though in practice the API runs as `postgres` too, so this
  is rarely necessary.
- **Reading a long introspection dump** and pasting it back, if a query's
  result is too large for the API response.
- **Applying privilege changes** they want to review first — like Job 1.
- Confirming `status` and restoring the project when it auto-pauses. **Only
  they can do this**; the restore endpoint was deliberately not called.

Give them complete, pasteable SQL with a stated expected result ("expect zero
rows"), not fragments.

## Loose ends not about schema

- **Four test accounts from phase 21 are still in the production database**,
  created 2026-10-16: `verify21-member-22e8-1yco@example.com`,
  `verify21-admin-…`, `verify21-other-…`, `verify21-doomed-…`. That run's
  cleanup used `.catch(() => {})`, the pattern phase 22 fixed.
  `verify-phase21` passes with them present. Left rather than deleted because
  dropping auth users in production is not a cleanup to do unasked.
  `delete from auth.users where email like 'verify21-%';` is the sweep.
- **Never pipe a verify run through `head`.** SIGPIPE kills Node before the
  `finally` block that deletes fixtures — that is how three test users and two
  groups ended up in production mid-build. Redirect to a file.
- **Consider `supabase migration repair --status applied <version>`** for all
  42 versions, once, if the owner ever wants the CLI's bookkeeping. It stamps
  history **without executing SQL**, which would make `supabase migration
  list` meaningful and `db diff` cheaper to reason about. It does not imply
  ever running `db push`.
