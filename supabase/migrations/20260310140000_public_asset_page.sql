-- Phase 8d: Public surfaces — the public asset page read layer (/a/[slug]).
--
-- Adds ONE anon-callable projection RPC, get_public_asset(p_slug), following
-- the same security model as 8b: security-definer, granted to `anon`, never
-- exposing raw table rows. It gates on the ASSET, not on the owner's profile:
-- an asset can be public while its owner's profile is private (spec: profile
-- public + one case study public + newest asset private, and the converse).
--
-- Gating (all ANDed):
--   • asset.visibility = 'public'         — owner opted this asset public
--   • asset.moderation_status = 'ok'      — Phase-7: not removed
--   • owner account_status <> 'suspended' — Phase-7: suspended owner hidden
--   • owner moderation_status = 'ok'      — Phase-7: removed owner hidden
--
-- Owner identity:
--   • owner_display_name — ALWAYS returned. brand_visibility
--     ('hidden_until_feedback_complete') was modeled in 8a but is deliberately
--     kept DORMANT in 8d (locked decision): identity always shows. There is no
--     owner UI to set it hidden yet and its default is 'visible', so nothing is
--     exposed that an owner chose to hide. The reveal mechanic is a later slice.
--   • owner_username — the /u/[handle] link target, returned ONLY when the
--     owner's own profile is public (else the name shows without a link).
--
-- Per-asset commentary excerpts are intentionally OUT of 8d (deferred).
--
-- Idempotent / safely re-runnable.

create or replace function public.get_public_asset(p_slug citext)
returns table (
  name text,
  description text,
  asset_type text,
  public_slug citext,
  created_at timestamptz,
  owner_display_name text,   -- always shown (brand_visibility dormant in 8d)
  owner_username citext      -- link target; only when owner profile is public
)
language sql stable security definer set search_path = public
as $$
  select
    a.name,
    a.description,
    a.asset_type::text,
    a.public_slug,
    a.created_at,
    up.display_name,
    case
      when up.profile_public_enabled
       and up.account_status <> 'suspended'
       and up.moderation_status = 'ok'
      then up.public_username
    end
  from public.assets a
  join public.user_profiles up on up.user_id = a.owner_user_id
  where a.public_slug = p_slug
    and a.visibility = 'public'
    and a.moderation_status = 'ok'
    and up.account_status <> 'suspended'
    and up.moderation_status = 'ok';
$$;

revoke all on function public.get_public_asset(citext) from public;
grant execute on function public.get_public_asset(citext) to anon, authenticated;
