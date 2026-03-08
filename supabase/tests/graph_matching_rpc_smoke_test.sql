-- Authenticated smoke test for graph-aware RPCs.
-- Run after graph_matching_seed.sql, then refresh graph edges.
-- Safe to run in the Supabase SQL editor; the transaction rolls back.

begin;

set local role authenticated;

select public.refresh_all_member_match_edges() as refreshed_edge_rows;

create or replace function pg_temp.impersonate_seed_user(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.run_candidate_query(
  p_auth_user_id uuid,
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
as $$
begin
  perform pg_temp.impersonate_seed_user(p_auth_user_id);

  return query
  select *
  from public.eligible_match_candidates(p_my_asset_id, p_limit, p_offset);
end;
$$;

create or replace function pg_temp.try_create_match(
  p_auth_user_id uuid,
  p_other_user_id uuid,
  p_my_asset_id uuid,
  p_their_asset_id uuid,
  p_source text default 'browse',
  p_previous_match_id uuid default null
)
returns table (
  ok boolean,
  created_match_id uuid,
  created_status public.match_status,
  created_is_semi_duplicate boolean,
  created_separation_degree smallint,
  error_text text
)
language plpgsql
as $$
declare
  v_match_id uuid;
begin
  perform pg_temp.impersonate_seed_user(p_auth_user_id);

  begin
    v_match_id := public.create_match(
      p_other_user_id,
      p_my_asset_id,
      p_their_asset_id,
      p_source,
      null,
      p_previous_match_id,
      '{}'::text[],
      '{}'::text[]
    );

    return query
    select
      true,
      m.id,
      m.status,
      m.is_semi_duplicate,
      m.separation_degree_used,
      null::text
    from public.matches m
    where m.id = v_match_id;
  exception when others then
    return query
    select false, null::uuid, null::public.match_status, null::boolean, null::smallint, sqlerrm;
  end;
end;
$$;

create temporary table pg_temp.rpc_smoke_results (
  sort_order integer not null,
  test_name text not null,
  expected_pass boolean not null,
  actual_pass boolean,
  details jsonb not null default '{}'::jsonb
) on commit drop;

-- 1) Candidate RPC expectations for Avery browsing known seeded members.
insert into pg_temp.rpc_smoke_results (sort_order, test_name, expected_pass, actual_pass, details)
with expected as (
  select *
  from (values
    (10, 'Avery -> Casey candidate lookup', '00000000-0000-0000-0000-000000000103'::uuid, 2::integer, false, 0::integer, false, false),
    (11, 'Avery -> Devon candidate lookup', '00000000-0000-0000-0000-000000000104'::uuid, 3::integer, true, 0::integer, false, false),
    (12, 'Avery -> Ember candidate lookup', '00000000-0000-0000-0000-000000000105'::uuid, null::integer, true, 1::integer, true, true),
    (13, 'Avery -> Isla candidate lookup',  '00000000-0000-0000-0000-000000000109'::uuid, null::integer, true, 0::integer, false, false)
  ) as t(sort_order, test_name, candidate_user_id, expected_shortest_path_degree, expected_respects_preference, expected_prior_match_count, expected_has_active_match, expected_would_queue)
), actual as (
  select *
  from pg_temp.run_candidate_query(
    '00000000-0000-0000-0000-000000000101'::uuid,
    '10000000-0000-0000-0000-000000000101'::uuid,
    20,
    0
  )
)
select
  e.sort_order,
  e.test_name,
  true as expected_pass,
  coalesce(
    (e.expected_shortest_path_degree is not distinct from a.shortest_path_degree)
    and (e.expected_respects_preference = a.respects_separation_preference)
    and (e.expected_prior_match_count = a.prior_match_count)
    and (e.expected_has_active_match = a.has_active_match)
    and (e.expected_would_queue = a.would_queue),
    false
  ) as actual_pass,
  jsonb_build_object(
    'expected_shortest_path_degree', e.expected_shortest_path_degree,
    'actual_shortest_path_degree', a.shortest_path_degree,
    'expected_respects_preference', e.expected_respects_preference,
    'actual_respects_preference', a.respects_separation_preference,
    'expected_prior_match_count', e.expected_prior_match_count,
    'actual_prior_match_count', a.prior_match_count,
    'expected_has_active_match', e.expected_has_active_match,
    'actual_has_active_match', a.has_active_match,
    'expected_would_queue', e.expected_would_queue,
    'actual_would_queue', a.would_queue
  ) as details
from expected e
left join actual a on a.candidate_user_id = e.candidate_user_id;

-- 2) First-time pairing inside the threshold should be blocked.
insert into pg_temp.rpc_smoke_results (sort_order, test_name, expected_pass, actual_pass, details)
with result as (
  select *
  from pg_temp.try_create_match(
    '00000000-0000-0000-0000-000000000101'::uuid,
    '00000000-0000-0000-0000-000000000103'::uuid,
    '10000000-0000-0000-0000-000000000101'::uuid,
    '10000000-0000-0000-0000-000000000103'::uuid,
    'browse',
    null
  )
)
select
  20,
  'Avery -> Casey browse blocked by separation',
  true,
  coalesce(r.ok = false and r.error_text ilike '%degrees-of-separation threshold%', false),
  jsonb_build_object('actual_ok', r.ok, 'error_text', r.error_text)
from result r;

-- 3) First-time pairing outside the threshold should succeed as a browse match.
insert into pg_temp.rpc_smoke_results (sort_order, test_name, expected_pass, actual_pass, details)
with result as (
  select *
  from pg_temp.try_create_match(
    '00000000-0000-0000-0000-000000000101'::uuid,
    '00000000-0000-0000-0000-000000000104'::uuid,
    '10000000-0000-0000-0000-000000000101'::uuid,
    '10000000-0000-0000-0000-000000000104'::uuid,
    'browse',
    null
  )
)
select
  30,
  'Avery -> Devon browse allowed',
  true,
  coalesce(r.ok = true and r.created_status = 'matched' and r.created_is_semi_duplicate = false and r.created_separation_degree = 3, false),
  jsonb_build_object(
    'actual_ok', r.ok,
    'created_status', r.created_status,
    'created_is_semi_duplicate', r.created_is_semi_duplicate,
    'created_separation_degree', r.created_separation_degree,
    'error_text', r.error_text
  )
from result r;

-- 4) Browse into an at-limit member should instruct the caller to queue instead.
insert into pg_temp.rpc_smoke_results (sort_order, test_name, expected_pass, actual_pass, details)
with result as (
  select *
  from pg_temp.try_create_match(
    '00000000-0000-0000-0000-000000000103'::uuid,
    '00000000-0000-0000-0000-000000000105'::uuid,
    '10000000-0000-0000-0000-000000000103'::uuid,
    '10000000-0000-0000-0000-000000000105'::uuid,
    'browse',
    null
  )
)
select
  40,
  'Casey -> Ember browse requires queue',
  true,
  coalesce(r.ok = false and r.error_text ilike '%create a queued match instead%', false),
  jsonb_build_object('actual_ok', r.ok, 'error_text', r.error_text)
from result r;

-- 5) Queued creation for that same pair should succeed.
insert into pg_temp.rpc_smoke_results (sort_order, test_name, expected_pass, actual_pass, details)
with result as (
  select *
  from pg_temp.try_create_match(
    '00000000-0000-0000-0000-000000000103'::uuid,
    '00000000-0000-0000-0000-000000000105'::uuid,
    '10000000-0000-0000-0000-000000000103'::uuid,
    '10000000-0000-0000-0000-000000000105'::uuid,
    'queued',
    null
  )
)
select
  50,
  'Casey -> Ember queued allowed',
  true,
  coalesce(r.ok = true and r.created_status = 'queued_next_month' and r.created_is_semi_duplicate = false, false),
  jsonb_build_object(
    'actual_ok', r.ok,
    'created_status', r.created_status,
    'created_is_semi_duplicate', r.created_is_semi_duplicate,
    'created_separation_degree', r.created_separation_degree,
    'error_text', r.error_text
  )
from result r;

-- Final consolidated result set for SQL editor convenience.
with detailed_results as (
  select
    sort_order,
    test_name,
    expected_pass,
    actual_pass,
    case when actual_pass then 'PASS' else 'FAIL' end as status,
    details
  from pg_temp.rpc_smoke_results
), summary_row as (
  select
    999 as sort_order,
    'SUMMARY'::text as test_name,
    true as expected_pass,
    bool_and(coalesce(actual_pass, false)) as actual_pass,
    case when bool_and(coalesce(actual_pass, false)) then 'PASS' else 'FAIL' end as status,
    jsonb_build_object(
      'passed', count(*) filter (where coalesce(actual_pass, false)),
      'failed', count(*) filter (where not coalesce(actual_pass, false)),
      'total', count(*)
    ) as details
  from pg_temp.rpc_smoke_results
), all_results as (
  select
    sort_order,
    test_name,
    expected_pass,
    actual_pass,
    status,
    details
  from detailed_results
  union all
  select
    sort_order,
    test_name,
    expected_pass,
    actual_pass,
    status,
    details
  from summary_row
)
select
  test_name,
  expected_pass,
  actual_pass,
  status,
  details
from all_results
order by sort_order;

rollback;