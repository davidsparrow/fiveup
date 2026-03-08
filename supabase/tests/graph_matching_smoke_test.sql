-- Smoke test for migration 4 graph support.
-- Safe to run in the Supabase SQL editor.
-- It wraps refresh/cache operations in a transaction and rolls them back.

begin;

-- 1) Current match distribution.
select
  m.status,
  count(*) as match_count
from public.matches m
group by m.status
order by m.status;

-- 2) Refresh graph edges from matches.
select public.refresh_all_member_match_edges() as refreshed_edge_rows;

-- 3) Expected distinct edge count from non-cancelled, non-queued matches.
with expected_edges as (
  select distinct
    least(m.member_a_user_id::text, m.member_b_user_id::text) as user_low_id,
    greatest(m.member_a_user_id::text, m.member_b_user_id::text) as user_high_id
  from public.matches m
  where m.status not in ('cancelled', 'queued_next_month')
)
select
  (select count(*) from expected_edges) as expected_edge_count,
  (select count(*) from public.member_match_edges) as actual_edge_count,
  ((select count(*) from expected_edges) = (select count(*) from public.member_match_edges)) as edge_count_matches;

-- 4) Detect any mismatched edge summaries.
with expected_edges as (
  select
    least(m.member_a_user_id::text, m.member_b_user_id::text)::uuid as user_low_id,
    greatest(m.member_a_user_id::text, m.member_b_user_id::text)::uuid as user_high_id,
    count(*)::integer as total_match_count,
    count(*) filter (where m.is_semi_duplicate)::integer as semi_duplicate_match_count,
    min(m.created_at) as first_connected_at,
    max(m.created_at) as last_connected_at,
    min(m.separation_degree_used) as min_separation_degree_seen,
    max(m.separation_degree_used) as max_separation_degree_seen
  from public.matches m
  where m.status not in ('cancelled', 'queued_next_month')
  group by 1, 2
)
select count(*) as mismatched_edge_rows
from expected_edges e
full outer join public.member_match_edges mme
  on mme.user_low_id = e.user_low_id
 and mme.user_high_id = e.user_high_id
where e.user_low_id is null
   or mme.user_low_id is null
   or e.total_match_count <> mme.total_match_count
   or e.semi_duplicate_match_count <> mme.semi_duplicate_match_count
   or e.first_connected_at <> mme.first_connected_at
   or e.last_connected_at <> mme.last_connected_at
   or e.min_separation_degree_seen <> mme.min_separation_degree_seen
   or e.max_separation_degree_seen <> mme.max_separation_degree_seen;

-- 5) Direct-edge shortest path should be 1 for any existing graph edge.
with sample_pair as (
  select mme.user_low_id as source_user_id, mme.user_high_id as target_user_id
  from public.member_match_edges mme
  order by mme.last_connected_at desc
  limit 1
)
select
  sp.source_user_id,
  sp.target_user_id,
  public.member_shortest_path_degree(sp.source_user_id, sp.target_user_id, 4) as shortest_path_degree,
  public.pair_respects_separation_preferences(sp.source_user_id, sp.target_user_id) as respects_preferences
from sample_pair sp;

-- 6) Seeded-path assertions (returns rows when graph_matching_seed.sql has been loaded).
with seeded_pairs as (
  select *
  from (values
    ('Avery -> Blake',  '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000102'::uuid, 1::integer, false),
    ('Avery -> Casey',  '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000103'::uuid, 2::integer, false),
    ('Avery -> Devon',  '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000104'::uuid, 3::integer, true),
    ('Avery -> Flynn',  '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000106'::uuid, 4::integer, true),
    ('Avery -> Gray',   '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000107'::uuid, 5::integer, true),
    ('Avery -> Harper', '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000108'::uuid, 6::integer, true),
    ('Avery -> Ember',  '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000105'::uuid, null::integer, true),
    ('Avery -> Isla',   '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000109'::uuid, null::integer, true)
  ) as t(test_name, source_user_id, target_user_id, expected_shortest_path_degree, expected_respects_preferences)
)
select
  sp.test_name,
  sp.expected_shortest_path_degree,
  actual.shortest_path_degree as actual_shortest_path_degree,
  sp.expected_shortest_path_degree is not distinct from actual.shortest_path_degree as shortest_path_matches_expected,
  sp.expected_respects_preferences,
  actual.respects_preferences as actual_respects_preferences,
  sp.expected_respects_preferences = actual.respects_preferences as respects_matches_expected
from seeded_pairs sp
join public.user_profiles src on src.user_id = sp.source_user_id
join public.user_profiles dst on dst.user_id = sp.target_user_id
cross join lateral (
  select
    public.member_shortest_path_degree(sp.source_user_id, sp.target_user_id, 8) as shortest_path_degree,
    public.pair_respects_separation_preferences(sp.source_user_id, sp.target_user_id) as respects_preferences
) actual
order by sp.test_name;

-- 7) Refresh one user's separation cache and inspect row count.
with sample_source as (
  select mme.user_low_id as source_user_id
  from public.member_match_edges mme
  order by mme.last_connected_at desc
  limit 1
), refreshed as (
  select
    ss.source_user_id,
    public.refresh_member_separation_cache_for_user(ss.source_user_id, 6) as refreshed_cache_rows
  from sample_source ss
)
select
  r.source_user_id,
  r.refreshed_cache_rows,
  count(c.target_user_id) as cache_row_count,
  min(c.separation_degree) as min_cached_degree,
  max(c.separation_degree) as max_cached_degree
from refreshed r
left join public.member_separation_cache c
  on c.source_user_id = r.source_user_id
group by r.source_user_id, r.refreshed_cache_rows;

-- 8) Direct neighbors cached from the sampled source should have degree 1.
with sample_source as (
  select mme.user_low_id as source_user_id
  from public.member_match_edges mme
  order by mme.last_connected_at desc
  limit 1
), direct_neighbors as (
  select distinct
    ss.source_user_id,
    case
      when mme.user_low_id = ss.source_user_id then mme.user_high_id
      else mme.user_low_id
    end as neighbor_user_id
  from sample_source ss
  join public.member_match_edges mme
    on mme.user_low_id = ss.source_user_id
    or mme.user_high_id = ss.source_user_id
)
select
  dn.source_user_id,
  dn.neighbor_user_id,
  c.separation_degree as cached_degree
from direct_neighbors dn
left join public.member_separation_cache c
  on c.source_user_id = dn.source_user_id
 and c.target_user_id = dn.neighbor_user_id
order by dn.neighbor_user_id;

rollback;

-- Note:
-- `create_match(...)` and `eligible_match_candidates(...)` depend on `auth.uid()`.
-- See graph_matching_rpc_smoke_test.sql for authenticated SQL-editor coverage.
