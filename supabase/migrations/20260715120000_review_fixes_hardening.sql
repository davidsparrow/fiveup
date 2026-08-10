-- Review fixes for Phases 11–13 (code-review findings, 2026-07-15).
--
-- 1. create_match: restore the assert_active_caller() suspension guard that
--    Phase 13's recreation (20260311120000, built from a pre-7c body) dropped.
-- 2. eligible_match_candidates: make the demo wall symmetric — the old clause
--    (up.is_demo = false or caller.is_demo) let demo callers see real members
--    as candidates that create_match then always rejects, and let real member
--    data leak into the /demo screenshot pipeline.
-- 3. get_public_assets: exclude brand-hidden assets — the owner's public
--    profile page was listing (and linking) assets whose /a/[slug] page says
--    "Shared anonymously", defeating the brand_visibility feature.
-- 4. get_public_feedback: gate product_name — only name assets that are
--    public + moderation-ok + not brand-hidden, and listings that are
--    moderation-ok. Previously a private or moderator-removed asset's name
--    could render on the owner's public profile.
-- 5. get_public_profile / get_public_asset: expose is_demo / owner_is_demo so
--    the demo disclosure banner keys off the DB column instead of handle
--    strings (drop + recreate: return signatures change).
-- 6. claim_public_username: reserve 'demo' and the 'demo-' prefix for demo
--    accounts (the seeder claims handles AFTER is_demo is set, so it still
--    works; real members can no longer claim a freed demo handle).
-- 7. user_profiles: revoke direct write grants from anon/authenticated. All
--    legitimate writes go through SECURITY DEFINER RPCs; the blanket
--    profiles_update_self RLS policy otherwise lets any member set their own
--    is_demo, plan_code, etc. via PostgREST.
-- 8. proof_lab_listings RLS + request_proof_lab_deal: enforce the demo/real
--    wall server-side (it existed only in the app-side query filter) and keep
--    demo sellers off the fundraiser leaderboard.
-- 9. Partial index backing list_searchable_assets() — /sitemap.xml is
--    force-dynamic, so each crawl was a sequential scan of assets.
--
-- Idempotent / safely re-runnable.

-- ═══════════════════════════════════════════════════════════════════════════
-- Demo-flag helpers (SECURITY DEFINER so RLS policies can consult
-- user_profiles without being subject to its own row policies).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.user_is_demo(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_demo from public.user_profiles where user_id = p_user_id), false);
$$;

create or replace function public.viewer_is_demo()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.user_is_demo(auth.uid());
$$;

revoke all on function public.user_is_demo(uuid) from public;
revoke all on function public.viewer_is_demo() from public;
grant execute on function public.user_is_demo(uuid) to anon, authenticated;
grant execute on function public.viewer_is_demo() to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. user_profiles: no direct writes for client roles. Profile rows are
--    created by the handle_new_auth_user trigger and mutated only through
--    SECURITY DEFINER RPCs (update_my_profile, update_publishing_settings,
--    claim_public_username, ...), so anon/authenticated never need table-level
--    write privileges. SELECT stays RLS-governed as before.
-- ═══════════════════════════════════════════════════════════════════════════

revoke insert, update, delete, truncate on public.user_profiles from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. create_match — same body as 20260311120000 with the 7c suspension guard
--    restored (perform public.assert_active_caller() after the auth check).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.create_match(
  p_other_user_id uuid,
  p_my_asset_id uuid,
  p_their_asset_id uuid,
  p_source text default 'browse',
  p_feedback_due_at timestamptz default null,
  p_previous_match_id uuid default null,
  p_my_blocked_channels text[] default '{}'::text[],
  p_their_blocked_channels text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_user_id uuid := auth.uid();
  v_caller_profile public.user_profiles%rowtype;
  v_other_profile public.user_profiles%rowtype;
  v_caller_usage public.user_monthly_usage%rowtype;
  v_other_usage public.user_monthly_usage%rowtype;
  v_usage_month date := public.month_bucket_start(now());
  v_match_id uuid;
  v_caller_total_limit integer;
  v_other_total_limit integer;
  v_caller_browse_limit integer;
  v_shortest_path_degree integer;
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;
  perform public.assert_active_caller();

  if v_caller_user_id = p_other_user_id then
    raise exception 'cannot create a match with yourself';
  end if;

  if p_source not in ('browse', 'queued') then
    raise exception 'source must be browse or queued for member-created matches';
  end if;

  select * into v_caller_profile
  from public.user_profiles
  where user_id = v_caller_user_id;

  if not found then
    raise exception 'caller profile not found';
  end if;

  select * into v_other_profile
  from public.user_profiles
  where user_id = p_other_user_id;

  if not found then
    raise exception 'target profile not found';
  end if;

  -- Demo accounts live alongside real members but never match across the line.
  if v_caller_profile.is_demo <> v_other_profile.is_demo then
    raise exception 'demo accounts can only match with other demo accounts';
  end if;

  if not exists (
    select 1
    from public.assets a
    where a.id = p_my_asset_id
      and a.owner_user_id = v_caller_user_id
      and a.status = 'active'
  ) then
    raise exception 'your selected asset must exist and be active';
  end if;

  if not exists (
    select 1
    from public.assets a
    where a.id = p_their_asset_id
      and a.owner_user_id = p_other_user_id
      and a.status = 'active'
  ) then
    raise exception 'their selected asset must exist and be active';
  end if;

  if exists (
    select 1
    from public.matches m
    where ((m.member_a_user_id = v_caller_user_id and m.member_b_user_id = p_other_user_id)
        or (m.member_a_user_id = p_other_user_id and m.member_b_user_id = v_caller_user_id))
      and m.status not in ('cancelled', 'completed')
  ) then
    raise exception 'an active match already exists between these users';
  end if;

  if exists (
    select 1
    from public.matches m
    where (m.member_a_user_id = v_caller_user_id and m.member_b_user_id = p_other_user_id)
       or (m.member_a_user_id = p_other_user_id and m.member_b_user_id = v_caller_user_id)
  ) then
    if p_previous_match_id is null then
      raise exception 'a prior match exists; pass previous_match_id to create a semi-duplicate match';
    end if;

    if not exists (
      select 1
      from public.matches m
      where m.id = p_previous_match_id
        and (
          (m.member_a_user_id = v_caller_user_id and m.member_b_user_id = p_other_user_id)
          or
          (m.member_a_user_id = p_other_user_id and m.member_b_user_id = v_caller_user_id)
        )
    ) then
      raise exception 'previous_match_id must reference a prior match between these users';
    end if;

    if not v_caller_profile.allow_semi_duplicate_matches or not v_other_profile.allow_semi_duplicate_matches then
      raise exception 'semi-duplicate matching is disabled for one of these members';
    end if;

    if v_caller_profile.plan_code = 'sprout' and v_other_profile.plan_code <> 'sprout' and not v_other_profile.allow_semi_duplicate_with_free then
      raise exception 'the paid member has not opted in to semi-duplicate matching with free members';
    end if;

    if v_other_profile.plan_code = 'sprout' and v_caller_profile.plan_code <> 'sprout' and not v_caller_profile.allow_semi_duplicate_with_free then
      raise exception 'you have not opted in to semi-duplicate matching with free members';
    end if;
  else
    if not public.pair_respects_separation_preferences(v_caller_user_id, p_other_user_id) then
      v_shortest_path_degree := public.member_shortest_path_degree(v_caller_user_id, p_other_user_id, 4);
      raise exception 'this member is within your configured degrees-of-separation threshold (shortest path degree: %)', v_shortest_path_degree;
    end if;

    if p_previous_match_id is not null then
      raise exception 'previous_match_id was provided but no prior match exists between these users';
    end if;

    v_shortest_path_degree := public.member_shortest_path_degree(v_caller_user_id, p_other_user_id, 4);
  end if;

  if not public.plan_feature_enabled(v_caller_profile.plan_code, 'browse_matches_per_month') then
    raise exception 'your plan does not include browse matches';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_my_blocked_channels, '{}'::text[])) ch(channel_name)
    where not exists (
      select 1
      from public.asset_channels ac
      where ac.asset_id = p_my_asset_id
        and ac.channel_name = ch.channel_name
    )
  ) then
    raise exception 'all of your blocked channels must belong to your selected asset';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_their_blocked_channels, '{}'::text[])) ch(channel_name)
    where not exists (
      select 1
      from public.asset_channels ac
      where ac.asset_id = p_their_asset_id
        and ac.channel_name = ch.channel_name
    )
  ) then
    raise exception 'all of their blocked channels must belong to their selected asset';
  end if;

  insert into public.user_monthly_usage (user_id, usage_month)
  values (v_caller_user_id, v_usage_month), (p_other_user_id, v_usage_month)
  on conflict (user_id, usage_month) do nothing;

  select * into v_caller_usage
  from public.user_monthly_usage
  where user_id = v_caller_user_id
    and usage_month = v_usage_month
  for update;

  select * into v_other_usage
  from public.user_monthly_usage
  where user_id = p_other_user_id
    and usage_month = v_usage_month
  for update;

  v_caller_total_limit := public.plan_total_match_limit(v_caller_profile.plan_code);
  v_other_total_limit := public.plan_total_match_limit(v_other_profile.plan_code);
  v_caller_browse_limit := coalesce(public.plan_feature_limit(v_caller_profile.plan_code, 'browse_matches_per_month'), 0);

  if p_source = 'browse' then
    if v_caller_browse_limit <= 0 then
      raise exception 'your plan has no browse quota';
    end if;

    if v_caller_usage.browse_matches_initiated >= v_caller_browse_limit then
      raise exception 'you have used all browse matches for this month';
    end if;

    if v_caller_total_limit > 0 and v_caller_usage.total_matches_started >= v_caller_total_limit then
      raise exception 'you have reached your monthly match limit';
    end if;

    if v_other_total_limit > 0 and v_other_usage.total_matches_started >= v_other_total_limit then
      raise exception 'the other member is at their monthly limit; create a queued match instead';
    end if;
  else
    if v_caller_browse_limit <= 0 then
      raise exception 'your plan has no browse queue feature';
    end if;

    if (v_caller_total_limit <= 0 or v_caller_usage.total_matches_started < v_caller_total_limit)
       and (v_other_total_limit <= 0 or v_other_usage.total_matches_started < v_other_total_limit) then
      raise exception 'queued matches are only needed when at least one member is at their monthly limit';
    end if;
  end if;

  insert into public.matches (
    member_a_user_id,
    member_b_user_id,
    member_a_asset_id,
    member_b_asset_id,
    source,
    status,
    feedback_due_at,
    is_semi_duplicate,
    previous_match_id,
    separation_degree_used
  )
  values (
    v_caller_user_id,
    p_other_user_id,
    p_my_asset_id,
    p_their_asset_id,
    p_source,
    case when p_source = 'queued' then 'queued_next_month'::public.match_status else 'matched'::public.match_status end,
    p_feedback_due_at,
    p_previous_match_id is not null,
    p_previous_match_id,
    -- Cap at 3: the column check allows 1–3, but the actual shortest path can
    -- legitimately be 4 (found within the preference search window).
    least(coalesce(v_shortest_path_degree, v_caller_profile.degrees_of_separation + 1), 3)::smallint
  )
  returning id into v_match_id;

  insert into public.match_blocked_channels (match_id, blocked_for_user_id, asset_id, channel_name)
  select v_match_id, v_caller_user_id, p_my_asset_id, ch.channel_name
  from (
    select distinct channel_name
    from unnest(coalesce(p_my_blocked_channels, '{}'::text[])) as t(channel_name)
  ) ch;

  insert into public.match_blocked_channels (match_id, blocked_for_user_id, asset_id, channel_name)
  select v_match_id, p_other_user_id, p_their_asset_id, ch.channel_name
  from (
    select distinct channel_name
    from unnest(coalesce(p_their_blocked_channels, '{}'::text[])) as t(channel_name)
  ) ch;

  if p_source = 'browse' then
    update public.user_monthly_usage
    set total_matches_started = total_matches_started + 1,
        browse_matches_initiated = browse_matches_initiated + 1
    where user_id = v_caller_user_id
      and usage_month = v_usage_month;

    update public.user_monthly_usage
    set total_matches_started = total_matches_started + 1
    where user_id = p_other_user_id
      and usage_month = v_usage_month;
  end if;

  return v_match_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. eligible_match_candidates — symmetric demo wall: candidates must be on
--    the same side of the demo line as the caller (mirrors create_match).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.eligible_match_candidates(
  p_my_asset_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  candidate_user_id uuid,
  candidate_asset_id uuid,
  candidate_display_name text,
  candidate_plan_code public.plan_code,
  candidate_asset_name text,
  candidate_asset_type public.asset_type,
  shortest_path_degree integer,
  respects_separation_preference boolean,
  prior_match_count integer,
  has_active_match boolean,
  would_queue boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_user_id uuid := auth.uid();
  v_caller_profile public.user_profiles%rowtype;
  v_usage_month date := public.month_bucket_start(now());
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;

  select * into v_caller_profile
  from public.user_profiles
  where user_id = v_caller_user_id;

  if not found then
    raise exception 'caller profile not found';
  end if;

  if not exists (
    select 1
    from public.assets a
    where a.id = p_my_asset_id
      and a.owner_user_id = v_caller_user_id
      and a.status = 'active'
  ) then
    raise exception 'your selected asset must exist and be active';
  end if;

  return query
  with candidate_base as (
    select
      up.user_id as candidate_user_id,
      a.id as candidate_asset_id,
      up.display_name as candidate_display_name,
      up.plan_code as candidate_plan_code,
      a.name as candidate_asset_name,
      a.asset_type as candidate_asset_type,
      up.degrees_of_separation as candidate_degree_pref,
      coalesce(umu.total_matches_started, 0) as candidate_matches_started,
      public.plan_total_match_limit(up.plan_code) as candidate_match_limit,
      exists (
        select 1
        from public.matches m
        where ((m.member_a_user_id = v_caller_user_id and m.member_b_user_id = up.user_id)
            or (m.member_a_user_id = up.user_id and m.member_b_user_id = v_caller_user_id))
          and m.status not in ('cancelled', 'completed')
      ) as has_active_match,
      (
        select count(*)::integer
        from public.matches m
        where (m.member_a_user_id = v_caller_user_id and m.member_b_user_id = up.user_id)
           or (m.member_a_user_id = up.user_id and m.member_b_user_id = v_caller_user_id)
      ) as prior_match_count,
      public.member_shortest_path_degree(v_caller_user_id, up.user_id, 4) as shortest_path_degree
    from public.user_profiles up
    join public.assets a
      on a.owner_user_id = up.user_id
     and a.status = 'active'
    left join public.user_monthly_usage umu
      on umu.user_id = up.user_id
     and umu.usage_month = v_usage_month
    where up.user_id <> v_caller_user_id
      -- Demo and real members never see each other as candidates (create_match
      -- enforces the same wall, so anything else would be an unusable result).
      and up.is_demo = v_caller_profile.is_demo
  )
  select
    cb.candidate_user_id,
    cb.candidate_asset_id,
    cb.candidate_display_name,
    cb.candidate_plan_code,
    cb.candidate_asset_name,
    cb.candidate_asset_type,
    cb.shortest_path_degree,
    (cb.shortest_path_degree is null or cb.shortest_path_degree > greatest(v_caller_profile.degrees_of_separation, cb.candidate_degree_pref) + 1) as respects_separation_preference,
    cb.prior_match_count,
    cb.has_active_match,
    (cb.candidate_match_limit > 0 and cb.candidate_matches_started >= cb.candidate_match_limit) as would_queue
  from candidate_base cb
  order by
    (cb.has_active_match = false) desc,
    (cb.shortest_path_degree is null) desc,
    cb.shortest_path_degree asc nulls last,
    cb.prior_match_count asc,
    cb.candidate_display_name asc,
    cb.candidate_asset_name asc
  limit greatest(coalesce(p_limit, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.create_match(uuid, uuid, uuid, text, timestamptz, uuid, text[], text[]) from public;
revoke all on function public.eligible_match_candidates(uuid, integer, integer) from public;
grant execute on function public.create_match(uuid, uuid, uuid, text, timestamptz, uuid, text[], text[]) to authenticated;
grant execute on function public.eligible_match_candidates(uuid, integer, integer) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. get_public_assets — hide brand-hidden assets from the owner's public
--    profile (same predicate get_public_asset uses to hide the owner).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.get_public_assets(p_username citext)
returns table (name text, description text, asset_type text, public_slug citext, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select a.name, a.description, a.asset_type::text, a.public_slug, a.created_at
  from public.user_profiles up
  join public.assets a on a.owner_user_id = up.user_id
  where up.public_username = p_username and up.profile_public_enabled
    and up.account_status <> 'suspended' and up.moderation_status = 'ok'
    and a.visibility = 'public' and a.moderation_status = 'ok'
    -- A brand-hidden asset's /a/ page says "Shared anonymously"; listing it
    -- here would hand visitors the owner↔asset association anyway.
    and not (a.brand_visibility = 'hidden_until_feedback_complete'
             and public.plan_feature_enabled(up.plan_code, 'brand_visibility_enabled'))
  order by a.created_at desc;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. get_public_feedback — product_name only when the reviewed asset/listing
--    is itself publicly presentable. The feedback row still shows; only the
--    name is withheld (null → UI falls back to "Reviewed product").
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.get_public_feedback(p_username citext)
returns table (kind text, body text, stars smallint, media_url text, created_at timestamptz, source text, product_name text)
language sql stable security definer set search_path = public
as $$
  with up as (
    select * from public.user_profiles
    where public_username = p_username and profile_public_enabled
      and account_status <> 'suspended' and moderation_status = 'ok'
  )
  select 'excerpt'::text, fs.written_feedback, fs.stars::smallint, null::text, fs.submitted_at, 'match'::text,
    case when a.visibility = 'public' and a.moderation_status = 'ok'
          and not (a.brand_visibility = 'hidden_until_feedback_complete'
                   and public.plan_feature_enabled(up.plan_code, 'brand_visibility_enabled'))
         then a.name end
  from up
  join public.feedback_submissions fs on fs.reviewee_user_id = up.user_id
  join public.assets a on a.id = fs.asset_id
  join public.public_feedback_permissions pp on pp.source_type = 'match_feedback' and pp.source_id = fs.id and pp.approved
  where up.show_feedback_excerpts and public.plan_feature_enabled(up.plan_code, 'public_feedback_excerpts_enabled')
    and fs.moderation_status = 'ok'
    and nullif(btrim(coalesce(fs.written_feedback, '')), '') is not null
  union all
  select 'excerpt'::text, r.written_review, r.stars, null::text, r.created_at, 'engaged_review'::text,
    case when l.moderation_status = 'ok' then l.title end
  from up
  join public.proof_lab_reviews r on r.reviewee_user_id = up.user_id
  join public.proof_lab_listings l on l.id = r.listing_id
  join public.public_feedback_permissions pp on pp.source_type = 'engaged_review' and pp.source_id = r.id and pp.approved
  where up.show_feedback_excerpts and public.plan_feature_enabled(up.plan_code, 'public_feedback_excerpts_enabled')
    and r.moderation_status = 'ok'
    and nullif(btrim(coalesce(r.written_review, '')), '') is not null
  union all
  select 'clip'::text, fs.written_feedback, fs.stars::smallint, fs.media_url, fs.submitted_at, 'match'::text,
    case when a.visibility = 'public' and a.moderation_status = 'ok'
          and not (a.brand_visibility = 'hidden_until_feedback_complete'
                   and public.plan_feature_enabled(up.plan_code, 'brand_visibility_enabled'))
         then a.name end
  from up
  join public.feedback_submissions fs on fs.reviewee_user_id = up.user_id
  join public.assets a on a.id = fs.asset_id
  join public.public_feedback_permissions pp on pp.source_type = 'match_feedback' and pp.source_id = fs.id and pp.approved
  where up.show_public_videos and public.plan_feature_enabled(up.plan_code, 'public_video_enabled')
    and fs.moderation_status = 'ok'
    and nullif(btrim(coalesce(fs.media_url, '')), '') is not null;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5a. get_public_profile — add is_demo (drop + recreate: signature change).
--     The /u/[username] demo banner keys off this instead of the handle.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.get_public_profile(citext);

create function public.get_public_profile(p_username citext)
returns table (
  display_name text,
  public_username citext,
  bio text,
  avatar_url text,
  location_text text,
  feedback_rating_avg numeric,
  feedback_rating_count integer,
  proof_lab_rating_avg numeric,
  proof_lab_rating_count integer,
  categories text[],
  searchable boolean,
  is_demo boolean
)
language sql stable security definer set search_path = public
as $$
  select
    up.display_name,
    up.public_username,
    up.bio,
    case when up.show_logo then up.avatar_url end,
    case when up.show_location then up.location_text end,
    case when up.show_stats then up.feedback_rating_avg end,
    case when up.show_stats then up.feedback_rating_count end,
    case when up.show_stats then up.proof_lab_rating_avg end,
    case when up.show_stats then up.proof_lab_rating_count end,
    coalesce((
      select array_agg(distinct cat order by cat) from (
        select c.label as cat
        from public.proof_lab_listings l
        join public.proof_lab_categories c on c.slug = l.category_slug
        where l.seller_user_id = up.user_id and l.status = 'active' and l.moderation_status = 'ok'
        union
        select initcap(replace(a.asset_type::text, '_', ' '))
        from public.assets a
        where a.owner_user_id = up.user_id and a.visibility = 'public' and a.moderation_status = 'ok'
      ) d
    ), '{}'::text[]),
    up.searchable_public_profile and public.plan_feature_enabled(up.plan_code, 'public_profile_indexing_enabled'),
    up.is_demo
  from public.user_profiles up
  where up.public_username = p_username
    and up.profile_public_enabled
    and up.account_status <> 'suspended'
    and up.moderation_status = 'ok';
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5b. get_public_asset — add owner_is_demo (drop + recreate: signature
--     change). Returned even when the owner is brand-hidden, so the demo
--     disclosure can never disappear (demo-ness is not identity).
-- ═══════════════════════════════════════════════════════════════════════════

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
  indexable boolean,
  owner_is_demo boolean
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
    (a.searchable_public and public.plan_feature_enabled(up.plan_code, 'public_profile_indexing_enabled')),
    up.is_demo
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

revoke all on function public.get_public_profile(citext) from public;
revoke all on function public.get_public_asset(citext) from public;
revoke all on function public.get_public_assets(citext) from public;
revoke all on function public.get_public_feedback(citext) from public;
grant execute on function public.get_public_profile(citext) to anon, authenticated;
grant execute on function public.get_public_asset(citext) to anon, authenticated;
grant execute on function public.get_public_assets(citext) to anon, authenticated;
grant execute on function public.get_public_feedback(citext) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. claim_public_username — reserve the demo namespace for demo accounts.
--    (The seeder sets is_demo via service role before claiming, so it passes.)
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- the demo namespace belongs to seeded demo accounts (banner + tour links
  -- key off it) — a freed 'demo-*' handle must not be claimable by a real user
  if (v_handle::text = 'demo' or v_handle::text like 'demo-%')
     and not public.user_is_demo(v_uid) then
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

revoke all on function public.claim_public_username(text) from public;
grant execute on function public.claim_public_username(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8a. proof_lab_listings RLS — the demo/real wall, server-side. Sellers see
--     their own rows and moderators see everything, as before; otherwise a
--     listing is visible only on the viewer's side of the demo line. The anon
--     teaser RPCs are SECURITY DEFINER and unaffected.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "proof_lab_listings_select_visible" on public.proof_lab_listings;
create policy "proof_lab_listings_select_visible" on public.proof_lab_listings for select to authenticated
using (
  seller_user_id = auth.uid()
  or public.is_moderator()
  or (
    status = 'active' and moderation_status = 'ok'
    and public.user_is_demo(seller_user_id) = public.viewer_is_demo()
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8b. request_proof_lab_deal — same body as 7c with the demo wall added after
--     the listing lookup.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.request_proof_lab_deal(
  p_listing_id uuid,
  p_requester_email text,
  p_note text default null::text,
  p_timeframe proof_lab_timeframe default 'soon'::proof_lab_timeframe
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_status text;
  v_id uuid;
  v_sev public.moderation_severity;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();
  if nullif(btrim(coalesce(p_requester_email, '')), '') is null then
    raise exception 'contact email is required';
  end if;

  v_sev := public.scan_text_for_blocked_phrases(p_note);
  if v_sev = 'block' then
    raise exception 'this content contains prohibited language and cannot be posted';
  end if;

  select seller_user_id, status into v_seller, v_status
  from public.proof_lab_listings where id = p_listing_id;
  if not found then raise exception 'listing not found'; end if;
  if v_status <> 'active' then raise exception 'this listing is not currently available'; end if;
  if v_seller = v_uid then raise exception 'you cannot request your own listing'; end if;

  -- Demo and real accounts never transact across the line (mirrors create_match).
  if public.user_is_demo(v_seller) <> public.user_is_demo(v_uid) then
    raise exception 'demo listings are only available to demo accounts';
  end if;

  insert into public.proof_lab_deal_requests (
    listing_id, requester_user_id, seller_user_id, requester_email, note, timeframe
  ) values (
    p_listing_id, v_uid, v_seller, p_requester_email, p_note, p_timeframe
  ) returning id into v_id;

  if v_sev = 'flag' then
    perform public.record_auto_flag('deal_note', v_id, v_uid, 'flag');
  end if;

  return v_id;
end;
$$;

revoke all on function public.request_proof_lab_deal(uuid, text, text, proof_lab_timeframe) from public;
grant execute on function public.request_proof_lab_deal(uuid, text, text, proof_lab_timeframe) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8c. proof_lab_fundraiser_leaderboard — never rank demo sellers.
-- ═══════════════════════════════════════════════════════════════════════════

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
    and not up.is_demo
    and (p_since is null or d.completed_at >= p_since)
  group by d.seller_user_id, up.display_name
  order by total_pledged_cents desc, completed_deals desc;
$$;

revoke all on function public.proof_lab_fundraiser_leaderboard(timestamptz) from public;
grant execute on function public.proof_lab_fundraiser_leaderboard(timestamptz) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Partial index backing list_searchable_assets(). /sitemap.xml is
--    force-dynamic, so every crawler hit runs this filter.
-- ═══════════════════════════════════════════════════════════════════════════

create index if not exists idx_assets_searchable_sitemap
  on public.assets (updated_at desc)
  where searchable_public and visibility = 'public' and moderation_status = 'ok';
