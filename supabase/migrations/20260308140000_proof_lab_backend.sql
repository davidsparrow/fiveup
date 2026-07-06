-- Phase 6a: Proof Lab (marketplace) real backend.
-- Tables + seeded categories + per-plan active-listing cap + RLS + the
-- security-definer RPCs that are the sole write path (so plan quotas can't be
-- bypassed by a direct client insert). Mirrors the create_asset / create_match
-- patterns from earlier phases.
--
-- Written to be idempotent / safely re-runnable.

-- ── Enums ────────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'proof_lab_timeframe') then
    create type public.proof_lab_timeframe as enum ('asap', 'soon', 'no_rush');
  end if;
  if not exists (select 1 from pg_type where typname = 'proof_lab_request_status') then
    create type public.proof_lab_request_status as enum ('pending', 'accepted', 'declined', 'fulfilled', 'cancelled');
  end if;
end $$;

-- ── Category lookup (a table, not an enum, so it can be extended freely) ──
create table if not exists public.proof_lab_categories (
  slug text primary key,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── Listings ─────────────────────────────────────────────────────────────
create table if not exists public.proof_lab_listings (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null, -- optional "proof" tie-in
  title text not null,
  description text not null,
  category_slug text not null references public.proof_lab_categories(slug),
  retail_price_cents integer check (retail_price_cents is null or retail_price_cents >= 0),
  member_price_cents integer check (member_price_cents is null or member_price_cents >= 0),
  price_unit text,
  badge text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_proof_lab_listings_seller on public.proof_lab_listings (seller_user_id);
create index if not exists idx_proof_lab_listings_status on public.proof_lab_listings (status);
create index if not exists idx_proof_lab_listings_category on public.proof_lab_listings (category_slug);

-- ── Deal requests (members-only, so requester is always authenticated) ───
create table if not exists public.proof_lab_deal_requests (
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

create index if not exists idx_proof_lab_deal_requests_seller on public.proof_lab_deal_requests (seller_user_id);
create index if not exists idx_proof_lab_deal_requests_requester on public.proof_lab_deal_requests (requester_user_id);
create index if not exists idx_proof_lab_deal_requests_listing on public.proof_lab_deal_requests (listing_id);

-- ── updated_at triggers (set_updated_at() defined in initial schema) ─────
create or replace trigger trg_proof_lab_listings_set_updated_at
before update on public.proof_lab_listings
for each row execute function public.set_updated_at();

create or replace trigger trg_proof_lab_deal_requests_set_updated_at
before update on public.proof_lab_deal_requests
for each row execute function public.set_updated_at();

-- ── Per-plan active-listing cap (proof_lab_listings_enabled already seeded) ─
insert into public.plan_feature_gates (plan_code, feature_key, enabled, limit_int, description, config)
values
  ('sprout',   'max_proof_lab_listings', false, 0,  'Max active Proof Lab listings', '{}'::jsonb),
  ('bloom',    'max_proof_lab_listings', true,  3,  'Max active Proof Lab listings', '{}'::jsonb),
  ('flourish', 'max_proof_lab_listings', true,  10, 'Max active Proof Lab listings', '{}'::jsonb)
on conflict (plan_code, feature_key) do update set
  enabled = excluded.enabled, limit_int = excluded.limit_int,
  description = excluded.description, config = excluded.config, updated_at = now();

-- ── Seed categories (from PROOF_CATS, minus the UI-only "All") ───────────
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

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.proof_lab_categories enable row level security;
alter table public.proof_lab_listings enable row level security;
alter table public.proof_lab_deal_requests enable row level security;

-- Categories are reference data readable by any member.
drop policy if exists "proof_lab_categories_select_all" on public.proof_lab_categories;
create policy "proof_lab_categories_select_all"
on public.proof_lab_categories for select to authenticated using (true);

-- Active listings visible to all members; sellers see their own in any status.
drop policy if exists "proof_lab_listings_select_visible" on public.proof_lab_listings;
create policy "proof_lab_listings_select_visible"
on public.proof_lab_listings for select to authenticated
using (status = 'active' or seller_user_id = auth.uid());

-- Deal requests readable by their two participants only.
drop policy if exists "proof_lab_deal_requests_select_participants" on public.proof_lab_deal_requests;
create policy "proof_lab_deal_requests_select_participants"
on public.proof_lab_deal_requests for select to authenticated
using (requester_user_id = auth.uid() or seller_user_id = auth.uid());

-- NOTE: no INSERT/UPDATE/DELETE policies. All writes flow through the
-- security-definer RPCs below, which is what enforces the plan quota — a
-- direct client mutation is denied by RLS.

-- ── RPCs ─────────────────────────────────────────────────────────────────
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
  if nullif(btrim(coalesce(p_title, '')), '') is null then raise exception 'title is required'; end if;
  if nullif(btrim(coalesce(p_description, '')), '') is null then raise exception 'description is required'; end if;

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

create or replace function public.update_proof_lab_listing(
  p_listing_id uuid,
  p_title text,
  p_description text,
  p_category_slug text,
  p_retail_price_cents integer default null,
  p_member_price_cents integer default null,
  p_price_unit text default null,
  p_badge text default null,
  p_asset_id uuid default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  if not exists (select 1 from public.proof_lab_listings where id = p_listing_id and seller_user_id = v_uid) then
    raise exception 'listing not found';
  end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null then raise exception 'title is required'; end if;
  if nullif(btrim(coalesce(p_description, '')), '') is null then raise exception 'description is required'; end if;
  if not exists (select 1 from public.proof_lab_categories where slug = p_category_slug) then
    raise exception 'unknown category';
  end if;
  if p_asset_id is not null and not exists (
    select 1 from public.assets where id = p_asset_id and owner_user_id = v_uid
  ) then
    raise exception 'linked asset must be one you own';
  end if;

  update public.proof_lab_listings set
    title = p_title,
    description = p_description,
    category_slug = p_category_slug,
    retail_price_cents = p_retail_price_cents,
    member_price_cents = p_member_price_cents,
    price_unit = p_price_unit,
    badge = p_badge,
    asset_id = p_asset_id
  where id = p_listing_id;
end;
$$;

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

revoke all on function public.create_proof_lab_listing(text, text, text, integer, integer, text, text, uuid) from public;
revoke all on function public.update_proof_lab_listing(uuid, text, text, text, integer, integer, text, text, uuid) from public;
revoke all on function public.set_proof_lab_listing_status(uuid, text) from public;
revoke all on function public.request_proof_lab_deal(uuid, text, text, public.proof_lab_timeframe) from public;
grant execute on function public.create_proof_lab_listing(text, text, text, integer, integer, text, text, uuid) to authenticated;
grant execute on function public.update_proof_lab_listing(uuid, text, text, text, integer, integer, text, text, uuid) to authenticated;
grant execute on function public.set_proof_lab_listing_status(uuid, text) to authenticated;
grant execute on function public.request_proof_lab_deal(uuid, text, text, public.proof_lab_timeframe) to authenticated;
