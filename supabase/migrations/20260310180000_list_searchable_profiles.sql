-- Phase 9c: SEO — enumerate indexable public profiles for the sitemap.
--
-- Anon-callable projection returning only the handles of profiles that are
-- both public and search-indexable: profile_public_enabled AND
-- searchable_public_profile AND the paid indexing feature AND not suppressed
-- (mirrors the `searchable` flag get_public_profile already computes). Returns
-- no PII — just the username + last-updated for <lastmod>. Only these profiles
-- ever appear in the sitemap; everything else stays noindex.
--
-- Idempotent / safely re-runnable.

create or replace function public.list_searchable_profiles()
returns table (public_username citext, updated_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select up.public_username, up.updated_at
  from public.user_profiles up
  where up.profile_public_enabled
    and up.searchable_public_profile
    and public.plan_feature_enabled(up.plan_code, 'public_profile_indexing_enabled')
    and up.account_status <> 'suspended'
    and up.moderation_status = 'ok'
    and up.public_username is not null
  order by up.updated_at desc;
$$;

revoke all on function public.list_searchable_profiles() from public;
grant execute on function public.list_searchable_profiles() to anon, authenticated;
