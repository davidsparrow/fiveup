-- Phase 11a: enforce brand_visibility on the public asset page (/a/[slug]).
--
-- brand_visibility ('visible' | 'hidden_until_feedback_complete', per-asset,
-- paid feature 'brand_visibility_enabled') was modeled in 8a and kept dormant.
-- Enforce it now with an OWNER-CONTROLLED reveal (locked decision): while an
-- asset is 'hidden_until_feedback_complete' AND the owner currently has the paid
-- feature, hide the owner's identity on the public asset page. The owner reveals
-- by switching the asset back to 'visible' (existing set_asset_brand_visibility).
--
-- get_public_asset gains an `owner_hidden` column, so the return signature
-- changes → drop + recreate (create-or-replace can't change return type).
--
-- Idempotent / safely re-runnable.

drop function if exists public.get_public_asset(citext);

create function public.get_public_asset(p_slug citext)
returns table (
  name text,
  description text,
  asset_type text,
  public_slug citext,
  created_at timestamptz,
  owner_display_name text,   -- null when identity is hidden by brand_visibility
  owner_username citext,     -- link target; null when hidden or profile not public
  owner_hidden boolean       -- true when brand_visibility is hiding the owner
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
    h.hidden
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

revoke all on function public.get_public_asset(citext) from public;
grant execute on function public.get_public_asset(citext) to anon, authenticated;
