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

**`docs/fiveup-continuation-phase23.md` is the current handoff.** It carries
what last shipped, what is unfinished, the schema constraints that bite, and
the traps that cost real time. Read it before planning anything. Phase 22's
doc holds the locked product decisions and is still current — phase 23 adds to
that list rather than replacing it. Phase 19's still holds the points-economy
spec verbatim.

The Discord side is being built as D1–D6. D1 (identity linking), D2a (plan
grants), the pricing lander and **D2 (groups and caps) have shipped; D3,
groups in Discord, is next.** D3 needs the Discord portal set up — the steps
are in `docs/discord-setup.md`, and `app.proofsignals.net` is live, so all of
them are unblocked.

**Groups:** `groups` + `group_members` cover feedback groups now and challenge
cohorts from D5. Both tables take **no direct writes** from `anon` or
`authenticated` — the RPCs in `20261017120000` are the only road, and each one
takes an optional `p_acting_user_id` honoured only for the service role, which
is how the bot calls them. A pairing inside a group is a `matches` row with
`in_group_id` set and `source = 'group'`, exempt from monthly quota and from
`max_concurrent_matchups`.

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

## SQL gotchas that have each caused a real bug here

- **`revoke all on function ... from public` is not enough.** Supabase grants
  `EXECUTE` to `anon` and `authenticated` **by name** through default
  privileges, so revoking the `PUBLIC` pseudo-role leaves them. Revoke by role
  name for anything internal, and assert the ACL in the verify script.
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
both sides. `verify-phase20.mjs` and `verify-phase22.mjs` check both rules by
grepping imports — if you need to break one, the honest move is to add a
composition root, not to loosen the check.

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
