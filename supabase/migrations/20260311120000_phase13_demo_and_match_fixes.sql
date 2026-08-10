-- Phase 13: demo/matching hardening.
--
-- 1. user_profiles.is_demo — marks the seeded demo cast (seed-demo.mjs sets
--    it). Default false; real members are never demo.
-- 2. create_match: fix the 4°-separation crash — the RPC stored the actual
--    shortest-path degree (up to 4) but separation_degree_used is checked
--    between 1 and 3, so any pair at exactly 4° crashed the insert. The
--    stored value is now capped at 3. Also: demo accounts can only match
--    with other demo accounts (and real with real).
-- 3. eligible_match_candidates: demo members are excluded from real members'
--    browse/candidate results (demo callers still see them, which the
--    screenshot-capture tooling relies on). Anonymous public surfaces
--    (profile/asset pages, Proof Lab teaser) intentionally still include
--    demo content during the beta.
--
-- Idempotent: column add is guarded; functions are create-or-replace.

alter table public.user_profiles
  add column if not exists is_demo boolean not null default false;

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
      -- Demo members are invisible to real members; demo callers still see them.
      and (up.is_demo = false or v_caller_profile.is_demo)
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
