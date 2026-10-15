# fiveup / ProofSignals

Next.js 16 + React 19 + Supabase (SSR client, RLS on every table, logic in
security-definer RPCs), Resend for email, deployed on Vercel. Brand is
**ProofSignals**; `fiveup` / `fivestarz` are the old names still in paths.

## Start here

**`docs/fiveup-continuation-phase19.md` is the current handoff.** It carries
what last shipped, what is unfinished, the locked decisions, the schema
constraints that bite, and the open commercial track. Read it before planning
anything. Earlier phases have their own `docs/fiveup-continuation-phaseNN.md`.

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

## House rule

The platform never raises online reviews — it does not ask for them, suggest
them, compare channels, or reward them. Members may *report* that one
happened. Phase 19 removed the feature that broke this rule; don't
reintroduce it.
