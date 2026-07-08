# Continuation Prompt — Phase 9: Enrich & surface the public pages

## Why now

Phase 8 shipped the public surface **safely**: a private-by-default data model (8a), an anon read layer of security-definer projection RPCs (8b), and the first public pages — profile `/u/[username]` (8c), asset `/a/[slug]` (8d), and the Proof Lab teaser at `/proof-lab` (8e). Every public read already ANDs in Phase-7 suppression and returns only approved fields.

Phase 9 makes those pages **richer and discoverable** without widening the privacy boundary:

- **9a — Per-asset commentary** on `/a/[slug]` (approved feedback tied to the specific asset).
- **9b — External profile links** on `/u/[username]` (owner-added website/social links).
- **9c — SEO rollout** (sitemap, robots, structured data, OG cards) built on the existing `noindex`/`searchable` flag.

Same rhythm as Phase 8: lock the per-slice decisions, then build sub-phase by sub-phase, applying each migration and running a live verification — including a **real anonymous HTTP fetch** — before the next. **Not in Phase 9:** `brand_visibility` enforcement stays dormant (it always shows identity, as in 8d).

## What already exists (build on it, don't rebuild)

- **8b/8d anon RPCs & model.** `get_public_profile` / `get_public_feedback` / `get_public_assets` / `get_public_offers` / `get_public_asset` — all `security definer`, granted `anon`, gating on `profile_public_enabled` (or asset `visibility='public'`) + owner not suspended + `moderation_status='ok'`, with per-field toggles and paid re-checks.
- **`public_feedback_permissions`** (`owner_user_id`, `source_type`, `source_id`, `approved`) — per-item approval by the recipient. `feedback_submissions.asset_id` ties each received feedback to a specific asset. **9a reuses this — no new approval surface.**
- **`show_external_links`** boolean already exists on `user_profiles` (added in 8a, default false) and is already accepted by `update_publishing_settings`. **9b only needs the links table + write RPCs + an anon projection + rendering — the toggle is done.**
- **`searchable_public_profile`** + the `public_profile_indexing_enabled` paid feature already gate a per-profile `searchable` flag (returned by `get_public_profile`). `/u/[username]` already flips `robots: index/noindex` off it. **9c consumes this for the sitemap + selective indexing.**
- **App conventions.** Public routes are server components calling `createClient()` (anon for visitors); pages render `PageShell` + a `src/components/fivestarz/*` component; `generateMetadata` is used on the public dynamic routes. No `robots.*`/`sitemap.*`/OG-image routes exist yet — 9c introduces them.

## Sub-phases

### 9a — Per-asset commentary on `/a/[slug]`

Extends 8d. One new anon read RPC; a commentary section on the asset page.

Draft:
```sql
-- Approved written feedback tied to THIS asset. Same asset-publishability gate
-- as get_public_asset (asset public + clean, owner not suspended/removed), AND
-- reuse the recipient's per-item approval (public_feedback_permissions) + the
-- row's own moderation_status. Reviewer stays anonymous (no reviewer identity),
-- matching get_public_feedback.
create or replace function public.get_public_asset_feedback(p_slug citext)
returns table (body text, stars smallint, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select fs.written_feedback, fs.stars::smallint, fs.submitted_at
  from public.assets a
  join public.user_profiles up on up.user_id = a.owner_user_id
  join public.feedback_submissions fs on fs.asset_id = a.id and fs.reviewee_user_id = a.owner_user_id
  join public.public_feedback_permissions pp
    on pp.source_type = 'match_feedback' and pp.source_id = fs.id and pp.approved
  where a.public_slug = p_slug
    and a.visibility = 'public' and a.moderation_status = 'ok'
    and up.account_status <> 'suspended' and up.moderation_status = 'ok'
    and fs.moderation_status = 'ok'
    and nullif(btrim(coalesce(fs.written_feedback, '')), '') is not null
  order by fs.submitted_at desc;
$$;
grant execute on function public.get_public_asset_feedback(citext) to anon, authenticated;
```
- **Route** `/a/[slug]/page.jsx`: fetch commentary in parallel with the asset; pass to `PublicAssetPage`, which renders a "What people said" section (empty → omit).

**Decisions to lock:** show stars on asset commentary (consistent with the profile excerpts, which show stars) vs text-only; reviewer strictly anonymous vs a coarse label; cap/paginate count vs show all approved.

### 9b — External profile links on `/u/[username]`

New table + owner write RPCs + an anon projection; render behind the existing `show_external_links` toggle.

Draft:
```sql
create table if not exists public.profile_external_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  url text not null,
  label text,
  sort_order integer not null default 0,
  moderation_status text not null default 'ok' check (moderation_status in ('ok','removed')),
  created_at timestamptz not null default now()
  -- constraint: https-only + length enforced in the write RPC
);
-- RLS: owner-only read/write via RPCs; NO anon table policy.
-- Owner writes (authenticated, security-definer, assert_active_caller):
--   add_external_link(p_url, p_label) — validate https + length + per-user cap
--   remove_external_link(p_id)
--   reorder_external_links(p_ids uuid[])   -- optional
-- Anon projection (security-definer, granted anon), gated on the same
-- profile-publishability as get_public_profile AND show_external_links AND
-- moderation_status='ok':
create or replace function public.get_public_links(p_username citext)
returns table (url text, label text)
language sql stable security definer set search_path = public ...;
```
- **Render** on `PublicProfilePage`: a links row/section; every anchor `rel="nofollow noopener noreferrer"`, `target="_blank"`. Only when the profile is public and `show_external_links` is on.
- **Moderation:** links get a `moderation_status` so Phase-7 can remove them; the projection ANDs `='ok'`.

**Decisions to lock:** freeform URL+label vs enumerated platforms (with icons); per-user cap (e.g. 5); free vs paid-gated feature; validation (https-only; any domain allow/deny list); whether removed links also need a report/moderation entry point now or later.

### 9c — SEO rollout

Built on the existing `searchable` flag. No new privacy surface — only *searchable* profiles are ever exposed to crawlers.

- **`app/robots.js`** — allow crawling, disallow member/app routes (`/dashboard`, `/account`, `/assets`, `/browse`, `/admin`, auth), point at the sitemap.
- **`app/sitemap.js`** — list only indexable public profiles. Needs a small anon RPC `list_searchable_profiles()` returning `(public_username, updated_at)` for `profile_public_enabled AND searchable_public_profile AND indexing paid-feature AND not suppressed`. Asset pages: **decision** — keep `noindex` (stay out of sitemap) or start indexing public assets.
- **Structured data (JSON-LD)** — `Person`/`Organization` on profiles, `CreativeWork` on assets (only when indexable), injected as a `<script type="application/ld+json">`.
- **OpenGraph / Twitter cards** — extend `generateMetadata` with `openGraph`/`twitter`. **Decision:** static default share image vs per-page dynamic OG image (`next/og` `ImageResponse` at `app/u/[username]/opengraph-image.jsx`).
- **Canonical URLs** — `alternates.canonical` in `generateMetadata`.

**Decisions to lock:** sitemap scope (profiles only vs also public assets; flip assets to indexable?); OG images (static vs dynamic `ImageResponse`); which JSON-LD types; canonical host (env-driven base URL — confirm the production domain).

**Locked (9c build):** searchable **profiles only** in the sitemap; asset pages stay `noindex`. OG images are **dynamic per-page** (`next/og`). Base URL via `NEXT_PUBLIC_SITE_URL` + `metadataBase`.

> **Future enhancement (deferred):** make public **asset pages** indexable too — flip `/a/[slug]` from `noindex` to indexable and add them to the sitemap (needs an asset-listing RPC + a per-asset indexable signal). Do this if users ask for their public case studies to be search-discoverable. The asset SEO plumbing (canonical + OG image) already ships in 9c, so this is mostly a robots/sitemap flip later.

## Verification (per slice, live)

- **9a:** anon `fetch('/a/<slug>')` shows only approved, clean commentary for *that* asset; unapproved / moderation-removed / other-asset feedback never appears; suspended/removed owner still 404s the whole page.
- **9b:** owner add/remove/reorder works and enforces https + cap; anon `get_public_links` returns links only when the profile is public AND `show_external_links` on AND link `moderation_status='ok'`; anchors carry `rel="nofollow noopener noreferrer"`; anon base-table SELECT on `profile_external_links` stays empty.
- **9c:** `fetch('/robots.txt')` and `fetch('/sitemap.xml')` return valid docs; the sitemap lists a searchable profile and **omits** a non-searchable one; JSON-LD parses; OG tags present; member/app routes are disallowed.

Drive HTTP checks as Phase 8 did: `PORT=3210 npm run dev`, then a Node harness fetching routes as anon (and, where needed, an authed `@supabase/ssr` cookie). `npm run build` to compile new routes/metadata. Migrations authored idempotently and applied live via the Supabase Management API.

## Out of scope (record so it isn't assumed)

- **`brand_visibility` enforcement** — stays dormant (always show identity), as in 8d.
- **Public video hosting/transcoding** — clips remain approved links/embeds.
- **Marketplace transactions / listing bodies to anon** — listings stay member-gated.
- **Username/slug changes, vanity redirects** — claim-once stands.
- **Rich link unfurling / oEmbed** for external links — plain anchors only in 9b.

## Follow-up (flagged, not yet scheduled)

- **Member publishing-settings UI.** Phase 8/9 built the public-profile publishing **backend** but no member-facing UI drives it: `claim_public_username`, `update_publishing_settings` (toggles incl. `show_external_links`), `set_asset_visibility`, `approve_public_feedback`, and 9b's `add_/remove_/reorder_external_link` are all reachable only programmatically. `src/app/account/page.jsx` wires none of them. A settings page (start at `/account`) is needed before members can actually publish. Flagged during 9b.

## Decisions to lock before building (summary)

1. **9a:** stars vs text-only; anonymous reviewer; cap/paginate vs show all.
2. **9b:** freeform vs enumerated platforms; per-user cap; free vs paid; validation rules; moderation/report entry point now vs later.
3. **9c:** sitemap scope + whether to index assets; OG images static vs dynamic; JSON-LD types; production canonical host.

*(When ready to build a slice, confirm its decisions — same Q&A pass — then proceed, verifying each with a real anon HTTP fetch before the next.)*
