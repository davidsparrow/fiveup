# Continuation Prompt — Supabase schema audit: the Docker cross-check and what is left

**This is not a phase.** It is a verification task that came out of one
question — "which migration statements have not been applied?" — which turned
out to have no recorded answer, because this project has no migration history
and is not managed by the Supabase CLI.

Read `CLAUDE.md` first, especially **Migrations** and **SQL gotchas**. The
current product handoff is `docs/fiveup-continuation-phase24.md` (D4); this
document is orthogonal to it and can be done before, after or alongside.

**Status as of 2026-11-10.** Jobs 1 and 2 are done. Job 3 is half done:
triggers and policies are closed, five classes remain and are the only
outstanding work in this document.

## Ground rules, from the project owner

- **The owner works in the Supabase web SQL editor, not the CLI.** Hand them
  SQL they can paste. Do not assume a terminal workflow for them.
- **`supabase db push` must never be run against this project.** There is no
  `supabase_migrations.schema_migrations` table, so a push would replay all 42
  migrations against a database that already has them, and the non-idempotent
  ones (`create type`, `add constraint`, phase 19's rename block) would fail or
  misbehave inside a single transaction.
- **`supabase link` and Docker are approved** for `supabase db diff --linked`
  and `supabase db dump`, which read and do not write. On `link` itself:
  earlier versions of this document said "linking alone changes nothing on the
  server", which is right in effect but worth not taking on faith — the
  command prints `Initialising cli_login_postgres role...` before it connects.
  **`pg_roles` was checked after both a failed link and a successful one, and
  no `cli_login%` role exists either way**, so with password auth it really
  does leave nothing behind. The message is about a role the CLI provisions
  for its dashboard-SSO login path, not for this one. What `link` *does* leave
  is local: `supabase/.temp/project-ref`, which is what gives `db push` a
  target — delete it when you are finished.
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
compares it against live introspection. **1205 checks, clean** as of
2026-11-10 (910 before sections 6–8).

| § | Class | Covered | Result |
| --- | --- | --- | --- |
| 1 | tables, views, functions, types, columns | 31 / 0 / 185 / 16 / 43 | 0 missing |
| 2 | policies, indexes, triggers, constraints, RLS | 64 / 45 / 21 / 9 / 31 | 0 missing |
| 3 | privileges **on functions** | 297 statements → 276 final `(function, role)` intents | 0 mismatched |
| 4 | function bodies vs `pg_proc.prosrc` | 129 definitions | 0 stale |
| 5 | `plan_feature_gates` seeds | 60 `(plan, feature_key)` pairs | 0 missing |
| 6 | **standing invariants** — TRUNCATE grant, default ACLs, the private bucket | 31 tables, 2 default ACLs, 1 bucket | 0 granted to a client role |
| 7 | **trigger definitions** — timing, events, level, function, `WHEN` | 24 definitions | 0 mismatched |
| 8 | **policy expressions** — every `USING` / `WITH CHECK` | 58 definitions, 72 clauses | 0 mismatched |

**"CLEAN" still does not mean "every migration is applied."** It means every
statement of a shape the script parses has its end state live. Statements
inside a `do $$ ... $$` block are not parsed, and neither are table-level
grants — which is exactly how Job 1's own migration sat unapplied while the
script reported 910/910 clean. Section 6 is the general answer to that gap:
**assert the end state you want, not the SQL that produced it.** Treat the
headline as "no drift in the covered classes", never as a release gate.

### The self-test is now committed

`node audit-selftest.mjs` — **16 expectations across 5 cases**, each
introducing one defect and asserting the audit reports it, then asserting the
tree is CLEAN again afterwards (without that last step, a case that failed to
restore a file would still "pass"). All 16 caught.

It **patches migration files only and never writes to the database.** The one
live-state assertion, section 6's TRUNCATE invariant, is exercised through the
`AUDIT_TRUNCATE_ROLES` env seam pointed at `service_role`, which legitimately
holds TRUNCATE on all 31 tables. Granting TRUNCATE to `anon` for real and
relying on a cleanup step to take it away again is the shape of mistake that
left test users in production twice — see CLAUDE.md.

The case that earns its place: **an AND/OR regrouping whose token sequence is
byte-identical to the original.** `groups_select_visible` reads
`A or B or (C and D) or E or F`; the tamper makes it
`A or B or (C and (D or E)) or F`. Strip the parens from either and you get
the same stream of tokens. A normaliser that removes parens — the obvious
first design, and the one this section nearly shipped — passes it. Only a real
parse tree tells them apart, and they are materially different access rules.

**If you extend the audit, extend this.** A validator that only ever reports
CLEAN is indistinguishable from no validator.

### Traps that produced wrong answers first

1. Matching only the first column of a multi-column `ALTER TABLE` skipped **22
   of 43** `add column` statements. Eight ALTERs here add more than one
   column; one adds ten.
2. Comparing a comment-stripped file body against `prosrc`, which preserves
   comments, reported **27 healthy functions as stale**. Statement detection
   wants comments gone; body comparison needs them intact. The script keeps
   both forms (`body` and `raw`).
3. **`pg_get_expr` does not return the text anyone wrote.** It deparses the
   stored parse tree: `a.status = 'active'` comes back as
   `(a.status = 'active'::text)`, fully parenthesised, keywords upper-cased,
   `public.` dropped where the search_path covers it. Normalising that by hand
   means guessing at the deparser, and guessing leniently gives a comparison
   that passes everything. **Section 8 does not normalise — it hands the
   file's clause to the same deparser:**
   `create or replace temporary view v as select 1 as c from <table> where
   (<file clause>)`, then `pg_get_viewdef(v, false)`, and the two canonical
   strings match modulo indentation. Read-only in effect (a temp view dies
   with the session, and each probe is created and read inside one Management
   API request), no heuristics, and a clause that no longer type-checks fails
   loudly instead of being normalised into agreement.
   Note `pg_get_viewdef(v, **true**)` is the *pretty* form and strips
   redundant parens — it does **not** match `pg_get_expr`. Pass `false`.
4. **The Management API returns a Postgres array as its text form, `{a,b}`,
   not as JSON.** Spreading that string iterates its characters, which turned
   every policy into a role mismatch — **54 findings that were all one missing
   parse**, and which looked entirely plausible until read closely.
5. **The Management API throttles.** 72 clauses as 72 requests hit 429s
   partway through, and an un-retried 429 arrives as a per-clause error
   reading `the migration's clause does not parse` — a false finding that
   names a real file and a real policy. `sql()` now backs off, and the probes
   batch 12 to a request. A batch is one transaction, so one bad clause rolls
   back the rest; the per-clause fallback exists to find out *which*.

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
- **All 22 live triggers are `FOR EACH ROW` and none carries a `WHEN`
  clause.** The phase 21 failure mode is absent, and section 7 now keeps it
  that way — it prints the count of statement-level triggers on every run.

## Job 1 — the TRUNCATE revoke · DONE, 2026-11-09

`supabase/migrations/20261109120000_revoke_truncate_from_client_roles.sql` was
applied through the Management API. Before: 29 of 31 public tables granted
`TRUNCATE` to both `anon` and `authenticated`. After: the verification query
returns zero rows, and `service_role` / `postgres` keep theirs. Every other
verb is untouched — `anon` still holds SELECT and INSERT on `matches`, which
is Supabase's intended model and not a bug, because RLS decides those.

**The finding, for the record.** The open grant was Supabase's default
`grant all on all tables in schema public`. Only the two tables with an
explicit revoke escaped — `blocked_phrases` (20260311150000) and
`user_profiles` (20260715120000), both of which spell
`revoke insert, update, delete, truncate`. Phase 22 wrote
`revoke insert, update, delete` on `groups` and `group_members` and omitted
the fourth word, which is how this surfaced.

**Why it mattered.** PostgreSQL does not apply RLS to `TRUNCATE`. For every
other verb the grant is permissive and the policy decides; for `TRUNCATE` the
grant is the only gate.

**Why it was not an incident.** `anon` and `authenticated` are `NOLOGIN` (only
`authenticator` opens a session, and it `SET ROLE`s per request); neither holds
`CREATE` on schema `public`, so the `TRIGGER` privilege from the same default
is not an escalation path; PostgREST exposes no TRUNCATE verb; and no
`SECURITY INVOKER` function uses dynamic `EXECUTE`. Latent, not live — and any
one of those four changing would have made it live.

**The part the migration could not fix, and why section 6 exists.**
`alter default privileges` binds to the **granting role**. The migration
narrowed `postgres`'s default, which is the one that matters: all 31 tables are
`postgres`-owned, so tables created by future migrations arrive without the
grant. But `supabase_admin` holds its own default ACL on schema `public` that
still includes `D` for `anon` and `authenticated`, and `postgres` is neither a
member of `supabase_admin` nor a superuser, so that ACL **cannot be changed
from here.** A table created by Supabase's own tooling rather than by a
migration would still arrive with the hole open. Section 6 reports that
residue separately — as a known, unfixable-from-here fact rather than as drift,
because failing the audit on it would make the audit permanently red for
something no migration can address.

CLAUDE.md's SQL-gotchas list now carries the rule.

## Job 2 — the Docker cross-check · DONE, 2026-11-10

**`supabase db diff --linked --schema public` → "No schema changes found."**

This is the one direction `audit-migrations.mjs` structurally cannot check.
The audit reads files and asks "is this live?"; `migra` diffs a full replay
against the live schema, so an object present live that **no migration
describes** would appear in the diff as a `DROP`. Nothing did. All 42
migrations also replayed cleanly into a bare Postgres, which is its own
result: the migration set is self-contained.

To redo it: `SUPABASE_DB_PASSWORD` in `.env.local`, Docker running, then

```
export SUPABASE_ACCESS_TOKEN=$(grep -oE '^SUPABASE_PERSONAL_ACCESS_TOKEN=.*' .env.local | cut -d= -f2-)
export SUPABASE_DB_PASSWORD=$(grep -oE '^SUPABASE_DB_PASSWORD=.*' .env.local | cut -d= -f2-)
supabase link --project-ref srszeppvzwbrqcfzwexl
supabase db diff --linked --schema public
rm -rf supabase/.temp          # unlink again — see below
```

**Unlink when you are done.** `supabase/.temp/project-ref` is the whole of the
link, and while it exists `supabase db push` has a target. CLAUDE.md bans that
command because with no migration history it would replay all 42 against a
database that already has them. Removing `.temp` makes the ban structural
rather than a note someone has to remember. `supabase/config.toml` is
committed (generated by `supabase init`) so a re-link costs one command.

### Three things that had to be solved to get this to run

1. **No `config.toml` existed.** `supabase link` works without one, but
   `db diff` needs it. `supabase init` generates it; it is now committed.
2. **The migration set could not replay.** `20260308130000` does
   `insert into storage.buckets`, and the CLI builds its shadow **without the
   Storage service** — the shadow has an empty `storage` schema owned by
   `supabase_storage_admin`, with no `buckets` and no `objects`. The replay
   died at migration 8 of 42. Neither creating the tables as `postgres`
   (`permission denied for schema storage`) nor `set role
   supabase_storage_admin` (`permission denied to set role`) works, so there
   is no way to stub it from inside a migration.
   **Fixed at the source:** that migration is now guarded on
   `to_regclass('storage.buckets') is null → raise notice; return`, applied
   live, and verified to leave the bucket and both policies byte-identical
   (`pg_get_expr` compared before and after). The whole set now replays with
   no workaround.
   The DDL inside the guard is deliberately **plain, not dynamic `execute`**:
   PL/pgSQL binds SQL statements lazily, so the branch that is never taken is
   never parsed against the missing tables, *and* the audit's `create policy`
   parser still reads both policies straight out of the file. Confirmed — the
   policy counts did not move after the rewrite (64 expected, 58 definitions,
   72 clauses). The bucket row itself is no longer parseable, so section 6
   asserts it instead: present, and `public = false`.
3. **A `--schema storage` diff is impossible** and always will be, for the
   same reason the replay failed: the shadow has no storage tables to diff
   against. The storage side is covered instead by section 8 (both policies
   compared exactly) and section 6 (the bucket exists and is private).

### What an empty diff does and does not prove

`migra`'s privilege coverage is partial. Sections 3 and 6 are the authority on
function ACLs and the TRUNCATE invariant; if `migra` ever disagrees, treat it
as a question and resolve it with `pg_proc.proacl` / `has_table_privilege`,
not as a verdict. An empty diff is about schema **shape**.

## Job 3 — the classes still unverified

Triggers and policies are **done** (sections 7 and 8). What remains is the
same shape: `audit-migrations.mjs` checks these **exist**, not that their
**definitions match**.

| Gap | Count | How to close it |
| --- | --- | --- |
| **CHECK constraint expressions** | 7 named CHECKs | `pg_get_constraintdef(oid)` vs the file text. Phase A drops and recreates `matches_source_check` with a widened expression under the same name, so a name-only check cannot tell the old one from the new. The canonical-reprint problem applies, and **section 8's deparser trick solves it**: a temp view's `WHERE` is the same deparser, or probe with `alter table ... add constraint ... check (...) not valid` in a rolled-back transaction. Start here — it is the smallest remaining class and the one with a known same-name redefinition |
| **Index definitions** | 45 | `pg_indexes.indexdef` vs the file statement. Catches a partial index whose `WHERE` was changed, or a column-order change, under an unchanged name. `indexdef` is itself canonical text, so compare whitespace-collapsed and expect the file to differ only in case and `public.` qualification |
| **Table/column-level grants** | 6 statements | Section 3 parses `on function` only. Section 6 covers TRUNCATE for all roles and all tables; this generalises it to the six `grant`/`revoke` statements that target tables. Resolve to a final intent per (table, role, privilege) the way section 3 does for functions |
| **`alter column`** | 6 statements, all phase 19 | Nullability, defaults and the type change on `external_review_reports.status`. Check `information_schema.columns` |
| **`comment on`** | 23 statements | `obj_description()` / `col_description()`. Cosmetic, lowest value, cheap |
| **`do $$ ... $$` blocks** | 1 today, more later | The parser reads no statement inside a procedural block. **Section 6 is the pattern to copy: assert the intent, not the statements.** Several older migrations wrap `alter table ... add constraint` in `do` blocks for idempotency, so this overlaps the constraint row above |
| **Data backfills** | 116 `update public.x set ...` | **Probably not worth automating.** The end state is data-dependent, and on a near-empty members table a row that was never updated is indistinguishable from a row that never existed. Read them once by hand and decide if any carry a durable invariant worth asserting |

Suggested order: constraints, indexes, table grants, alter column, comments.

## How the owner can help

They offered to run SQL. Good uses of that:

- Anything needing the **web editor's** elevated session rather than the
  Management API — though in practice the API runs as `postgres` too, so this
  is rarely necessary. Note what `postgres` cannot do: it is not a superuser
  and not a member of `supabase_admin`, which is why that role's default ACL
  is out of reach (Job 1).
- **Reading a long introspection dump** and pasting it back, if a query's
  result is too large for the API response.
- **Applying privilege changes** they want to review first — like Job 1.
- Confirming `status` and restoring the project when it auto-pauses. **Only
  they can do this**; the restore endpoint was deliberately not called.

Give them complete, pasteable SQL with a stated expected result ("expect zero
rows"), not fragments.

## Loose ends not about schema

- **The four phase-21 test accounts are gone** (deleted 2026-11-09):
  `verify21-member/admin/other/doomed-22e8-1yco@example.com`, created
  2026-10-16 by a run whose cleanup used `.catch(() => {})`. Deleted by
  explicit id rather than by a `LIKE` pattern. The cascades ran clean —
  `user_profiles` went 10 → 6 — which also exercised the account-deletion path
  that phase 21's statement-level trigger broke. `auth.users` now holds 6
  accounts and no `verify%`.
  **One consequence:** `public.user_roles` is now empty. The single row in
  that table belonged to the test admin, so no real admin role was removed —
  but nothing currently holds `admin` or `moderator`, which matters the moment
  anyone tests an admin-gated path.
- **Never pipe a verify run through `head`.** SIGPIPE kills Node before the
  `finally` block that deletes fixtures — that is how three test users and two
  groups ended up in production mid-build. Redirect to a file.
- **Consider `supabase migration repair --status applied <version>`** for all
  42 versions, once, if the owner ever wants the CLI's bookkeeping. It stamps
  history **without executing SQL**, which would make `supabase migration
  list` meaningful and `db diff` cheaper to reason about. It does not imply
  ever running `db push`.
