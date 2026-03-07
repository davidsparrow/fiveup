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
  v_match_id uuid;
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
  elsif p_previous_match_id is not null then
    raise exception 'previous_match_id was provided but no prior match exists between these users';
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
    greatest(v_caller_profile.degrees_of_separation, v_other_profile.degrees_of_separation)
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

  return v_match_id;
end;
$$;

create or replace function public.submit_feedback(
  p_match_id uuid,
  p_stars integer default null,
  p_written_feedback text default null,
  p_structured_feedback jsonb default '{}'::jsonb,
  p_media_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_user_id uuid := auth.uid();
  v_match public.matches%rowtype;
  v_reviewee_user_id uuid;
  v_asset_id uuid;
  v_feedback_id uuid;
  v_feedback_count integer;
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'match not found';
  end if;

  if v_match.status in ('cancelled', 'queued_next_month') then
    raise exception 'feedback cannot be submitted for this match status';
  end if;

  if v_caller_user_id = v_match.member_a_user_id then
    v_reviewee_user_id := v_match.member_b_user_id;
    v_asset_id := v_match.member_b_asset_id;
  elsif v_caller_user_id = v_match.member_b_user_id then
    v_reviewee_user_id := v_match.member_a_user_id;
    v_asset_id := v_match.member_a_asset_id;
  else
    raise exception 'only match participants can submit feedback';
  end if;

  insert into public.feedback_submissions (
    match_id,
    reviewer_user_id,
    reviewee_user_id,
    asset_id,
    stars,
    written_feedback,
    structured_feedback,
    media_url
  )
  values (
    p_match_id,
    v_caller_user_id,
    v_reviewee_user_id,
    v_asset_id,
    p_stars,
    p_written_feedback,
    coalesce(p_structured_feedback, '{}'::jsonb),
    p_media_url
  )
  on conflict (match_id, reviewer_user_id)
  do update set
    stars = excluded.stars,
    written_feedback = excluded.written_feedback,
    structured_feedback = excluded.structured_feedback,
    media_url = excluded.media_url
  returning id into v_feedback_id;

  select count(*) into v_feedback_count
  from public.feedback_submissions
  where match_id = p_match_id;

  update public.matches
  set status = case
    when status in ('posted', 'completed') then status
    when v_feedback_count >= 2 then 'awaiting_post'::public.match_status
    else 'feedback_pending'::public.match_status
  end
  where id = p_match_id;

  return v_feedback_id;
end;
$$;

create or replace function public.rate_member_feedback(
  p_feedback_submission_id uuid,
  p_stars integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_user_id uuid := auth.uid();
  v_feedback public.feedback_submissions%rowtype;
  v_rating_id uuid;
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;

  select * into v_feedback
  from public.feedback_submissions
  where id = p_feedback_submission_id;

  if not found then
    raise exception 'feedback submission not found';
  end if;

  if v_feedback.reviewee_user_id <> v_caller_user_id then
    raise exception 'only the feedback recipient can rate the member who submitted it';
  end if;

  insert into public.member_feedback_ratings (
    feedback_submission_id,
    rater_user_id,
    rated_user_id,
    stars
  )
  values (
    p_feedback_submission_id,
    v_caller_user_id,
    v_feedback.reviewer_user_id,
    p_stars
  )
  returning id into v_rating_id;

  return v_rating_id;
end;
$$;

create or replace function public.request_review_post(
  p_feedback_submission_id uuid,
  p_requested_channel_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_user_id uuid := auth.uid();
  v_feedback public.feedback_submissions%rowtype;
  v_request_id uuid;
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;

  if nullif(btrim(coalesce(p_requested_channel_name, '')), '') is null then
    raise exception 'requested channel is required';
  end if;

  select * into v_feedback
  from public.feedback_submissions
  where id = p_feedback_submission_id;

  if not found then
    raise exception 'feedback submission not found';
  end if;

  if v_feedback.reviewee_user_id <> v_caller_user_id then
    raise exception 'only the feedback recipient can request a public review post';
  end if;

  if not exists (
    select 1
    from public.asset_channels ac
    where ac.asset_id = v_feedback.asset_id
      and ac.channel_name = p_requested_channel_name
  ) then
    raise exception 'requested channel must belong to the reviewed asset';
  end if;

  insert into public.review_post_requests (
    feedback_submission_id,
    requester_user_id,
    reviewer_user_id,
    requested_channel_name,
    status,
    requested_at,
    responded_at,
    posted_at,
    posted_url
  )
  values (
    p_feedback_submission_id,
    v_caller_user_id,
    v_feedback.reviewer_user_id,
    p_requested_channel_name,
    'pending'::public.review_post_status,
    now(),
    null,
    null,
    null
  )
  on conflict (feedback_submission_id)
  do update set
    requester_user_id = excluded.requester_user_id,
    reviewer_user_id = excluded.reviewer_user_id,
    requested_channel_name = excluded.requested_channel_name,
    status = 'pending'::public.review_post_status,
    requested_at = now(),
    responded_at = null,
    posted_at = null,
    posted_url = null
  returning id into v_request_id;

  update public.matches
  set status = case
    when status in ('posted', 'completed') then status
    else 'awaiting_post'::public.match_status
  end
  where id = v_feedback.match_id;

  return v_request_id;
end;
$$;

revoke all on function public.create_match(uuid, uuid, uuid, text, timestamptz, uuid, text[], text[]) from public;
revoke all on function public.submit_feedback(uuid, integer, text, jsonb, text) from public;
revoke all on function public.rate_member_feedback(uuid, integer) from public;
revoke all on function public.request_review_post(uuid, text) from public;

grant execute on function public.create_match(uuid, uuid, uuid, text, timestamptz, uuid, text[], text[]) to authenticated;
grant execute on function public.submit_feedback(uuid, integer, text, jsonb, text) to authenticated;
grant execute on function public.rate_member_feedback(uuid, integer) to authenticated;
grant execute on function public.request_review_post(uuid, text) to authenticated;