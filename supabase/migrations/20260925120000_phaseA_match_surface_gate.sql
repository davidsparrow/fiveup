-- Phase A: match-surface gate (Discord refactor, step 1 of 6).
--
-- The web matching surface (/browse, /account/preferences, member-initiated
-- create_match) is being shelved while Discord becomes the room where
-- matches, Squads and assists are made. Nothing is deleted: this migration
-- adds ONE switch and gates the two member-facing matching RPCs behind it.
-- Flipping the switch back to 'web' restores the whole web flow (see
-- docs/archive/web-matching.md).
--
--   • plan_feature_gates seed, feature_key = 'match_surface', one row per
--     plan, config = {"surface":"discord"}. Seeded with ON CONFLICT DO
--     NOTHING (not DO UPDATE like other seeds) so re-running this file can
--     never silently revert an admin's flip back to 'web'. The `enabled`
--     column is not consulted — only config.surface — to keep the restore
--     procedure a single-value edit.
--
--   • match_surface() — stable security-definer reader. Returns the
--     caller's plan's surface ('web' | 'discord'). Anonymous callers read
--     the sprout row (so nav can hide "Browse Members" consistently). A
--     missing row, null config, or unknown value falls back to 'web', so a
--     missing seed can never lock members out.
--
--   • create_match / eligible_match_candidates — same bodies as
--     20260826120000 with one first-line guard: proceed only when
--     match_surface() = 'web', the caller is the service role
--     (auth.role() = 'service_role', the Discord bot in Phase C), or
--     is_admin(). Otherwise raise 'matching is handled in Discord'.
--     Note: the service role still hits the existing auth.uid() checks
--     inside these bodies; the bot's own writer RPC lands in Phase C/D.
--
--   • matches.source convention — the plan describes source as free text,
--     but the initial schema declared an inline CHECK
--     (source in ('auto','browse','queued')). The constraint is recreated
--     to also allow 'discord' so Phase C/D can write Discord-originated
--     matches without a schema change then. Convention for the column:
--       'auto'    — system-initiated monthly match
--       'browse'  — member-initiated from the web Browse page
--       'queued'  — member-initiated, deferred to next month by quota
--       'discord' — created by the Discord bot (Squad pairing, /match)
--     create_match's own member-input check ('browse' | 'queued') is
--     unchanged; 'discord' is reserved for the service-role writer.
--
-- Idempotent / safely re-runnable.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The gate row, per plan
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.plan_feature_gates (plan_code, feature_key, enabled, limit_int, description, config)
values
  ('sprout',   'match_surface', true, null, 'Where members make matches: web (archived Browse flow) or discord', '{"surface":"discord"}'::jsonb),
  ('bloom',    'match_surface', true, null, 'Where members make matches: web (archived Browse flow) or discord', '{"surface":"discord"}'::jsonb),
  ('flourish', 'match_surface', true, null, 'Where members make matches: web (archived Browse flow) or discord', '{"surface":"discord"}'::jsonb)
on conflict (plan_code, feature_key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. match_surface() — the one switch, read per caller plan
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.match_surface()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when pfg.config ->> 'surface' in ('web', 'discord') then pfg.config ->> 'surface'
      else null
    end
    from public.plan_feature_gates pfg
    where pfg.feature_key = 'match_surface'
      and pfg.plan_code = coalesce(
        (select up.plan_code from public.user_profiles up where up.user_id = auth.uid()),
        'sprout'::public.plan_code
      )
  ), 'web');
$$;

revoke all on function public.match_surface() from public;
grant execute on function public.match_surface() to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. matches.source — allow 'discord' (see header for the convention)
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.matches'::regclass
      and conname = 'matches_source_check'
  ) then
    alter table public.matches drop constraint matches_source_check;
  end if;
  alter table public.matches
    add constraint matches_source_check
    check (source in ('auto', 'browse', 'queued', 'discord'));
end $$;

comment on column public.matches.source is
  'Who created the match: auto (system monthly), browse (web Browse page), queued (web, deferred by quota), discord (Discord bot / Squad pairing). See 20260925120000_phaseA_match_surface_gate.sql.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. create_match — same body as 20260826120000 plus the surface guard
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
  -- Phase A match-surface gate: member calls are refused unless this plan's
  -- surface is 'web'; the service role (Discord bot) and admins always pass.
  if not (public.match_surface() = 'web' or auth.role() = 'service_role' or public.is_admin()) then
    raise exception 'matching is handled in Discord';
  end if;

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

  -- Suspended members cannot be matched with (the caller side is covered by
  -- assert_active_caller above).
  if v_other_profile.account_status = 'suspended' then
    raise exception 'this member is not currently available for matching';
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
      and a.moderation_status = 'ok'
  ) then
    raise exception 'your selected asset must exist and be active';
  end if;

  if not exists (
    select 1
    from public.assets a
    where a.id = p_their_asset_id
      and a.owner_user_id = p_other_user_id
      and a.status = 'active'
      and a.moderation_status = 'ok'
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
    -- Cap at 4: the search window (max preference 3 + 1). The column check
    -- allows 1–4 since Phase 14; the coalesce fallback (pref + 1) is ≤ 4.
    least(coalesce(v_shortest_path_degree, v_caller_profile.degrees_of_separation + 1), 4)::smallint
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
-- 5. eligible_match_candidates — same body as 20260826120000 plus the
--    surface guard
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
  -- Phase A match-surface gate: member calls are refused unless this plan's
  -- surface is 'web'; the service role (Discord bot) and admins always pass.
  if not (public.match_surface() = 'web' or auth.role() = 'service_role' or public.is_admin()) then
    raise exception 'matching is handled in Discord';
  end if;

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
     and a.moderation_status = 'ok'
    left join public.user_monthly_usage umu
      on umu.user_id = up.user_id
     and umu.usage_month = v_usage_month
    where up.user_id <> v_caller_user_id
      -- Suspended members are not matchable (create_match rejects them too).
      -- 'warned' stays eligible, and up.moderation_status is deliberately NOT
      -- checked — on user_profiles it means "bio removed", not a hidden account.
      and up.account_status <> 'suspended'
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
