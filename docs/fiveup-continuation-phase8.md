# Continuation Prompt — Phase 8: Public Surfaces (foundation first)

## Why now

Phase 7 made the *authenticated* surfaces safe (blocklist, reporting, moderation actions, removed-content hiding, suspension). Phase 8 opens FiveStarz/ProofSignals to the **public** — the spec's "private by default, public by choice" model (`docs/ProofSignals-Specs/02-public-private-profile-architecture.md`): optional public profiles (`/u/[username]`), optional public asset pages (`/a/[slug]`), and a public Proof Lab teaser.

**Build the foundation before any public page ships.** The dangerous part of Phase 8 is not the pages — it's letting an *unauthenticated* visitor read the database at all. Today there is **zero anon-role support**: `profiles_select_authenticated` is `using (true)` for authenticated only, `assets` visibility is a binary owner-vs-`active` model with no `member_only`/`public` tiering, and there are **no `anon` policies anywhere** (confirmed: 0). So Phase 8 starts with the data model + the public-read layer, and only then renders pages on top. Scope it tight and correct — this is a privacy boundary, not a growth feature.

This doc details the **foundation** (8a data model, 8b public-read layer) as the buildable-now anchor and sketches the public pages (8c–8e) that sit on top. Same rhythm as Phase 7: lock decisions, then build sub-phase by sub-phase, applying each migration and running its live verification before the next.

## What already exists (build on it, don't rebuild)

- **Phase 7 safety columns** — `user_profiles.account_status` (`active|warned|suspended`) and `moderation_status` (`ok|removed`) on all six content tables. **Every public-read path must AND these in** (never expose a suspended owner's or a `removed` row's content). This is the "extend removed-content hiding to anon" the Phase 7 doc explicitly deferred here.
- **RPC-first, security-definer conventions** — every write goes through a `security definer` RPC with `revoke all from public` + `grant execute to authenticated`; admin/mod reads use definer RPCs that return curated projections (`list_moderation_queue` is the template). Public reads should follow the **same pattern for `anon`**.
- **`is_moderator()` / `is_admin()`**, idempotent-migration conventions (DO-block enum guards, `if not exists`, `drop policy if exists`), and the `verify-phaseX.mjs` service-role harness (now also drivable over real HTTP as an anon fetch — see 8c).
- **Existing routes** — public marketing pages (`/`, `/pricing`, `/community`, `/safety`), member app at flat routes (`/dashboard`, `/browse`, `/proof-lab`, `/assets/new`, `/account`). No dynamic route segments exist yet; `/u/[username]` and `/a/[slug]` are net-new.

## Core architectural decision (read first)

**How does an anonymous visitor read public data — raw `anon` table RLS, or security-definer public RPCs returning a curated projection?**

Recommend **security-definer public RPCs granted to `anon`**, *not* broad `anon` SELECT policies on the base tables. RLS is row-level: an `anon` SELECT policy on `user_profiles` exposes **every column** of any matching row (internal ratings, location, plan, etc.), and the spec is emphatic that public profiles must expose **only user-approved fields** with per-field toggles (`show_logo`, `show_feedback_excerpts`, `show_stats`, …). A definer RPC (`get_public_profile(username)`) returns exactly the approved projection and nothing else — the same shape as `list_moderation_queue`. Keep `anon` out of the base tables entirely; the public surface is a small, auditable set of RPCs. (Alternative — thin `anon` RLS + a `public_*` view — is recorded under decisions.)

## Sub-phases (each independently shippable + verifiable)

### 8a — Visibility & publishing data model (no public exposure yet)

Adds the columns the public layer will read; ships **private/off by default**, so nothing becomes visible until a member opts in. No `anon` access in this sub-phase.

Draft schema:
```sql
-- Asset audience, distinct from assets.status (which is workflow state).
create type public.asset_visibility as enum ('private', 'member_only', 'public');
alter table public.assets
  add column visibility public.asset_visibility not null default 'member_only';
-- Backfill: today "active" ≈ visible to all authenticated ⇒ map active→member_only,
-- everything else→private. Public is never granted by a migration — only by the owner.

-- Per-profile publishing controls (PRD §15), all default false/off.
alter table public.user_profiles
  add column public_username citext unique,            -- claimed handle for /u/[username]
  add column profile_public_enabled boolean not null default false,
  add column searchable_public_profile boolean not null default false, -- SEO stays off (noindex) until true
  add column show_logo boolean not null default false,
  add column show_feedback_excerpts boolean not null default false,
  add column show_public_videos boolean not null default false,
  add column show_marketplace_offers boolean not null default false,
  add column show_stats boolean not null default false;
```
RPCs (member-facing, `authenticated`, security-definer, with `assert_active_caller()`):
- `claim_public_username(p_username)` — validate charset/length, enforce uniqueness (citext), one per user.
- `update_publishing_settings(...)` — toggle the publishing booleans + set `visibility` per asset via a companion `set_asset_visibility(p_asset_id, p_visibility)`.

**Decisions to resolve:** asset default (`member_only` vs `private`); username charset/reserved-words; whether `brand_visibility` (`visible | hidden_until_feedback_complete`, a paid feature) is modeled now or deferred.
--->Model Now


### 8b — Public-read layer (`anon`-callable RPCs) + approval model

The security boundary. Security-definer RPCs granted to `anon` that return **only** approved public fields, and only when the owner is publishable and not suppressed by Phase 7:

```sql
-- Gate every public read on: profile_public_enabled AND account_status <> 'suspended'
-- AND user_profiles.moderation_status = 'ok'.  Assets additionally require
-- visibility = 'public' AND the asset's moderation_status = 'ok'.
create or replace function public.get_public_profile(p_username citext)
returns table (display_name text, bio text, avatar_url text, /* stats only if show_stats */ ...)
language plpgsql security definer set search_path = public ...
grant execute on function public.get_public_profile(citext) to anon, authenticated;
```
- `get_public_profile(username)` — hero/about/known-for/stats, each field blanked unless its toggle is on.
- `get_public_asset(slug)` — public asset page projection (title, description, category, approved excerpts/clips), `visibility='public'` only.
- `list_public_proof_lab_teaser(...)` — Phase-1 marketplace: a public *landing* projection (counts/categories), **listings stay member-gated**.
- **Approval model** for feedback excerpts: a `public_feedback_permissions` table — written feedback can appear on a public profile **only with recipient approval**; video defaults private. `get_public_profile` reads excerpts only through approved rows.

Keep `anon` out of base tables (no `to anon` table policies). Everything anon sees goes through these RPCs.

**Decisions to resolve:** exact public-profile field set + which hide behind `show_*`; asset public slug source (`public_username` + asset slug vs global slug); whether excerpt-approval ships in 8b or is stubbed.
--->Please help me field sets to hide personal detail unless user chooses to show them under paid plan?)

### 8c — Public profile page `/u/[username]`

First public page. A server component that calls `get_public_profile` with the **anon** client (no session), `notFound()` when unpublishable, `noindex` unless `searchable_public_profile`. Spec modules: Hero, About/expertise, Known for, Helpful in, Public feedback excerpts, Public clips, Selected assets, Services/offers, external links. Verify includes a **real anon HTTP fetch** of `/u/[username]` (published → 200 with only approved fields; unpublished/suspended/removed → 404).
--->Please make all "error pages" have room for silly animation in middle of page, with the Error text below.

### 8d — Public asset page `/a/[slug]`

`get_public_asset` projection; only `visibility='public'` + `moderation_status='ok'` assets resolve; same anon-fetch verification.

### 8e — Public Proof Lab teaser

`/proof-lab` (or `/market`) gains a public landing (describe the marketplace, categories, aggregate signal) while **listings remain member-only** (spec marketplace Phase 1→2). No listing bodies to anon.

## Verification (per sub-phase, live)

- **8a:** defaults are private/off on new users + assets; backfill mapped existing `active`→`member_only`; `claim_public_username` enforces uniqueness; publishing toggles + `set_asset_visibility` persist; suspended caller blocked (Phase 7 standing check).
- **8b:** anon RPC returns a published profile's approved fields only; a `show_*`-off field is blanked; unpublished / suspended-owner / `moderation_status='removed'` all return nothing to anon; assets require `visibility='public'`; unapproved feedback excerpt never surfaces.
- **8c/8d:** anon `fetch('/u/..')` / `/a/..` — published 200 (approved fields only, correct `noindex`), unpublishable 404; authenticated owner preview still works.
- **8e:** anon sees the teaser; anon cannot read any listing row.

## Out of scope (record so it isn't assumed)

- **Search indexing / SEO** — `noindex` by default; selective indexing is a later phase (spec SEO Phase 2/3).
- **Public video hosting/transcoding** — clips are approved links/embeds only; no media pipeline here.
- **Hide-identity-until-feedback-complete** (`brand_visibility`, paid) — model the column if cheap, but the enforcement flow is later.
- **Username changes / vanity redirects / reserved-name auctions** — claim-once for now.
- **Public marketplace transactions** — listings stay member-gated through Phase 8; public offers are a later marketplace phase.

## Decisions to lock before building (summary)

1. Public-read mechanism: **security-definer `anon` RPCs** (rec) vs raw `anon` table RLS + view.
2. Asset default visibility: `member_only` (rec) vs `private`; and the existing-asset backfill mapping (`active`→`member_only`).
3. Public handle: dedicated claimed `public_username` (rec) vs opaque id-based slug; charset + reserved words.
4. Feedback-excerpt approval: ship the approval model in 8b (rec) vs stub excerpts off until a later pass.
5. `brand_visibility` (hide-until-complete): model now vs defer.
6. Field-level public projection: exact `get_public_profile` columns and which sit behind each `show_*` toggle.

*(When ready to build 8a, confirm these — same "make it solid" Q&A pass used for Phases 6–7 — then proceed sub-phase by sub-phase.)*
