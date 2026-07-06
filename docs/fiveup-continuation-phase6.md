# Continuation Prompt — Phase 6: Proof Lab (Marketplace) Real Backend

## Context

Phases 1–5 wired asset creation, browse/matching, feedback, ratings, review-post requests, semi-duplicate re-match, and screenshot upload to the real Supabase backend (`src/lib/fivestarz/data.js` → real tables/RPCs in `supabase/migrations/`), each verified end-to-end against the live project with temporary test users.

The **Proof Lab** (the members-only marketplace at `/proof-lab`) is the last major surface still running entirely on client-side mock data. Today:

- `src/lib/fivestarz/mock-data.js` holds `PROOF_LISTINGS` (22 hard-coded marketplace cards), `ME_PROOF_LISTINGS` (3 hard-coded "my listings"), and `PROOF_CATS` (16 category labels). None are backed by a table.
- `src/components/fivestarz/ProofLabPage.jsx` renders `PROOF_LISTINGS`, filters by category client-side, and its "Request This Deal" modal `POST`s to `/api/beta-signup` (a generic Resend email to the admin) — it does **not** reach the actual seller and creates no record.
- `src/components/fivestarz/DashboardPage.jsx` → `ProofLabListingsTab` renders `ME_PROOF_LISTINGS`; **Edit / Activate / De-activate / Add New Listing are all no-ops**, and the plan limit is hard-coded to `3` (`planLimit = 3`).
- The only backend that exists is the feature flag `proof_lab_listings_enabled` in `plan_feature_gates` (seeded `sprout=false`, `bloom=true`, `flourish=true`, `limit_int=null`) from `supabase/migrations/20260308110000_add_proof_lab_listing_gate.sql`. There is **no listings table, no deal-request table, no category table, and no per-plan listing-count limit**.

This phase builds the real data model + RPCs behind that mock, mirroring the patterns already proven in Phases 1–5 (`create_asset`/`create_match`: `security definer` RPCs that enforce `plan_feature_gates`, plus RLS-protected reads). **Payments are intentionally deferred to Phase 6b** — the 6a data model is designed so Stripe slots in without reshaping it.

Everything else (public profile pages, Trust & Safety moderation, video/Mux feedback, AI Asset Builder) remains out of scope — see the roadmap at the bottom.

---

## Phase 6a — Proof Lab data model, RPCs, and read/write wiring (no payments)

### New migration (`supabase/migrations/<timestamp>_proof_lab_backend.sql`) — first draft, verify against current schema before applying

```sql
-- 1. Category lookup (seeded from PROOF_CATS minus "All"). A table (not an enum)
--    so categories can be extended without a type migration.
create table public.proof_lab_categories (
  slug text primary key,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 2. Deal-request lifecycle + timeframe enums
create type public.proof_lab_timeframe as enum ('asap', 'soon', 'no_rush');
create type public.proof_lab_request_status as enum ('pending', 'accepted', 'declined', 'fulfilled', 'cancelled');

-- 3. Listings
create table public.proof_lab_listings (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null, -- optional "proof" tie-in
  title text not null,
  description text not null,
  category_slug text not null references public.proof_lab_categories(slug),
  retail_price_cents integer check (retail_price_cents is null or retail_price_cents >= 0),
  member_price_cents integer check (member_price_cents is null or member_price_cents >= 0),
  price_unit text,                       -- e.g. "per session", "per audit"
  badge text,                            -- free-text emoji badge, optional
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_proof_lab_listings_seller on public.proof_lab_listings (seller_user_id);
create index idx_proof_lab_listings_status on public.proof_lab_listings (status);
create index idx_proof_lab_listings_category on public.proof_lab_listings (category_slug);

-- 4. Deal requests (members-only, so requester is always an authenticated user)
create table public.proof_lab_deal_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.proof_lab_listings(id) on delete cascade,
  requester_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  seller_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  requester_email text not null,
  note text,
  timeframe public.proof_lab_timeframe not null default 'soon',
  status public.proof_lab_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_user_id <> seller_user_id)
);

create index idx_proof_lab_deal_requests_seller on public.proof_lab_deal_requests (seller_user_id);
create index idx_proof_lab_deal_requests_requester on public.proof_lab_deal_requests (requester_user_id);

-- 5. updated_at triggers (set_updated_at() already exists)
create trigger trg_proof_lab_listings_set_updated_at
before update on public.proof_lab_listings
for each row execute function public.set_updated_at();

create trigger trg_proof_lab_deal_requests_set_updated_at
before update on public.proof_lab_deal_requests
for each row execute function public.set_updated_at();

-- 6. Per-plan active-listing cap (proof_lab_listings_enabled already seeded).
--    Mock UI hard-codes 3 for Bloom; make it a real gate. Verify these numbers
--    against product intent before shipping.
insert into public.plan_feature_gates (plan_code, feature_key, enabled, limit_int, description, config)
values
  ('sprout',   'max_proof_lab_listings', false, 0,  'Max active Proof Lab listings', '{}'::jsonb),
  ('bloom',    'max_proof_lab_listings', true,  3,  'Max active Proof Lab listings', '{}'::jsonb),
  ('flourish', 'max_proof_lab_listings', true,  10, 'Max active Proof Lab listings', '{}'::jsonb)
on conflict (plan_code, feature_key) do update set
  enabled = excluded.enabled, limit_int = excluded.limit_int,
  description = excluded.description, config = excluded.config, updated_at = now();

-- 7. Seed categories from PROOF_CATS (drop "All"; it's a UI-only filter)
insert into public.proof_lab_categories (slug, label, sort_order) values
  ('copywriting','Copywriting',10),
  ('ux_design','UX Design',20),
  ('branding','Branding',30),
  ('seo','SEO',40),
  ('pitch_coaching','Pitch Coaching',50),
  ('photography','Photography',60),
  ('video_production','Video Production',70),
  ('video_shorts','Video Shorts',80),
  ('linkedin_ads','LinkedIn Ads',90),
  ('facebook_ads','Facebook Ads',100),
  ('google_ads','Google Ads',110),
  ('web_design','Web Design',120),
  ('automation','Automation',130),
  ('email_marketing','Email Marketing',140),
  ('notion_tools','Notion / Tools',150)
on conflict (slug) do nothing;

-- 8. RLS
alter table public.proof_lab_categories enable row level security;
alter table public.proof_lab_listings enable row level security;
alter table public.proof_lab_deal_requests enable row level security;

create policy "proof_lab_categories_select_all"
on public.proof_lab_categories for select to authenticated using (true);

-- Active listings visible to all members; sellers see their own in any status.
create policy "proof_lab_listings_select_visible"
on public.proof_lab_listings for select to authenticated
using (status = 'active' or seller_user_id = auth.uid());

-- Direct writes limited to the owner; create/activate quota lives in the RPCs.
create policy "proof_lab_listings_write_owner"
on public.proof_lab_listings for all to authenticated
using (seller_user_id = auth.uid())
with check (seller_user_id = auth.uid());

-- Deal requests: requester and seller can read; requester can insert its own.
create policy "proof_lab_deal_requests_select_participants"
on public.proof_lab_deal_requests for select to authenticated
using (requester_user_id = auth.uid() or seller_user_id = auth.uid());

create policy "proof_lab_deal_requests_seller_update"
on public.proof_lab_deal_requests for update to authenticated
using (seller_user_id = auth.uid()) with check (seller_user_id = auth.uid());
```

### RPCs (same migration or a second file) — first draft

```sql
-- Enforces proof_lab_listings_enabled + max_proof_lab_listings (active count),
-- mirrors create_asset. Optional asset_id must be owned by the caller.
create or replace function public.create_proof_lab_listing(
  p_title text,
  p_description text,
  p_category_slug text,
  p_retail_price_cents integer default null,
  p_member_price_cents integer default null,
  p_price_unit text default null,
  p_badge text default null,
  p_asset_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plan_code;
  v_max integer;
  v_active_count integer;
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select plan_code into v_plan from public.user_profiles where user_id = v_uid;

  if not public.plan_feature_enabled(v_plan, 'proof_lab_listings_enabled') then
    raise exception 'your plan does not include Proof Lab listings';
  end if;

  if not exists (select 1 from public.proof_lab_categories where slug = p_category_slug) then
    raise exception 'unknown category';
  end if;

  if p_asset_id is not null and not exists (
    select 1 from public.assets where id = p_asset_id and owner_user_id = v_uid
  ) then
    raise exception 'linked asset must be one you own';
  end if;

  select count(*) into v_active_count
  from public.proof_lab_listings
  where seller_user_id = v_uid and status = 'active';

  v_max := public.plan_feature_limit(v_plan, 'max_proof_lab_listings');
  if v_max is not null and v_active_count >= v_max then
    raise exception 'you have reached your plan''s active-listing limit (%)', v_max;
  end if;

  insert into public.proof_lab_listings (
    seller_user_id, asset_id, title, description, category_slug,
    retail_price_cents, member_price_cents, price_unit, badge, status
  ) values (
    v_uid, p_asset_id, p_title, p_description, p_category_slug,
    p_retail_price_cents, p_member_price_cents, p_price_unit, p_badge, 'active'
  ) returning id into v_id;

  return v_id;
end;
$$;

-- Activate/deactivate/archive; re-checks the active cap when activating.
create or replace function public.set_proof_lab_listing_status(
  p_listing_id uuid,
  p_status text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plan_code;
  v_max integer;
  v_active_count integer;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_status not in ('active','inactive','archived') then raise exception 'invalid status'; end if;

  if not exists (select 1 from public.proof_lab_listings where id = p_listing_id and seller_user_id = v_uid) then
    raise exception 'listing not found';
  end if;

  if p_status = 'active' then
    select plan_code into v_plan from public.user_profiles where user_id = v_uid;
    select count(*) into v_active_count
    from public.proof_lab_listings
    where seller_user_id = v_uid and status = 'active' and id <> p_listing_id;
    v_max := public.plan_feature_limit(v_plan, 'max_proof_lab_listings');
    if v_max is not null and v_active_count >= v_max then
      raise exception 'you have reached your plan''s active-listing limit (%)', v_max;
    end if;
  end if;

  update public.proof_lab_listings set status = p_status where id = p_listing_id;
end;
$$;

-- Members request a deal; records the request and returns its id. Seller email
-- notification is sent out-of-band by an API route (service role).
create or replace function public.request_proof_lab_deal(
  p_listing_id uuid,
  p_requester_email text,
  p_note text default null,
  p_timeframe public.proof_lab_timeframe default 'soon'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_status text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if nullif(btrim(coalesce(p_requester_email, '')), '') is null then
    raise exception 'contact email is required';
  end if;

  select seller_user_id, status into v_seller, v_status
  from public.proof_lab_listings where id = p_listing_id;
  if not found then raise exception 'listing not found'; end if;
  if v_status <> 'active' then raise exception 'this listing is not currently available'; end if;
  if v_seller = v_uid then raise exception 'you cannot request your own listing'; end if;

  insert into public.proof_lab_deal_requests (
    listing_id, requester_user_id, seller_user_id, requester_email, note, timeframe
  ) values (
    p_listing_id, v_uid, v_seller, p_requester_email, p_note, p_timeframe
  ) returning id into v_id;

  return v_id;
end;
$$;

-- update_proof_lab_listing(p_listing_id, ...fields...) — owner edits title/desc/
-- category/prices/unit/badge. Straightforward; validate category + ownership.
-- (Draft omitted for brevity — mirror create's validation.)

revoke all on function public.create_proof_lab_listing(text, text, text, integer, integer, text, text, uuid) from public;
revoke all on function public.set_proof_lab_listing_status(uuid, text) from public;
revoke all on function public.request_proof_lab_deal(uuid, text, public.proof_lab_timeframe) from public;
grant execute on function public.create_proof_lab_listing(text, text, text, integer, integer, text, text, uuid) to authenticated;
grant execute on function public.set_proof_lab_listing_status(uuid, text) to authenticated;
grant execute on function public.request_proof_lab_deal(uuid, text, public.proof_lab_timeframe) to authenticated;
```

### Data-access layer — `src/lib/fivestarz/data.js`

- `listProofLabListings(supabase, { categorySlug } = {})` — active listings + seller display via `user_profiles(display_name)`; filter by `categorySlug` when set.
- `listMyProofLabListings(supabase, userId)` — all statuses for the seller.
- `getProofLabCategories(supabase)` — for the create/edit form and the browse filter (replaces the hard-coded `PROOF_CATS`).
- `createProofLabListing(supabase, form)` → `rpc('create_proof_lab_listing', …)`.
- `updateProofLabListing(supabase, listingId, form)` → `rpc('update_proof_lab_listing', …)`.
- `setProofLabListingStatus(supabase, listingId, status)` → `rpc('set_proof_lab_listing_status', …)`.
- `requestProofLabDeal(supabase, { listingId, email, note, timeframe })` → `rpc('request_proof_lab_deal', …)`.
- `listIncomingDealRequests(supabase, userId)` / `listOutgoingDealRequests(supabase, userId)` — for the seller inbox / requester history.

Add an enum map in `src/lib/fivestarz/enums.js` for category slug↔label and timeframe slug↔label (mirror the existing asset-type/feedback-format maps), and store prices as integer cents (parse the mock `$149` strings only if migrating seed data; going forward the form collects dollars → cents).

### Frontend wiring

- **Route gating** — `src/app/proof-lab/page.jsx` is currently a public server component with no user fetch. Convert it to fetch the user (mirror `src/app/dashboard/page.jsx`) and redirect anonymous visitors to `/login?next=/proof-lab` (settled decision — members-only in 6a; public teaser deferred to Phase 8). Pass `userId` into `ProofLabPage`.
- **`ProofLabPage.jsx`** — replace `PROOF_LISTINGS`/`PROOF_CATS` imports with `listProofLabListings` + `getProofLabCategories`; derive seller avatar/initials/color the same way `BrowsePage.jsx` does (`colorForUser`, `initials`) instead of the mock's stored `avatar`/`color`. Rewrite the "Request This Deal" modal's `send()` to call `requestProofLabDeal()` (RPC) **and** then `POST` to a new `/api/proof-lab/notify-seller` route so the seller is actually emailed (see below) — replacing the current `/api/beta-signup` call. Format cents → display price.
- **`DashboardPage.jsx` → `ProofLabListingsTab`** — replace `ME_PROOF_LISTINGS` with `listMyProofLabListings`; wire **Add New Listing** to a create modal (`createProofLabListing`), **Edit** to an edit modal (`updateProofLabListing`), **Activate/De-activate** to `setProofLabListingStatus`; read the real cap from `plan_feature_limit(plan, 'max_proof_lab_listings')` instead of the hard-coded `3`, and surface the RPC's limit exception inline. Add an **Incoming Deal Requests** view (via `listIncomingDealRequests`) so sellers can see who requested what — this is the payoff that makes the marketplace two-sided.
- **Seller notification API** — new `src/app/api/proof-lab/notify-seller/route.js` (mirror `src/app/api/beta-signup/route.js`): accepts a `dealRequestId`, uses the **service-role** client to look up the deal request + listing + seller's `auth.users` email (not exposed to the browser), and sends a Resend email to the seller. Guard against spam by confirming the deal-request row exists and is recent.

### Done criteria

- A Bloom seller can create up to 3 **active** listings; a 4th active listing (create, or activate a 4th) fails with a clear inline RPC error; a Sprout user is blocked entirely (`proof_lab_listings_enabled = false`).
- The `/proof-lab` grid renders real listings from the DB, filters by real categories, and hides non-active listings from non-owners.
- "Request This Deal" writes a `proof_lab_deal_requests` row and emails the actual seller; the seller sees the request in their dashboard.
- Edit / Activate / De-activate all persist and reflect on refresh.

### Verification (same approach as Phases 1–5)

Node script with the service-role key: create temporary Bloom + Sprout confirmed users, then assert via the anon-authenticated client — create listing succeeds (Bloom) / rejected (Sprout); active cap enforced at 3 including the activate path; deal-request RPC creates a row with correct `seller_user_id` and is rejected for self-requests / inactive listings; RLS hides a Bloom user's `inactive` listing from another member but shows `active` ones; seller and requester can each read the deal-request row, a third party cannot. Delete all test users (cascades clean up listings/requests). **Ask before running — touches the live DB with elevated creds.**

---

## Phase 6b — Stripe payments (deferred; scoped, not designed in full)

The 6a model deliberately stores prices as integer cents and models a request → accept/decline/fulfil lifecycle so payments layer on without reshaping tables. 6b is a **materially larger** effort with unresolved product/compliance decisions:

- **Payout model** — a two-sided marketplace paying sellers requires **Stripe Connect** (Express/Standard accounts, onboarding, KYC, payout schedules), not just Checkout. This is the big lift.
- **Where money is charged** — deposit at request time vs. full payment on seller acceptance vs. off-platform (current behaviour: request only, seller invoices directly). Affects refund/dispute handling.
- **Platform fee** — does FiveStarz take a cut? That drives Connect application-fee wiring.
- **New surfaces** — seller Connect onboarding in the dashboard, a payment step in the request modal, webhook route (`/api/stripe/webhook`) to reconcile `payment_intent`/`charge` events into `proof_lab_deal_requests.status`, and a `proof_lab_payments` table.

Recommend running 6b as its own planning pass once 6a is live and there's real deal-request volume to justify the Connect investment.

---

## Roadmap — remaining features (Phases 7+)

All still fully unimplemented (see `docs/fiveup-project-status-7-4-26.txt`). Suggested order and dependencies:

1. **Phase 7 — Trust & Safety moderation.** Tables: `moderation_flags`, `moderation_actions`, `warnings`; phrase-blocklist check on feedback/asset/listing text (a `security definer` validation reused across `submit_feedback`, `create_asset`, `create_proof_lab_listing`); admin review queue (there's already `user_roles`/`is_admin()`). **Do this before public profiles** — public surfaces expose user-generated content and need moderation + takedown first.
2. **Phase 8 — Public profile & proof pages** (`/u/[username]`, `/a/[slug]`). The biggest structural change: the schema currently has **zero `anon`-role RLS**, so this needs new `anon` SELECT policies on curated views, `username`/`slug` columns (with uniqueness + reserved-word handling), and the per-user visibility toggles from PRD §15 (`profile_public_enabled`, `searchable_public_profile`, `show_feedback_excerpts`, `show_public_videos`, `show_marketplace_offers`, `show_stats`) — none exist today. Depends on Phase 7 for safe public exposure. Proof Lab listings (6a) become a natural thing to surface on public profiles here (`show_marketplace_offers`).
3. **Phase 9 — Video/audio feedback (Mux).** The `video_audio` feedback_format enum, `asset_feedback_formats` acceptance, and `feedback_submissions.media_url` already exist; this phase adds real recording/upload → Mux ingestion, a `video_feedback` table (asset/upload state, duration, playback id, moderation status), and player UI. Independent of 7/8 but benefits from Phase 7 moderation for public videos.
4. **Phase 10 — AI Asset Builder.** Onboarding assist that drafts asset name/description/channels/feedback-format suggestions from a URL. LLM integration (use the latest Claude model per the `claude-api` skill); lowest structural risk, no schema dependencies — can be slotted in anytime. Feeds `create_asset` (Phase 5a).

### Settled decisions (resolved before starting 6a)

- **Route access → gate to members.** `/proof-lab` becomes a server component that fetches the user and redirects anonymous visitors to `/login?next=/proof-lab`. No `anon`-role RLS is introduced in 6a; a proper public teaser is deferred to Phase 8 (public profiles), where anonymous exposure is designed holistically with moderation already in place.
- **Listing↔asset link → optional, with a proof badge.** `asset_id` stays nullable (a listing may be a pure service with no reviewed asset). When it *is* set, the UI shows a "verified proof" badge linking to the reviewed asset — trust upside without blocking coaching/photography/etc. listings.
- **Seed data → start empty (categories only).** The 22 `PROOF_LISTINGS` mock rows are **not** migrated: doing so would require fabricated seller `user_profiles` that would pollute the real members table and leak into the matching graph / browse candidates. The migration seeds only `proof_lab_categories`. `ProofLabPage` needs a proper empty state ("No listings yet — be the first to post a deal"). Any demo data is a separate **dev-only** script using intentionally-created demo accounts, never a prod migration.
- **Flourish cap → 10 (finite, generous).** Guards a small early marketplace against single-seller flooding before Phase 7 moderation exists. It's a one-row change in `plan_feature_gates` to raise or make unlimited later, no code change. (Reflected in the migration draft above.)
```
