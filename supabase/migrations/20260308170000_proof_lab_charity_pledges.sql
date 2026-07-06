-- Phase 6b.3: Proof Lab charity pledges + fundraiser leaderboard (honor-system;
-- we never touch funds). Per-listing pledge shown as a buyer-facing badge,
-- snapshotted immutably onto each deal at fulfillment; leaderboard aggregates
-- completed-deal pledges. Deal value = the listing's member price.
-- Idempotent / re-runnable.

-- ── Curated charities ────────────────────────────────────────────────────
create table if not exists public.charities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  url text not null,
  logo_emoji text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.charities (name, url, logo_emoji, sort_order) values
  ('Charity: Water', 'https://www.charitywater.org', '💧', 10),
  ('Room to Read', 'https://www.roomtoread.org', '📚', 20),
  ('Girls Who Code', 'https://girlswhocode.com', '💻', 30),
  ('GiveDirectly', 'https://www.givedirectly.org', '🤝', 40),
  ('The Trevor Project', 'https://www.thetrevorproject.org', '🌈', 50),
  ('World Central Kitchen', 'https://wck.org', '🍲', 60)
on conflict (name) do nothing;

-- ── Per-listing pledge ───────────────────────────────────────────────────
alter table public.proof_lab_listings
  add column if not exists donation_percent smallint,
  add column if not exists charity_id uuid references public.charities(id);

alter table public.proof_lab_listings drop constraint if exists proof_lab_listings_donation_pct_ck;
alter table public.proof_lab_listings add constraint proof_lab_listings_donation_pct_ck
  check (donation_percent is null or (donation_percent between 1 and 100));

alter table public.proof_lab_listings drop constraint if exists proof_lab_listings_donation_pair_ck;
alter table public.proof_lab_listings add constraint proof_lab_listings_donation_pair_ck
  check ((donation_percent is null and charity_id is null)
      or (donation_percent is not null and charity_id is not null));

-- ── Immutable pledge snapshot taken at fulfillment ───────────────────────
alter table public.proof_lab_deal_requests
  add column if not exists deal_value_cents integer,
  add column if not exists donation_percent smallint,
  add column if not exists charity_id uuid references public.charities(id);

-- ── RLS: charities are reference data readable by any member ─────────────
alter table public.charities enable row level security;
drop policy if exists "charities_select_active" on public.charities;
create policy "charities_select_active"
on public.charities for select to authenticated using (true);

-- ── create/update listing RPCs gain pledge params (drop old sigs first so the
--    named-arg overload stays unambiguous) ───────────────────────────────
drop function if exists public.create_proof_lab_listing(text, text, text, integer, integer, text, text, uuid);
create or replace function public.create_proof_lab_listing(
  p_title text,
  p_description text,
  p_category_slug text,
  p_retail_price_cents integer default null,
  p_member_price_cents integer default null,
  p_price_unit text default null,
  p_badge text default null,
  p_asset_id uuid default null,
  p_donation_percent smallint default null,
  p_charity_id uuid default null
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

  if (p_donation_percent is null) <> (p_charity_id is null) then
    raise exception 'donation percent and charity must be set together';
  end if;
  if p_donation_percent is not null then
    if p_donation_percent < 1 or p_donation_percent > 100 then
      raise exception 'donation percent must be between 1 and 100';
    end if;
    if not exists (select 1 from public.charities where id = p_charity_id and active) then
      raise exception 'unknown or inactive charity';
    end if;
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
    retail_price_cents, member_price_cents, price_unit, badge, status,
    donation_percent, charity_id
  ) values (
    v_uid, p_asset_id, p_title, p_description, p_category_slug,
    p_retail_price_cents, p_member_price_cents, p_price_unit, p_badge, 'active',
    p_donation_percent, p_charity_id
  ) returning id into v_id;

  return v_id;
end;
$$;

drop function if exists public.update_proof_lab_listing(uuid, text, text, text, integer, integer, text, text, uuid);
create or replace function public.update_proof_lab_listing(
  p_listing_id uuid,
  p_title text,
  p_description text,
  p_category_slug text,
  p_retail_price_cents integer default null,
  p_member_price_cents integer default null,
  p_price_unit text default null,
  p_badge text default null,
  p_asset_id uuid default null,
  p_donation_percent smallint default null,
  p_charity_id uuid default null
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

  if (p_donation_percent is null) <> (p_charity_id is null) then
    raise exception 'donation percent and charity must be set together';
  end if;
  if p_donation_percent is not null then
    if p_donation_percent < 1 or p_donation_percent > 100 then
      raise exception 'donation percent must be between 1 and 100';
    end if;
    if not exists (select 1 from public.charities where id = p_charity_id and active) then
      raise exception 'unknown or inactive charity';
    end if;
  end if;

  update public.proof_lab_listings set
    title = p_title,
    description = p_description,
    category_slug = p_category_slug,
    retail_price_cents = p_retail_price_cents,
    member_price_cents = p_member_price_cents,
    price_unit = p_price_unit,
    badge = p_badge,
    asset_id = p_asset_id,
    donation_percent = p_donation_percent,
    charity_id = p_charity_id
  where id = p_listing_id;
end;
$$;

-- mark-fulfilled now snapshots deal value + pledge from the listing.
create or replace function public.mark_proof_lab_deal_fulfilled(p_deal_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.proof_lab_request_status;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select status into v_status from public.proof_lab_deal_requests
    where id = p_deal_id and seller_user_id = v_uid;
  if not found then raise exception 'deal request not found'; end if;
  if v_status <> 'accepted' then raise exception 'only an accepted deal can be marked fulfilled'; end if;

  update public.proof_lab_deal_requests d
    set status = 'fulfilled',
        fulfilled_at = now(),
        deal_value_cents = l.member_price_cents,
        donation_percent = l.donation_percent,
        charity_id = l.charity_id
    from public.proof_lab_listings l
    where d.id = p_deal_id and l.id = d.listing_id;
end;
$$;

-- ── Fundraiser leaderboard: per-seller pledged totals over completed deals ─
create or replace function public.proof_lab_fundraiser_leaderboard(p_since timestamptz default null)
returns table (
  seller_user_id uuid,
  display_name text,
  completed_deals integer,
  total_pledged_cents bigint
)
language sql security definer set search_path = public
as $$
  select d.seller_user_id,
         up.display_name,
         count(*)::integer as completed_deals,
         coalesce(sum((d.deal_value_cents::bigint * d.donation_percent) / 100), 0)::bigint as total_pledged_cents
  from public.proof_lab_deal_requests d
  join public.user_profiles up on up.user_id = d.seller_user_id
  where d.status = 'completed'
    and d.donation_percent is not null
    and d.deal_value_cents is not null
    and (p_since is null or d.completed_at >= p_since)
  group by d.seller_user_id, up.display_name
  order by total_pledged_cents desc, completed_deals desc;
$$;

revoke all on function public.create_proof_lab_listing(text, text, text, integer, integer, text, text, uuid, smallint, uuid) from public;
revoke all on function public.update_proof_lab_listing(uuid, text, text, text, integer, integer, text, text, uuid, smallint, uuid) from public;
revoke all on function public.proof_lab_fundraiser_leaderboard(timestamptz) from public;
grant execute on function public.create_proof_lab_listing(text, text, text, integer, integer, text, text, uuid, smallint, uuid) to authenticated;
grant execute on function public.update_proof_lab_listing(uuid, text, text, text, integer, integer, text, text, uuid, smallint, uuid) to authenticated;
grant execute on function public.proof_lab_fundraiser_leaderboard(timestamptz) to authenticated;
