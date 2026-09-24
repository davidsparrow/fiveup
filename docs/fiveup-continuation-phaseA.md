# Continuation Prompt — Phase A: shelve and switch (Discord refactor)

First phase of the Discord-backed matching / points / Skool refactor
(plan: `docs/REFACTOR-PLAN.md.pdf`, operating contract: `docs/HANDOFF.md.pdf`).
Goal: the web matching surface is archived behind one gate, the marketplace
is renamed, and flipping the gate back to `web` restores everything.

Built on branch `claude/proofsignals-discord-skool-refactor-4uqssh` (the
session's assigned branch; the handoff's `phase-a-shelve-and-switch` name
was not available to this session). Tag `pre-discord-refactor` marks `main`
at `4da1627`, the last commit before any refactor work.

## Migration

`supabase/migrations/20260925120000_phaseA_match_surface_gate.sql`
(idempotent, no drops, no member data touched):

- **Gate row** — `plan_feature_gates` feature `match_surface` seeded for
  sprout / bloom / flourish with `config = {"surface":"discord"}`.
  Seeded with `on conflict do nothing` (not `do update`) so a replay can
  never revert an admin's flip to `web`.
- **`match_surface()`** — stable security-definer reader; caller's plan's
  `config.surface`, anon reads the sprout row, anything missing or unknown
  → `'web'`. Granted to `anon, authenticated`.
- **`create_match` / `eligible_match_candidates`** — same bodies as
  `20260826120000_phase14…` with a first-line guard:
  `match_surface() = 'web' or auth.role() = 'service_role' or is_admin()`,
  else `raise exception 'matching is handled in Discord'`.
- **`matches.source`** — the initial schema had an inline CHECK
  (`auto | browse | queued`), so "free text" was not quite true. The
  constraint is recreated to also allow `discord` and the convention is
  documented in the header and a column comment. `create_match`'s own
  member-input check (`browse | queued`) is unchanged.

## App changes

- **Archive** (`src/archive/web-matching/`): `BrowsePage.jsx` and
  `MatchPreferencesPage.jsx` moved unchanged (`git mv`); `MatchActions.jsx`
  extracted from the dashboard — the "+ Browse Members" button and the web
  empty-state copy. Imported only by the three gated routes.
- **Gated routes** — `src/app/browse/page.jsx` and
  `src/app/account/preferences/page.jsx` call `resolveMatchSurface()` first
  and `redirect(getDiscordInviteUrl())` unless the surface is `web`; on
  `web` they render the archived component exactly as before. No 404s.
  `src/app/dashboard/page.jsx` resolves the surface and passes
  `<MatchActions />` into `DashboardPage` only on `web`.
- **`src/lib/fivestarz/match-surface.js`** (server helper) —
  `resolveMatchSurface(supabase)` (fails open to `web` if the RPC errors)
  and `getDiscordInviteUrl()` (`NEXT_PUBLIC_DISCORD_INVITE_URL`, fallback
  `/dashboard`).
- **`data.js`** — `getMatchSurface()` added; `getBrowseQuota`,
  `getEligibleCandidates`, `requestMatch` kept with the `// ARCHIVED`
  comment.
- **Dashboard** — the Matches tab keeps the read-only history, feedback
  modal, post-request modal and star ratings on every surface (Discord
  matches use that flow). On `discord` it shows a teal notice and a
  "Match in Discord →" button when the invite URL is configured.
- **Nav / footer** — `PageShell` resolves the surface once client-side and
  exposes `useMatchSurface()`; `SiteNav` and `Footer` hide "Browse Members"
  unless it is `web`.
- **Proof Market rename** — `src/app/proof-lab/` → `src/app/proof-market/`;
  `src/app/proof-lab/page.jsx` is a `permanentRedirect("/proof-market")`.
  `ProofLabPage.jsx` → `ProofMarketPage.jsx`, `ProofLabTeaser.jsx` →
  `ProofMarketTeaser.jsx`. Every user-facing "Proof Lab" string in
  `src/components`, `src/app`, `src/lib` (nav, footer, dashboard tab,
  home page, demo tour, public profile, plan features, sitemap, page title,
  moderation-email labels, notify-seller subject/header/comments) is now
  "Proof Market". Tables, enums, RPCs, `proof_lab_*` identifiers, data.js
  function names and the internal API route `src/app/api/proof-lab/` are
  unchanged. `verify-phase16.mjs` updated for the label change.
- **Email sender** — `from:` in `notify-seller/route.js`,
  `moderation-email.js` and `beta-signup/route.js` is now
  `process.env.RESEND_FROM ?? "ProofSignals <noreply@notify.indieops.co>"`.
  `.env.example` added (and un-ignored in `.gitignore`) documenting
  `RESEND_FROM`, `NEXT_PUBLIC_DISCORD_INVITE_URL` and the existing vars.

## Manual steps for Robbie (not doable from the build environment)

1. **Resend / DNS** — add domain `notify.indieops.co` in Resend; at
   SiteGround DNS Zone Editor add the DKIM TXT (`resend._domainkey.notify`),
   SPF TXT (`notify` → `v=spf1 include:amazonses.com ~all`), the MX Resend
   shows for `notify`, and DMARC TXT (`_dmarc.notify` →
   `v=DMARC1; p=none; rua=mailto:dmarc@indieops.co`). Click Verify.
2. **Vercel env** — add `RESEND_FROM` (production) and
   `NEXT_PUBLIC_DISCORD_INVITE_URL` (all environments). `RESEND_API_KEY`
   stays production-only.
3. **Send one test of each email type** from production and paste the
   headers (DKIM pass) in the PR.
4. **Restore test** — on a Vercel preview with the migration applied, run
   `update public.plan_feature_gates set config = '{"surface":"web"}'
   where feature_key = 'match_surface';`, confirm `/browse`,
   `/account/preferences`, the dashboard button and the nav link come back
   end to end, then flip back to `discord`. Record the result in
   `docs/archive/web-matching.md` and the PR.

## Verify

`node verify-phaseA.mjs` (no DB, no dev server): redirect + rename
completeness, archive import discipline, ARCHIVED markers, migration seed /
guard placement / `matches.source` convention, gated-route wiring, nav and
footer gating, email-sender move, docs present. `node verify-phase16.mjs`
still passes. `npm run lint` and `npm run build` pass.

## Decisions I made (veto at review)

- **Branch name** — built on the session's assigned branch instead of
  `phase-a-shelve-and-switch`; the tag is exactly as specified.
- **Dashboard extraction scope** — the dashboard never had "request /
  accept" actions (matches are created by `create_match` from Browse), and
  its feedback modal must stay live for Discord-sourced matches, so
  `MatchActions.jsx` holds only the Browse entry point and empty-state copy.
- **`matches.source` CHECK** — widened to include `discord` now (the
  handoff assumed free text). Without it Phase C/D inserts would fail.
- **`match_surface()` for anonymous callers** reads the sprout row rather
  than returning `web`, so the public nav hides "Browse Members" too.
  `enabled` on the gate row is ignored; only `config.surface` matters.
- **Seed uses `on conflict do nothing`** so migration replays never undo a
  flip. Other seeds in the repo use `do update`; this one deliberately
  differs.
- **Footer** also hides "Browse Members" (handoff named SiteNav only).
- **`beta-signup/route.js`** sender moved too (handoff listed two files;
  there were three hard-coded senders). The email HTML brand marks
  ("fivestarz") were left alone — only the `from:` display name changed.
- **API route path kept** at `src/app/api/proof-lab/notify-seller` (the
  handoff offered either).
- **Internal component / function names** that mirror table names
  (`ProofLabListingsTab`, `listProofLabListings`, `PROOF_LAB_TIMEFRAMES`,
  tab id `prooflab`) were not renamed; only the two page components and
  user-facing strings were.
- **Discord invite fallback** is `/dashboard` when the env var is unset,
  where the Matches tab shows the "matching happens in Discord" notice
  without a join button.
- **Dashboard header stats** (`4/12 Matches`, `2/6 Browse`) are pre-existing
  mock values and were left as-is.

## Out of scope

- Phase B (points ledger, queue, profile block) and everything after.
- A service-role writer for Discord matches — the guard admits the service
  role, but `create_match` still requires `auth.uid()`; Phase C/D adds the
  bot's own RPC.
- `NAV_LINKS` in `theme.js` (unused table) only had its label/href renamed.
- Renaming demo screenshot files under `public/demo/prooflab-*.jpg`.
- Old phase docs under `docs/` still say "Proof Lab" (historical record).

## Open questions carried forward (handoff Section 5)

Q1 Discord identity (blocks Phase C), Q2 Skool identity, Q3 proof
strictness, Q4 flourish → paid Skool flow, Q5 catalog additions, Q6
redemption catalog. None were needed for Phase A.
