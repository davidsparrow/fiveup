-- Phase 8a: Public surfaces — visibility & publishing data model.
--
-- The data model the public-read layer (8b) will project from. Ships
-- private/off by default: nothing becomes public until a member opts in.
-- NO anon/public exposure in this migration — only new columns + the
-- member-facing RPCs that set them.
--
--   • asset_visibility (private|member_only|public) — audience, distinct from
--     assets.status (workflow). New assets default member_only; existing
--     non-active assets backfilled to private. 'public' is never set by a
--     migration — only by the owner, per asset.
--   • brand_visibility (visible|hidden_until_feedback_complete) — modeled now,
--     enforcement wired later (paid feature).
--   • user_profiles publishing controls (PRD §15) — all default false/off, plus
--     a claimed unique public_username (@handle) for /u/[username].
--   • plan_feature_gates seeds for the paid publishing features ("Generous
--     free" line): excerpts / video / SEO indexing / hide-identity are paid;
--     everything else on the profile is free.
--
-- Idempotent / safely re-runnable.

create extension if not exists citext;

-- ── Enums ──────────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'asset_visibility') then
    create type public.asset_visibility as enum ('private', 'member_only', 'public');
  end if;
  if not exists (select 1 from pg_type where typname = 'brand_visibility') then
    create type public.brand_visibility as enum ('visible', 'hidden_until_feedback_complete');
  end if;
end $$;

-- ── Asset audience + brand columns ─────────────────────────────────────────
alter table public.assets
  add column if not exists visibility public.asset_visibility not null default 'member_only',
  add column if not exists brand_visibility public.brand_visibility not null default 'visible';

-- One-time backfill: today status='active' ≈ visible to all authenticated
-- (→ member_only, the column default already set that). Non-active assets were
-- owner-only, so mark them private. Only touches non-active rows.
update public.assets set visibility = 'private'
  where status in ('draft', 'pending_verification', 'archived')
    and visibility = 'member_only';

-- ── Profile publishing controls (all default off/false) ────────────────────
alter table public.user_profiles
  add column if not exists public_username citext unique,
  add column if not exists profile_public_enabled boolean not null default false,
  add column if not exists searchable_public_profile boolean not null default false,
  add column if not exists show_logo boolean not null default false,
  add column if not exists show_location boolean not null default false,
  add column if not exists show_stats boolean not null default false,
  add column if not exists show_feedback_excerpts boolean not null default false,
  add column if not exists show_public_videos boolean not null default false,
  add column if not exists show_marketplace_offers boolean not null default false,
  add column if not exists show_external_links boolean not null default false;

-- ── Paid publishing features (Generous-free line). Free features have no gate
--    and are never checked. sprout:f, bloom:t, flourish:t ─────────────────────
insert into public.plan_feature_gates (plan_code, feature_key, enabled, limit_int, description, config)
values
  ('sprout',   'public_feedback_excerpts_enabled', false, null, 'Show approved feedback excerpts on public profile', '{}'::jsonb),
  ('bloom',    'public_feedback_excerpts_enabled', true,  null, 'Show approved feedback excerpts on public profile', '{}'::jsonb),
  ('flourish', 'public_feedback_excerpts_enabled', true,  null, 'Show approved feedback excerpts on public profile', '{}'::jsonb),
  ('sprout',   'public_video_enabled',             false, null, 'Show approved public video/audio clips',           '{}'::jsonb),
  ('bloom',    'public_video_enabled',             true,  null, 'Show approved public video/audio clips',           '{}'::jsonb),
  ('flourish', 'public_video_enabled',             true,  null, 'Show approved public video/audio clips',           '{}'::jsonb),
  ('sprout',   'public_profile_indexing_enabled',  false, null, 'Allow search-engine indexing of public profile',   '{}'::jsonb),
  ('bloom',    'public_profile_indexing_enabled',  true,  null, 'Allow search-engine indexing of public profile',   '{}'::jsonb),
  ('flourish', 'public_profile_indexing_enabled',  true,  null, 'Allow search-engine indexing of public profile',   '{}'::jsonb),
  ('sprout',   'brand_visibility_enabled',         false, null, 'Hide brand identity until feedback complete',      '{}'::jsonb),
  ('bloom',    'brand_visibility_enabled',         true,  null, 'Hide brand identity until feedback complete',      '{}'::jsonb),
  ('flourish', 'brand_visibility_enabled',         true,  null, 'Hide brand identity until feedback complete',      '{}'::jsonb)
on conflict (plan_code, feature_key) do update set
  enabled = excluded.enabled, limit_int = excluded.limit_int,
  description = excluded.description, config = excluded.config, updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════════
-- Member-facing RPCs (RPC-only writes; suspended callers blocked via 7c helper)
-- ═══════════════════════════════════════════════════════════════════════════

-- Claim a unique public @handle for /u/[username]. Claim-once semantics: this
-- sets it; changing an existing handle is out of scope for now.
create or replace function public.claim_public_username(p_username text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_handle citext;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();

  v_handle := lower(btrim(coalesce(p_username, '')));

  -- charset/length: 3–30 chars, [a-z0-9_-], no leading/trailing separator
  if v_handle !~ '^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$' then
    raise exception 'handle must be 3–30 chars, letters/numbers/_/- , not starting or ending with _ or -';
  end if;

  -- reserved names (route collisions + system/impersonation)
  if v_handle::text = any (array[
    'admin','administrator','api','app','auth','login','logout','signin','signup','register',
    'dashboard','account','accounts','settings','browse','profile','profiles','user','users','me',
    'proof-lab','prooflab','market','marketplace','pricing','community','safety','how-it-works',
    'about','help','support','terms','privacy','static','assets','asset','u','a','root','system',
    'moderator','mod','staff','team','official','fivestarz','proofsignals','null','undefined'
  ]) then
    raise exception 'that handle is reserved';
  end if;

  -- offensive handles: reuse the Phase-7 scanner (split _/- so multi-word
  -- blocked phrases delimited by separators are caught too)
  if public.scan_text_for_blocked_phrases(replace(replace(v_handle::text, '-', ' '), '_', ' ')) = 'block' then
    raise exception 'that handle is not allowed';
  end if;

  begin
    update public.user_profiles set public_username = v_handle where user_id = v_uid;
  exception when unique_violation then
    raise exception 'that handle is already taken';
  end;
end;
$$;

-- Toggle profile publishing controls. null = leave unchanged. Enabling a PAID
-- toggle checks the plan gate; free toggles are never gated. Turning a toggle
-- off is always allowed.
create or replace function public.update_publishing_settings(
  p_profile_public_enabled boolean default null,
  p_searchable_public_profile boolean default null,
  p_show_logo boolean default null,
  p_show_location boolean default null,
  p_show_stats boolean default null,
  p_show_feedback_excerpts boolean default null,
  p_show_public_videos boolean default null,
  p_show_marketplace_offers boolean default null,
  p_show_external_links boolean default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plan_code;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();

  select plan_code into v_plan from public.user_profiles where user_id = v_uid;

  if p_searchable_public_profile is true and not public.plan_feature_enabled(v_plan, 'public_profile_indexing_enabled') then
    raise exception 'your plan does not include public search indexing';
  end if;
  if p_show_feedback_excerpts is true and not public.plan_feature_enabled(v_plan, 'public_feedback_excerpts_enabled') then
    raise exception 'your plan does not include public feedback excerpts';
  end if;
  if p_show_public_videos is true and not public.plan_feature_enabled(v_plan, 'public_video_enabled') then
    raise exception 'your plan does not include public video clips';
  end if;
  if p_show_marketplace_offers is true and not public.plan_feature_enabled(v_plan, 'proof_lab_listings_enabled') then
    raise exception 'your plan does not include Proof Lab offers';
  end if;

  update public.user_profiles set
    profile_public_enabled     = coalesce(p_profile_public_enabled, profile_public_enabled),
    searchable_public_profile  = coalesce(p_searchable_public_profile, searchable_public_profile),
    show_logo                  = coalesce(p_show_logo, show_logo),
    show_location              = coalesce(p_show_location, show_location),
    show_stats                 = coalesce(p_show_stats, show_stats),
    show_feedback_excerpts     = coalesce(p_show_feedback_excerpts, show_feedback_excerpts),
    show_public_videos         = coalesce(p_show_public_videos, show_public_videos),
    show_marketplace_offers    = coalesce(p_show_marketplace_offers, show_marketplace_offers),
    show_external_links        = coalesce(p_show_external_links, show_external_links)
  where user_id = v_uid;
end;
$$;

-- Set an asset's audience. Owner-only. Publishing (public) requires the asset
-- to be moderation-clean (can't publish removed content).
create or replace function public.set_asset_visibility(
  p_asset_id uuid,
  p_visibility public.asset_visibility
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mod text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();

  select moderation_status into v_mod from public.assets
    where id = p_asset_id and owner_user_id = v_uid;
  if not found then raise exception 'asset not found'; end if;
  if p_visibility = 'public' and v_mod <> 'ok' then
    raise exception 'this asset cannot be made public';
  end if;

  update public.assets set visibility = p_visibility where id = p_asset_id;
end;
$$;

-- Set an asset's brand visibility. Owner-only. Hiding identity is a paid
-- feature (modeled now; enforcement of the actual hiding is wired later).
create or replace function public.set_asset_brand_visibility(
  p_asset_id uuid,
  p_value public.brand_visibility
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plan_code;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();

  if not exists (select 1 from public.assets where id = p_asset_id and owner_user_id = v_uid) then
    raise exception 'asset not found';
  end if;

  if p_value = 'hidden_until_feedback_complete' then
    select plan_code into v_plan from public.user_profiles where user_id = v_uid;
    if not public.plan_feature_enabled(v_plan, 'brand_visibility_enabled') then
      raise exception 'your plan does not include hide-identity';
    end if;
  end if;

  update public.assets set brand_visibility = p_value where id = p_asset_id;
end;
$$;

revoke all on function public.claim_public_username(text) from public;
revoke all on function public.update_publishing_settings(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public;
revoke all on function public.set_asset_visibility(uuid, public.asset_visibility) from public;
revoke all on function public.set_asset_brand_visibility(uuid, public.brand_visibility) from public;
grant execute on function public.claim_public_username(text) to authenticated;
grant execute on function public.update_publishing_settings(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.set_asset_visibility(uuid, public.asset_visibility) to authenticated;
grant execute on function public.set_asset_brand_visibility(uuid, public.brand_visibility) to authenticated;
