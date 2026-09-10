-- Phase 14: safety & reputation fixes (long-documented follow-ups).
--
-- 1. eligible_match_candidates: exclude suspended members and moderation-
--    removed assets from the candidate pool (Phase-7 gap logged in the
--    Phase-13 doc). 'warned' members stay eligible — every write RPC gates
--    only on suspension. We deliberately do NOT filter up.moderation_status:
--    on user_profiles it means "bio removed" (a field-level render flag from
--    7c), not a hidden account — the member remains active for internal
--    matching.
-- 2. create_match: enforce the same walls server-side (the candidate filter
--    alone is bypassable by calling the RPC directly) — reject a suspended
--    target and moderation-removed assets on either side.
-- 3. matches.separation_degree_used: widen the check to 1–4 and store the
--    actual shortest-path degree. Phase 13 capped the stored value at 3
--    because the original column check only allowed 1–3, but the search
--    window is 4 (max preference 3 + 1), so 4 is a legitimate result.
--    Existing rows stored at the cap stay as-is (the true degree at creation
--    time is unrecoverable).
-- 4. Reputation aggregates recomputed on moderation (the documented 7c
--    follow-up): refresh_profile_feedback_rating now ignores ratings whose
--    underlying feedback_submissions row is removed; a new
--    refresh_profile_proof_lab_rating helper does the same for
--    proof_lab_reviews; create_proof_lab_review and resolve_flag call them.
--    A new restore_content action reverses remove_content (and recomputes).
--    One-time backfill fixes averages already skewed by removed rows.
-- 5. Suspension walls on remaining member surfaces: fundraiser leaderboard
--    and the proof_lab_listings SELECT policy (via a user_is_suspended
--    helper mirroring user_is_demo).
-- 6. get_public_asset: append updated_at (drop + recreate: signature change)
--    so the /a/[slug] page can emit CreativeWork JSON-LD with dateModified.
--
-- Idempotent / safely re-runnable.

-- ── New moderation action (used only inside plpgsql bodies below, never as a
--    DML literal in this transaction — same pattern as 7c's 'moderator') ─────
alter type public.moderation_action_type add value if not exists 'restore_content';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. matches.separation_degree_used — widen the check to 1–4. The inline
--    column check's auto-generated name is looked up rather than assumed.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_name text;
begin
  select conname into v_name
  from pg_constraint
  where conrelid = 'public.matches'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%separation_degree_used%';
  if v_name is not null and v_name <> 'matches_separation_degree_used_range' then
    execute format('alter table public.matches drop constraint %I', v_name);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.matches'::regclass
      and conname = 'matches_separation_degree_used_range'
  ) then
    alter table public.matches
      add constraint matches_separation_degree_used_range
      check (separation_degree_used between 1 and 4);
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 + 3. create_match — same body as 20260715120000 with three diffs:
--    • reject a suspended target (mirrors assert_active_caller on the caller)
--    • both asset checks also require moderation_status = 'ok'
--    • store the actual degree (cap now 4, the search-window maximum)
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
-- 1. eligible_match_candidates — same body as 20260715120000 with the
--    suspension wall and asset moderation filter added to candidate_base.
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 5a. user_is_suspended — RLS-safe standing lookup (mirrors user_is_demo).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.user_is_suspended(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select account_status = 'suspended' from public.user_profiles where user_id = p_user_id), false);
$$;

revoke all on function public.user_is_suspended(uuid) from public;
grant execute on function public.user_is_suspended(uuid) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5b. proof_lab_listings SELECT policy — same shape as 20260715120000 with
--     suspended sellers' listings hidden from other members (sellers and
--     moderators still see them).
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "proof_lab_listings_select_visible" on public.proof_lab_listings;
create policy "proof_lab_listings_select_visible" on public.proof_lab_listings for select to authenticated
using (
  seller_user_id = auth.uid()
  or public.is_moderator()
  or (
    status = 'active' and moderation_status = 'ok'
    and public.user_is_demo(seller_user_id) = public.viewer_is_demo()
    and not public.user_is_suspended(seller_user_id)
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5c. proof_lab_fundraiser_leaderboard — same body as 20260715120000, also
--     never ranking suspended sellers.
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
    and up.account_status <> 'suspended'
    and (p_since is null or d.completed_at >= p_since)
  group by d.seller_user_id, up.display_name
  order by total_pledged_cents desc, completed_deals desc;
$$;

revoke all on function public.proof_lab_fundraiser_leaderboard(timestamptz) from public;
grant execute on function public.proof_lab_fundraiser_leaderboard(timestamptz) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4a. refresh_profile_feedback_rating — only count ratings whose underlying
--     feedback submission is moderation-ok. The aggregate subquery always
--     returns one row, so the coalesce keeps the zero-out semantics (a user
--     left with no countable ratings lands on 0 / 0).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.refresh_profile_feedback_rating(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles up
  set feedback_rating_avg = coalesce(s.avg_stars, 0),
      feedback_rating_count = coalesce(s.rating_count, 0),
      updated_at = now()
  from (
    select round(avg(r.stars)::numeric, 2) as avg_stars,
           count(*)::integer as rating_count
    from public.member_feedback_ratings r
    join public.feedback_submissions fs
      on fs.id = r.feedback_submission_id
     and fs.moderation_status = 'ok'
    where r.rated_user_id = target_user_id
  ) s
  where up.user_id = target_user_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4b. refresh_profile_proof_lab_rating — the Proof Lab counterpart. Called
--     only from SECURITY DEFINER functions; no client grant.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.refresh_profile_proof_lab_rating(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles up
  set proof_lab_rating_avg = coalesce(s.avg_stars, 0),
      proof_lab_rating_count = coalesce(s.rating_count, 0),
      updated_at = now()
  from (
    select round(avg(stars), 2) as avg_stars,
           count(*)::integer as rating_count
    from public.proof_lab_reviews
    where reviewee_user_id = p_user_id
      and moderation_status = 'ok'
  ) s
  where up.user_id = p_user_id;
end;
$$;

revoke all on function public.refresh_profile_proof_lab_rating(uuid) from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4c. create_proof_lab_review — same body as 20260309140000 (the 7c version
--     with assert_active_caller) with the inline aggregate update replaced by
--     the shared helper.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.create_proof_lab_review(p_deal_id uuid, p_stars smallint, p_written text default null::text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_buyer uuid;
  v_listing uuid;
  v_status public.proof_lab_request_status;
  v_id uuid;
  v_sev public.moderation_severity;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();
  if p_stars is null or p_stars < 1 or p_stars > 5 then raise exception 'stars must be between 1 and 5'; end if;

  v_sev := public.scan_text_for_blocked_phrases(p_written);
  if v_sev = 'block' then
    raise exception 'this content contains prohibited language and cannot be posted';
  end if;

  select seller_user_id, requester_user_id, listing_id, status
    into v_seller, v_buyer, v_listing, v_status
    from public.proof_lab_deal_requests where id = p_deal_id;
  if not found then raise exception 'deal request not found'; end if;
  if v_uid <> v_buyer then raise exception 'only the buyer can review this deal'; end if;
  if v_status <> 'completed' then raise exception 'you can review a deal once it is completed'; end if;

  begin
    insert into public.proof_lab_reviews (deal_request_id, listing_id, reviewer_user_id, reviewee_user_id, stars, written_review)
    values (p_deal_id, v_listing, v_buyer, v_seller, p_stars, nullif(btrim(coalesce(p_written, '')), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'you have already reviewed this deal';
  end;

  perform public.refresh_profile_proof_lab_rating(v_seller);

  if v_sev = 'flag' then
    perform public.record_auto_flag('proof_lab_review', v_id, v_buyer, 'flag');
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_proof_lab_review(uuid, smallint, text) from public;
grant execute on function public.create_proof_lab_review(uuid, smallint, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4d. resolve_flag — same body as 20260309140000 with:
--     • remove_content recomputing the affected reputation aggregate
--     • a new restore_content action mirroring remove_content with 'ok'
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.resolve_flag(
  p_flag_id uuid,
  p_action public.moderation_action_type,
  p_notes text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_flag public.moderation_flags%rowtype;
  v_target uuid;
  v_rated_user uuid;
  v_reviewee uuid;
begin
  if not public.is_moderator() then raise exception 'moderator or admin only'; end if;

  select * into v_flag from public.moderation_flags where id = p_flag_id;
  if not found then raise exception 'flag not found'; end if;
  v_target := v_flag.content_owner_user_id;

  if p_action = 'dismiss' then
    update public.moderation_flags set status = 'dismissed' where id = p_flag_id;

  elsif p_action in ('remove_content', 'restore_content') then
    declare
      v_status text := case when p_action = 'remove_content' then 'removed' else 'ok' end;
    begin
      case v_flag.content_type
        when 'profile_bio'       then update public.user_profiles          set moderation_status = v_status where user_id = v_flag.content_id;
        when 'feedback'          then update public.feedback_submissions    set moderation_status = v_status where id = v_flag.content_id;
        when 'asset'             then update public.assets                  set moderation_status = v_status where id = v_flag.content_id;
        when 'proof_lab_listing' then update public.proof_lab_listings      set moderation_status = v_status where id = v_flag.content_id;
        when 'deal_note'         then update public.proof_lab_deal_requests set moderation_status = v_status where id = v_flag.content_id;
        when 'proof_lab_review'  then update public.proof_lab_reviews       set moderation_status = v_status where id = v_flag.content_id;
      end case;
    end;

    -- Removed/restored content changes what the stored reputation averages
    -- may count — recompute for the affected user (a feedback submission may
    -- have no rating yet, hence the found-guards).
    if v_flag.content_type = 'feedback' then
      select rated_user_id into v_rated_user
      from public.member_feedback_ratings
      where feedback_submission_id = v_flag.content_id;
      if found then
        perform public.refresh_profile_feedback_rating(v_rated_user);
      end if;
    elsif v_flag.content_type = 'proof_lab_review' then
      select reviewee_user_id into v_reviewee
      from public.proof_lab_reviews
      where id = v_flag.content_id;
      if found then
        perform public.refresh_profile_proof_lab_rating(v_reviewee);
      end if;
    end if;

    update public.moderation_flags set status = 'resolved' where id = p_flag_id;

  elsif p_action = 'warn_user' then
    update public.user_profiles set account_status = 'warned' where user_id = v_target;
    update public.moderation_flags set status = 'resolved' where id = p_flag_id;

  elsif p_action = 'suspend_user' then
    update public.user_profiles set account_status = 'suspended' where user_id = v_target;
    update public.moderation_flags set status = 'resolved' where id = p_flag_id;

  elsif p_action = 'reinstate_user' then
    update public.user_profiles set account_status = 'active' where user_id = v_target;
    update public.moderation_flags set status = 'resolved' where id = p_flag_id;
  end if;

  insert into public.moderation_actions (flag_id, admin_user_id, action, target_user_id, notes)
  values (p_flag_id, v_actor, p_action, v_target, nullif(btrim(coalesce(p_notes, '')), ''));
end;
$$;

revoke all on function public.resolve_flag(uuid, public.moderation_action_type, text) from public;
grant execute on function public.resolve_flag(uuid, public.moderation_action_type, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4e. One-time backfill — recompute for anyone whose stored averages still
--     count already-removed content.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  r record;
begin
  for r in
    select distinct mfr.rated_user_id as uid
    from public.member_feedback_ratings mfr
    join public.feedback_submissions fs on fs.id = mfr.feedback_submission_id
    where fs.moderation_status <> 'ok'
  loop
    perform public.refresh_profile_feedback_rating(r.uid);
  end loop;

  for r in
    select distinct plr.reviewee_user_id as uid
    from public.proof_lab_reviews plr
    where plr.moderation_status <> 'ok'
  loop
    perform public.refresh_profile_proof_lab_rating(r.uid);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. get_public_asset — same body as 20260715120000 with updated_at appended
--    (drop + recreate: signature change) for CreativeWork dateModified.
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
  owner_is_demo boolean,
  updated_at timestamptz
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
    up.is_demo,
    a.updated_at
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
