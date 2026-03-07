create table public.member_graph_state (
  singleton boolean primary key default true check (singleton),
  graph_version bigint not null default 1 check (graph_version >= 1),
  updated_at timestamptz not null default now()
);

insert into public.member_graph_state (singleton, graph_version)
values (true, 1)
on conflict (singleton) do nothing;

create table public.member_match_edges (
  user_low_id uuid not null references public.user_profiles(user_id) on delete cascade,
  user_high_id uuid not null references public.user_profiles(user_id) on delete cascade,
  first_match_id uuid references public.matches(id) on delete set null,
  last_match_id uuid references public.matches(id) on delete set null,
  first_connected_at timestamptz not null,
  last_connected_at timestamptz not null,
  total_match_count integer not null default 0 check (total_match_count >= 0),
  semi_duplicate_match_count integer not null default 0 check (semi_duplicate_match_count >= 0),
  min_separation_degree_seen smallint check (min_separation_degree_seen between 1 and 3),
  max_separation_degree_seen smallint check (max_separation_degree_seen between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_low_id, user_high_id),
  check (user_low_id <> user_high_id),
  check (user_low_id::text < user_high_id::text)
);

create index idx_member_match_edges_user_low_id on public.member_match_edges (user_low_id);
create index idx_member_match_edges_user_high_id on public.member_match_edges (user_high_id);
create index idx_member_match_edges_last_connected_at on public.member_match_edges (last_connected_at desc);

create table public.member_separation_cache (
  source_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  target_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  separation_degree smallint not null check (separation_degree >= 1),
  graph_version bigint not null check (graph_version >= 1),
  computed_at timestamptz not null default now(),
  primary key (source_user_id, target_user_id),
  check (source_user_id <> target_user_id)
);

create index idx_member_separation_cache_source_degree
  on public.member_separation_cache (source_user_id, separation_degree, target_user_id);
create index idx_member_separation_cache_target_user_id
  on public.member_separation_cache (target_user_id);

create trigger trg_member_match_edges_set_updated_at
before update on public.member_match_edges
for each row execute function public.set_updated_at();

create trigger trg_member_graph_state_set_updated_at
before update on public.member_graph_state
for each row execute function public.set_updated_at();

alter table public.member_graph_state enable row level security;
alter table public.member_match_edges enable row level security;
alter table public.member_separation_cache enable row level security;

create policy "member_graph_state_admin_select"
on public.member_graph_state for select
to authenticated
using (public.is_admin());

create policy "member_graph_state_admin_manage"
on public.member_graph_state for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "member_match_edges_select_self_or_admin"
on public.member_match_edges for select
to authenticated
using (auth.uid() in (user_low_id, user_high_id) or public.is_admin());

create policy "member_match_edges_admin_manage"
on public.member_match_edges for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "member_separation_cache_select_self_or_admin"
on public.member_separation_cache for select
to authenticated
using (auth.uid() in (source_user_id, target_user_id) or public.is_admin());

create policy "member_separation_cache_admin_manage"
on public.member_separation_cache for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.bump_member_graph_version()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_graph_version bigint;
begin
  insert into public.member_graph_state (singleton, graph_version)
  values (true, 1)
  on conflict (singleton) do nothing;

  update public.member_graph_state
  set graph_version = graph_version + 1,
      updated_at = now()
  where singleton = true
  returning graph_version into v_graph_version;

  return v_graph_version;
end;
$$;

create or replace function public.refresh_member_match_edge_for_pair(
  p_user_a uuid,
  p_user_b uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_low_id uuid;
  v_user_high_id uuid;
  v_total_match_count integer;
  v_semi_duplicate_match_count integer;
  v_first_connected_at timestamptz;
  v_last_connected_at timestamptz;
  v_min_separation_degree smallint;
  v_max_separation_degree smallint;
  v_first_match_id uuid;
  v_last_match_id uuid;
begin
  if p_user_a is null or p_user_b is null or p_user_a = p_user_b then
    return;
  end if;

  if p_user_a::text < p_user_b::text then
    v_user_low_id := p_user_a;
    v_user_high_id := p_user_b;
  else
    v_user_low_id := p_user_b;
    v_user_high_id := p_user_a;
  end if;

  select
    count(*),
    count(*) filter (where m.is_semi_duplicate),
    min(m.created_at),
    max(m.created_at),
    min(m.separation_degree_used),
    max(m.separation_degree_used)
  into
    v_total_match_count,
    v_semi_duplicate_match_count,
    v_first_connected_at,
    v_last_connected_at,
    v_min_separation_degree,
    v_max_separation_degree
  from public.matches m
  where (
      (m.member_a_user_id = v_user_low_id and m.member_b_user_id = v_user_high_id)
      or
      (m.member_a_user_id = v_user_high_id and m.member_b_user_id = v_user_low_id)
    )
    and m.status not in ('cancelled', 'queued_next_month');

  if coalesce(v_total_match_count, 0) = 0 then
    delete from public.member_match_edges
    where user_low_id = v_user_low_id
      and user_high_id = v_user_high_id;
    return;
  end if;

  select m.id into v_first_match_id
  from public.matches m
  where (
      (m.member_a_user_id = v_user_low_id and m.member_b_user_id = v_user_high_id)
      or
      (m.member_a_user_id = v_user_high_id and m.member_b_user_id = v_user_low_id)
    )
    and m.status not in ('cancelled', 'queued_next_month')
  order by m.created_at asc, m.id asc
  limit 1;

  select m.id into v_last_match_id
  from public.matches m
  where (
      (m.member_a_user_id = v_user_low_id and m.member_b_user_id = v_user_high_id)
      or
      (m.member_a_user_id = v_user_high_id and m.member_b_user_id = v_user_low_id)
    )
    and m.status not in ('cancelled', 'queued_next_month')
  order by m.created_at desc, m.id desc
  limit 1;

  insert into public.member_match_edges (
    user_low_id,
    user_high_id,
    first_match_id,
    last_match_id,
    first_connected_at,
    last_connected_at,
    total_match_count,
    semi_duplicate_match_count,
    min_separation_degree_seen,
    max_separation_degree_seen
  )
  values (
    v_user_low_id,
    v_user_high_id,
    v_first_match_id,
    v_last_match_id,
    v_first_connected_at,
    v_last_connected_at,
    v_total_match_count,
    v_semi_duplicate_match_count,
    v_min_separation_degree,
    v_max_separation_degree
  )
  on conflict (user_low_id, user_high_id)
  do update set
    first_match_id = excluded.first_match_id,
    last_match_id = excluded.last_match_id,
    first_connected_at = excluded.first_connected_at,
    last_connected_at = excluded.last_connected_at,
    total_match_count = excluded.total_match_count,
    semi_duplicate_match_count = excluded.semi_duplicate_match_count,
    min_separation_degree_seen = excluded.min_separation_degree_seen,
    max_separation_degree_seen = excluded.max_separation_degree_seen,
    updated_at = now();
end;
$$;

create or replace function public.sync_member_match_edges_from_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_member_match_edge_for_pair(old.member_a_user_id, old.member_b_user_id);
    perform public.bump_member_graph_version();
    return old;
  end if;

  if tg_op = 'UPDATE' and (
    old.member_a_user_id is distinct from new.member_a_user_id
    or old.member_b_user_id is distinct from new.member_b_user_id
  ) then
    perform public.refresh_member_match_edge_for_pair(old.member_a_user_id, old.member_b_user_id);
  end if;

  perform public.refresh_member_match_edge_for_pair(new.member_a_user_id, new.member_b_user_id);
  perform public.bump_member_graph_version();
  return new;
end;
$$;

create trigger trg_matches_sync_member_match_edges
after insert or update or delete on public.matches
for each row execute function public.sync_member_match_edges_from_matches();

create or replace function public.refresh_all_member_match_edges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'admin access required';
  end if;

  delete from public.member_match_edges;

  with relevant_matches as (
    select
      case when m.member_a_user_id::text < m.member_b_user_id::text then m.member_a_user_id else m.member_b_user_id end as user_low_id,
      case when m.member_a_user_id::text < m.member_b_user_id::text then m.member_b_user_id else m.member_a_user_id end as user_high_id,
      m.id,
      m.created_at,
      m.is_semi_duplicate,
      m.separation_degree_used,
      row_number() over (
        partition by case when m.member_a_user_id::text < m.member_b_user_id::text then m.member_a_user_id else m.member_b_user_id end,
                     case when m.member_a_user_id::text < m.member_b_user_id::text then m.member_b_user_id else m.member_a_user_id end
        order by m.created_at asc, m.id asc
      ) as first_rank,
      row_number() over (
        partition by case when m.member_a_user_id::text < m.member_b_user_id::text then m.member_a_user_id else m.member_b_user_id end,
                     case when m.member_a_user_id::text < m.member_b_user_id::text then m.member_b_user_id else m.member_a_user_id end
        order by m.created_at desc, m.id desc
      ) as last_rank
    from public.matches m
    where m.status not in ('cancelled', 'queued_next_month')
  )
  insert into public.member_match_edges (
    user_low_id,
    user_high_id,
    first_match_id,
    last_match_id,
    first_connected_at,
    last_connected_at,
    total_match_count,
    semi_duplicate_match_count,
    min_separation_degree_seen,
    max_separation_degree_seen
  )
  select
    rm.user_low_id,
    rm.user_high_id,
    max(case when rm.first_rank = 1 then rm.id::text end)::uuid as first_match_id,
    max(case when rm.last_rank = 1 then rm.id::text end)::uuid as last_match_id,
    min(rm.created_at) as first_connected_at,
    max(rm.created_at) as last_connected_at,
    count(*) as total_match_count,
    count(*) filter (where rm.is_semi_duplicate) as semi_duplicate_match_count,
    min(rm.separation_degree_used) as min_separation_degree_seen,
    max(rm.separation_degree_used) as max_separation_degree_seen
  from relevant_matches rm
  group by rm.user_low_id, rm.user_high_id;

  get diagnostics v_count = row_count;
  perform public.bump_member_graph_version();
  return v_count;
end;
$$;

create or replace function public.member_shortest_path_degree(
  p_source_user_id uuid,
  p_target_user_id uuid,
  p_max_degree integer default 4
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_max_degree integer := greatest(1, coalesce(p_max_degree, 4));
  v_cached_degree integer;
  v_graph_version bigint;
  v_live_degree integer;
begin
  if p_source_user_id is null or p_target_user_id is null or p_source_user_id = p_target_user_id then
    return null;
  end if;

  select graph_version into v_graph_version
  from public.member_graph_state
  where singleton = true;

  select c.separation_degree into v_cached_degree
  from public.member_separation_cache c
  where c.source_user_id = p_source_user_id
    and c.target_user_id = p_target_user_id
    and c.graph_version = v_graph_version
    and c.separation_degree <= v_max_degree
  limit 1;

  if found then
    return v_cached_degree;
  end if;

  with recursive walk(current_user_id, depth, visited) as (
    select p_source_user_id, 0, array[p_source_user_id]::uuid[]
    union all
    select
      nxt.next_user_id,
      w.depth + 1,
      w.visited || nxt.next_user_id
    from walk w
    join lateral (
      select case when e.user_low_id = w.current_user_id then e.user_high_id else e.user_low_id end as next_user_id
      from public.member_match_edges e
      where e.user_low_id = w.current_user_id
         or e.user_high_id = w.current_user_id
    ) nxt on true
    where w.depth < v_max_degree
      and not (nxt.next_user_id = any(w.visited))
  )
  select min(w.depth) into v_live_degree
  from walk w
  where w.current_user_id = p_target_user_id
    and w.depth > 0;

  return v_live_degree;
end;
$$;

create or replace function public.refresh_member_separation_cache_for_user(
  p_source_user_id uuid,
  p_max_degree integer default 4
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_degree integer := greatest(1, coalesce(p_max_degree, 4));
  v_graph_version bigint;
  v_count integer;
begin
  if p_source_user_id is null then
    return 0;
  end if;

  if auth.uid() is not null and auth.uid() <> p_source_user_id and not public.is_admin() then
    raise exception 'you can only refresh your own graph cache';
  end if;

  select graph_version into v_graph_version
  from public.member_graph_state
  where singleton = true;

  delete from public.member_separation_cache
  where source_user_id = p_source_user_id;

  with recursive walk(current_user_id, depth, visited) as (
    select p_source_user_id, 0, array[p_source_user_id]::uuid[]
    union all
    select
      nxt.next_user_id,
      w.depth + 1,
      w.visited || nxt.next_user_id
    from walk w
    join lateral (
      select case when e.user_low_id = w.current_user_id then e.user_high_id else e.user_low_id end as next_user_id
      from public.member_match_edges e
      where e.user_low_id = w.current_user_id
         or e.user_high_id = w.current_user_id
    ) nxt on true
    where w.depth < v_max_degree
      and not (nxt.next_user_id = any(w.visited))
  ), reachable as (
    select
      p_source_user_id as source_user_id,
      w.current_user_id as target_user_id,
      min(w.depth)::smallint as separation_degree
    from walk w
    where w.depth > 0
    group by w.current_user_id
  )
  insert into public.member_separation_cache (
    source_user_id,
    target_user_id,
    separation_degree,
    graph_version,
    computed_at
  )
  select
    r.source_user_id,
    r.target_user_id,
    r.separation_degree,
    v_graph_version,
    now()
  from reachable r;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.refresh_member_separation_cache_for_all(
  p_max_degree integer default 4
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_total integer := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'admin access required';
  end if;

  delete from public.member_separation_cache;

  for v_profile in
    select up.user_id
    from public.user_profiles up
  loop
    v_total := v_total + public.refresh_member_separation_cache_for_user(v_profile.user_id, p_max_degree);
  end loop;

  return v_total;
end;
$$;

create or replace function public.pair_respects_separation_preferences(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_a_degree smallint;
  v_user_b_degree smallint;
  v_required_path_gap integer;
  v_shortest_path_degree integer;
begin
  if p_user_a is null or p_user_b is null or p_user_a = p_user_b then
    return false;
  end if;

  select up.degrees_of_separation into v_user_a_degree
  from public.user_profiles up
  where up.user_id = p_user_a;

  if not found then
    raise exception 'user profile not found for %', p_user_a;
  end if;

  select up.degrees_of_separation into v_user_b_degree
  from public.user_profiles up
  where up.user_id = p_user_b;

  if not found then
    raise exception 'user profile not found for %', p_user_b;
  end if;

  v_required_path_gap := greatest(v_user_a_degree, v_user_b_degree) + 1;
  v_shortest_path_degree := public.member_shortest_path_degree(p_user_a, p_user_b, v_required_path_gap);

  return v_shortest_path_degree is null or v_shortest_path_degree > v_required_path_gap;
end;
$$;

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
    coalesce(v_shortest_path_degree, least(v_caller_profile.degrees_of_separation + 1, 3))::smallint
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

select public.refresh_all_member_match_edges();

revoke all on function public.bump_member_graph_version() from public;
revoke all on function public.refresh_member_match_edge_for_pair(uuid, uuid) from public;
revoke all on function public.sync_member_match_edges_from_matches() from public;
revoke all on function public.refresh_all_member_match_edges() from public;
revoke all on function public.member_shortest_path_degree(uuid, uuid, integer) from public;
revoke all on function public.refresh_member_separation_cache_for_user(uuid, integer) from public;
revoke all on function public.refresh_member_separation_cache_for_all(integer) from public;
revoke all on function public.pair_respects_separation_preferences(uuid, uuid) from public;
revoke all on function public.create_match(uuid, uuid, uuid, text, timestamptz, uuid, text[], text[]) from public;
revoke all on function public.eligible_match_candidates(uuid, integer, integer) from public;

grant execute on function public.refresh_all_member_match_edges() to authenticated;
grant execute on function public.member_shortest_path_degree(uuid, uuid, integer) to authenticated;
grant execute on function public.refresh_member_separation_cache_for_user(uuid, integer) to authenticated;
grant execute on function public.refresh_member_separation_cache_for_all(integer) to authenticated;
grant execute on function public.pair_respects_separation_preferences(uuid, uuid) to authenticated;
grant execute on function public.create_match(uuid, uuid, uuid, text, timestamptz, uuid, text[], text[]) to authenticated;
grant execute on function public.eligible_match_candidates(uuid, integer, integer) to authenticated;