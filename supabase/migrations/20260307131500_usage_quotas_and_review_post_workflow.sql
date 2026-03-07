create table public.user_monthly_usage (
  user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  usage_month date not null,
  total_matches_started integer not null default 0 check (total_matches_started >= 0),
  browse_matches_initiated integer not null default 0 check (browse_matches_initiated >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_month)
);

create index idx_user_monthly_usage_usage_month on public.user_monthly_usage (usage_month);

create or replace function public.month_bucket_start(p_at timestamptz default now())
returns date
language sql
stable
as $$
  select date_trunc('month', coalesce(p_at, now()))::date;
$$;

create or replace function public.plan_feature_enabled(
  p_plan_code public.plan_code,
  p_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select pfg.enabled
    from public.plan_feature_gates pfg
    where pfg.plan_code = p_plan_code
      and pfg.feature_key = p_feature_key
    limit 1
  ), false);
$$;

create or replace function public.plan_feature_limit(
  p_plan_code public.plan_code,
  p_feature_key text
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select pfg.limit_int
  from public.plan_feature_gates pfg
  where pfg.plan_code = p_plan_code
    and pfg.feature_key = p_feature_key
  limit 1;
$$;

create or replace function public.plan_total_match_limit(p_plan_code public.plan_code)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.plan_feature_limit(p_plan_code, 'auto_matches_per_month'), 0)
       + coalesce(public.plan_feature_limit(p_plan_code, 'browse_matches_per_month'), 0);
$$;

create trigger trg_user_monthly_usage_set_updated_at
before update on public.user_monthly_usage
for each row execute function public.set_updated_at();

alter table public.user_monthly_usage enable row level security;

create policy "user_monthly_usage_select_self_or_admin"
on public.user_monthly_usage for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy "user_monthly_usage_admin_manage"
on public.user_monthly_usage for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

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

create or replace function public.respond_review_post_request(
  p_request_id uuid,
  p_accept boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_user_id uuid := auth.uid();
  v_request public.review_post_requests%rowtype;
  v_match_id uuid;
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;

  select * into v_request
  from public.review_post_requests
  where id = p_request_id;

  if not found then
    raise exception 'review post request not found';
  end if;

  if v_request.reviewer_user_id <> v_caller_user_id then
    raise exception 'only the requested reviewer can respond';
  end if;

  if v_request.status = 'posted' then
    raise exception 'a posted review request cannot be changed';
  end if;

  update public.review_post_requests
  set status = case when p_accept then 'accepted'::public.review_post_status else 'declined'::public.review_post_status end,
      responded_at = now()
  where id = p_request_id;

  select fs.match_id into v_match_id
  from public.feedback_submissions fs
  where fs.id = v_request.feedback_submission_id;

  update public.matches
  set status = case
    when status in ('posted', 'completed') then status
    when p_accept then 'awaiting_post'::public.match_status
    else 'completed'::public.match_status
  end
  where id = v_match_id;

  return p_request_id;
end;
$$;

create or replace function public.mark_review_posted(
  p_request_id uuid,
  p_posted_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_user_id uuid := auth.uid();
  v_request public.review_post_requests%rowtype;
  v_match_id uuid;
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;

  if nullif(btrim(coalesce(p_posted_url, '')), '') is null then
    raise exception 'posted_url is required';
  end if;

  select * into v_request
  from public.review_post_requests
  where id = p_request_id;

  if not found then
    raise exception 'review post request not found';
  end if;

  if v_request.reviewer_user_id <> v_caller_user_id then
    raise exception 'only the requested reviewer can mark the review as posted';
  end if;

  update public.review_post_requests
  set status = 'posted'::public.review_post_status,
      responded_at = coalesce(responded_at, now()),
      posted_at = now(),
      posted_url = p_posted_url
  where id = p_request_id;

  select fs.match_id into v_match_id
  from public.feedback_submissions fs
  where fs.id = v_request.feedback_submission_id;

  update public.matches
  set status = 'posted'::public.match_status
  where id = v_match_id;

  return p_request_id;
end;
$$;

revoke all on function public.month_bucket_start(timestamptz) from public;
revoke all on function public.plan_feature_enabled(public.plan_code, text) from public;
revoke all on function public.plan_feature_limit(public.plan_code, text) from public;
revoke all on function public.plan_total_match_limit(public.plan_code) from public;
revoke all on function public.create_match(uuid, uuid, uuid, text, timestamptz, uuid, text[], text[]) from public;
revoke all on function public.respond_review_post_request(uuid, boolean) from public;
revoke all on function public.mark_review_posted(uuid, text) from public;

grant execute on function public.month_bucket_start(timestamptz) to authenticated;
grant execute on function public.plan_feature_enabled(public.plan_code, text) to authenticated;
grant execute on function public.plan_feature_limit(public.plan_code, text) to authenticated;
grant execute on function public.plan_total_match_limit(public.plan_code) to authenticated;
grant execute on function public.create_match(uuid, uuid, uuid, text, timestamptz, uuid, text[], text[]) to authenticated;
grant execute on function public.respond_review_post_request(uuid, boolean) to authenticated;
grant execute on function public.mark_review_posted(uuid, text) to authenticated;