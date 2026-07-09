-- Phase 11b: make public asset pages search-discoverable (per-asset opt-in).
--
-- Locked: per-asset opt-in (assets.searchable_public), gated by the owner's
-- profile-indexing paid feature (public_profile_indexing_enabled). Asset and
-- profile visibility stay independent (8d) — the gate reuses the paid FEATURE,
-- not the profile's own searchable state.
--
-- Idempotent / safely re-runnable.

alter table public.assets
  add column if not exists searchable_public boolean not null default false;

-- Owner opt-in. Blocks turning it on without the paid feature (read path also
-- re-checks, so a later downgrade silently stops indexing).
create or replace function public.set_asset_searchable(p_asset_id uuid, p_value boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plan_code;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();

  select up.plan_code into v_plan
  from public.assets a
  join public.user_profiles up on up.user_id = a.owner_user_id
  where a.id = p_asset_id and a.owner_user_id = v_uid;
  if not found then raise exception 'asset not found'; end if;

  if p_value and not public.plan_feature_enabled(v_plan, 'public_profile_indexing_enabled') then
    raise exception 'search indexing requires a paid plan';
  end if;

  update public.assets set searchable_public = p_value where id = p_asset_id;
end;
$$;

-- Recreate get_public_asset to add `indexable` (keeps owner_hidden from 11a).
drop function if exists public.get_public_asset(citext);

create function public.get_public_asset(p_slug citext)
returns table (
  name text,
  description text,
  asset_type text,
  public_slug citext,
  created_at timestamptz,
  owner_display_name text,
  owner_username citext,
  owner_hidden boolean,
  indexable boolean          -- opted-in AND owner has the paid indexing feature
)
language sql stable security definer set search_path = public
as $$
  select
    a.name,
    a.description,
    a.asset_type::text,
    a.public_slug,
    a.created_at,
    case when h.hidden then null else up.display_name end,
    case
      when h.hidden then null
      when up.profile_public_enabled
       and up.account_status <> 'suspended'
       and up.moderation_status = 'ok'
      then up.public_username
    end,
    h.hidden,
    (a.searchable_public and public.plan_feature_enabled(up.plan_code, 'public_profile_indexing_enabled'))
  from public.assets a
  join public.user_profiles up on up.user_id = a.owner_user_id
  cross join lateral (
    select (a.brand_visibility = 'hidden_until_feedback_complete'
            and public.plan_feature_enabled(up.plan_code, 'brand_visibility_enabled')) as hidden
  ) h
  where a.public_slug = p_slug
    and a.visibility = 'public'
    and a.moderation_status = 'ok'
    and up.account_status <> 'suspended'
    and up.moderation_status = 'ok';
$$;

-- Sitemap source: public + clean + owner-ok + opted-in + owner paid.
create or replace function public.list_searchable_assets()
returns table (public_slug citext, updated_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select a.public_slug, a.updated_at
  from public.assets a
  join public.user_profiles up on up.user_id = a.owner_user_id
  where a.visibility = 'public'
    and a.moderation_status = 'ok'
    and a.searchable_public
    and up.account_status <> 'suspended'
    and up.moderation_status = 'ok'
    and public.plan_feature_enabled(up.plan_code, 'public_profile_indexing_enabled')
  order by a.updated_at desc;
$$;

revoke all on function public.set_asset_searchable(uuid, boolean) from public;
revoke all on function public.get_public_asset(citext) from public;
revoke all on function public.list_searchable_assets() from public;

grant execute on function public.set_asset_searchable(uuid, boolean) to authenticated;
grant execute on function public.get_public_asset(citext) to anon, authenticated;
grant execute on function public.list_searchable_assets() to anon, authenticated;
