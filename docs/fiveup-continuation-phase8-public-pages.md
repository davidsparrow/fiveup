# Continuation Prompt — Phase 8 (cont.): Public Pages 8c–8e

## Why now

The Phase 8 **foundation is built and safe** (see `docs/fiveup-continuation-phase8.md`): 8a is the visibility/publishing data model (private-by-default), 8b is the anon public-read layer (security-definer projection RPCs granted to `anon`, honoring Phase-7 suppression + per-field/paid gating). What's left is the **pages** that render that data to the public — the first dynamic routes in the app. These slices are mostly UI on top of RPCs that already exist; the remaining backend is two small read RPCs (8d, 8e).

Keep the same rhythm: lock the per-slice decisions, then build sub-phase by sub-phase, applying each migration (if any) and running a live verification — including a **real anonymous HTTP fetch** of each new route — before the next.

## What already exists (build on it, don't rebuild)

- **8b anon RPCs (done):** `get_public_profile(username)`, `get_public_feedback(username)`, `get_public_assets(username)`, `get_public_offers(username)` — all `security definer`, granted to `anon`, already AND-ing in `profile_public_enabled` + not-suspended + `moderation_status='ok'`, per-field `show_*` toggles, and paid-plan re-checks. **8c consumes these directly — no new backend.**
- **8a data model (done):** `asset_visibility` (`private|member_only|public`), `assets.public_slug` (citext, auto-assigned on first publish — 8b), `brand_visibility` (`visible|hidden_until_feedback_complete`, modeled, **enforcement deferred to a page**), `public_username`, publishing toggles, `public_feedback_permissions` approval model.
- **App conventions:** server-component routes call `createClient()` (`@/lib/supabase/server`) — for an anonymous visitor this yields an `anon`-role client, which is exactly what the public RPCs expect. Public marketing pages render `PageShell` + a component (`src/components/fivestarz/*`); metadata is a static `export const metadata` (no dynamic `generateMetadata` used yet — 8c introduces it for `noindex`). **No `not-found.jsx`/`error.jsx` exist yet.** `/proof-lab` currently **redirects anon → `/login`** (8e changes that).

## Sub-phases

### 8c — Public profile page `/u/[username]`

First public page. Pure UI over existing 8b RPCs.

- **Route** `src/app/u/[username]/page.jsx` (server component): call `get_public_profile(username)`; empty result → `notFound()` (404). In parallel fetch `get_public_feedback`, `get_public_assets`, `get_public_offers`. Render a new `src/components/fivestarz/PublicProfilePage.jsx`.
- **`generateMetadata`** (async, new pattern): `title` = display name; `robots: { index: <searchable>, follow: <searchable> }` — the `searchable` flag from `get_public_profile` (already gated on the indexing paid feature). Default **noindex**.
- **Modules** (spec §"Public Profile Page Structure"): Hero (name, `@handle`, logo if present, location if present, derived categories), About (bio), Signal/Stats (**neutral wording** — "Trusted by", "Helpful in", counts; **avoid star language** per spec), Public feedback excerpts, Public clips, Public asset highlights (each links to `/a/[slug]`), Offers / services. External links are **out** (deferred in 8b).
- **Error/not-found pages (user request):** add `not-found.jsx` + `error.jsx` with a **centered slot for a silly animation and the error text below it** — build a reusable `src/components/fivestarz/ErrorShell.jsx` (animation placeholder centered, message under) and use it for the public routes (and as the app-wide fallback).

**Decisions to lock:** neutral stat labels + which numbers show (feedback vs proof-lab ratings, counts vs averages); should the owner get a **preview** of their own not-yet-published profile (e.g. `?preview=1` when `auth.uid()` is the owner) or strictly 404 until published; which animation/asset for the error slot (or a placeholder for now).

### 8d — Public asset page `/a/[slug]`

Independent of profile visibility (spec: profile public, one case study public, newest asset private). Needs **one new RPC**.

Draft:
```sql
-- Gate on the ASSET (visibility='public' AND moderation_status='ok') AND owner
-- not suspended — NOT on the owner's profile being public.
create or replace function public.get_public_asset(p_slug citext)
returns table (
  name text, description text, asset_type text, public_slug citext, created_at timestamptz,
  owner_display_name text,   -- null when hidden by brand_visibility / owner profile private
  owner_username citext,     -- link target for /u/[handle], only if owner profile is public
  owner_hidden boolean       -- brand_visibility = hidden_until_feedback_complete
) language sql stable security definer set search_path = public ...
grant execute on function public.get_public_asset(citext) to anon, authenticated;
```
- **Route** `src/app/a/[slug]/page.jsx`; `notFound()` when the slug doesn't resolve to a public, clean asset. `noindex` for now (asset SEO is later).
- **Owner identity** links to `/u/[owner_username]` only when the owner's profile is itself public; otherwise show name without a link (or hidden — see `brand_visibility`).
- **`brand_visibility` enforcement** finally lands here (was modeled in 8a, deferred): when `hidden_until_feedback_complete`, suppress owner identity until "feedback is complete." **"Complete" is the open decision** (e.g. ≥N `feedback_submissions` on the asset, or a per-asset flag).
- **Asset commentary excerpts (optional):** `feedback_submissions.asset_id` ties received feedback to a specific asset — approved items (reuse `public_feedback_permissions`) could render as commentary on the asset page. Decide in-scope vs defer.

**Decisions to lock:** `brand_visibility` "feedback complete" definition (or keep the column dormant and always show identity in 8d); whether approved per-asset commentary excerpts render on the asset page now or later.

### 8e — Public Proof Lab teaser

Marketplace **Phase 1→2** (spec): a public landing that *describes* the marketplace; **individual listings stay member-gated**. Needs **one new aggregate RPC**.

Draft:
```sql
-- Aggregates only — NO listing bodies to anon.
create or replace function public.list_public_proof_lab_teaser()
returns table (category text, active_listing_count integer)
language sql stable security definer set search_path = public
as $$
  select c.label, count(*)::integer
  from public.proof_lab_listings l
  join public.proof_lab_categories c on c.slug = l.category_slug
  where l.status = 'active' and l.moderation_status = 'ok'
  group by c.label order by count(*) desc;
$$;
grant execute on function public.list_public_proof_lab_teaser() to anon, authenticated;
```
Optionally also expose a couple of headline aggregates (total active listings, total pledged from `proof_lab_fundraiser_leaderboard`) — never a listing row.
- **Route:** change `/proof-lab` so an **anon** visitor sees the public teaser (categories + counts + a "sign in to browse deals" CTA) instead of the current redirect-to-login; **authenticated** users still get the full `ProofLabPage`. (Alternative: a separate `/market` public route and keep `/proof-lab` member-only.)

**Decisions to lock:** teaser content (category counts only vs also headline totals/fundraiser); route choice (public teaser at `/proof-lab` vs new `/market`).

## Verification (per slice, live)

- **8c:** real anon `fetch('/u/<handle>')` → 200 with only approved fields; unpublishable (unpublished / suspended / removed / bad handle) → 404; `noindex` present unless searchable; owner preview (if chosen) works; error/not-found pages render the animation shell.
- **8d:** anon `fetch('/a/<slug>')` → 200 for a public clean asset; private/member_only/removed/bad slug → 404; owner-identity link appears only when the owner's profile is public; `brand_visibility` hides identity per the locked rule.
- **8e:** anon sees the teaser aggregates at the chosen route; anon still cannot read any individual listing row (`get`-teaser returns only counts; base-table anon SELECT stays empty); authenticated users still see the full marketplace.

Drive the HTTP checks the same way 8b/7d did: `npm run dev`, then a Node script that fetches routes as anon and (for authed cases) constructs the `@supabase/ssr` session cookie. Also `npm run build` to compile the new dynamic routes + `generateMetadata`.

## Out of scope (record so it isn't assumed)

- **SEO beyond the `noindex` flag** — sitemaps, structured data, selective indexing rollout are later (spec SEO Phase 2/3).
- **Public video hosting/transcoding** — clips remain approved links/embeds.
- **Marketplace transactions / listing bodies to anon** — listings stay member-gated through Phase 8.
- **Username/slug changes, vanity redirects** — claim-once stands.
- **External links on the public profile** — deferred in 8b; needs its own model.

## Decisions to lock before building (summary)

1. **8c:** stat labels + which numbers; owner preview of unpublished profile (yes/no); error-slot animation (real asset vs placeholder).
2. **8d:** `brand_visibility` "feedback complete" definition (or keep dormant, always show identity); per-asset commentary excerpts now vs later.
3. **8e:** teaser content depth; route (`/proof-lab` public teaser vs new `/market`).

*(When ready to build 8c, confirm the 8c decisions — same Q&A pass — then proceed slice by slice, verifying each with a real anon HTTP fetch before the next.)*
