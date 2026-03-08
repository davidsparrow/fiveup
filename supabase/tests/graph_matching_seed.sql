-- Seed fixture for graph-oriented match testing.
-- Rerunnable: uses fixed UUIDs and upserts.
-- Not a migration. Run manually in the Supabase SQL editor.
--
-- Expected graph after running this seed and then:
--   select public.refresh_all_member_match_edges();
--
-- Distinct graph edges included:
--   Avery <-> Blake   (2 matches total, 1 semi-duplicate)
--   Blake <-> Casey   (1 match)
--   Casey <-> Devon   (1 match)
--   Devon <-> Flynn   (1 match)
--   Flynn <-> Gray    (1 match)
--   Gray <-> Harper   (1 match)
--
-- Excluded from graph edges:
--   Avery <-> Ember   (queued_next_month)
--   Isla              (no matches yet; disconnected candidate)
--
-- Useful expectations:
--   edge count = 6
--   shortest path Avery -> Casey = 2
--   shortest path Avery -> Devon = 3
--   shortest path Avery -> Flynn = 4
--   shortest path Avery -> Gray = 5
--   shortest path Avery -> Harper = 6
--   shortest path Avery -> Ember = null
--   shortest path Avery -> Isla = null

with seed_users as (
  select *
  from (values
    ('00000000-0000-0000-0000-000000000101'::uuid, 'avery.seed+graph@fiveup.test', 'Avery Seed', 'bloom'::public.plan_code, 1::smallint, true, true),
    ('00000000-0000-0000-0000-000000000102'::uuid, 'blake.seed+graph@fiveup.test', 'Blake Seed', 'bloom'::public.plan_code, 1::smallint, true, true),
    ('00000000-0000-0000-0000-000000000103'::uuid, 'casey.seed+graph@fiveup.test', 'Casey Seed', 'flourish'::public.plan_code, 1::smallint, true, true),
    ('00000000-0000-0000-0000-000000000104'::uuid, 'devon.seed+graph@fiveup.test', 'Devon Seed', 'sprout'::public.plan_code, 1::smallint, true, false),
    ('00000000-0000-0000-0000-000000000105'::uuid, 'ember.seed+graph@fiveup.test', 'Ember Seed', 'sprout'::public.plan_code, 1::smallint, true, false),
    ('00000000-0000-0000-0000-000000000106'::uuid, 'flynn.seed+graph@fiveup.test', 'Flynn Seed', 'bloom'::public.plan_code, 1::smallint, true, true),
    ('00000000-0000-0000-0000-000000000107'::uuid, 'gray.seed+graph@fiveup.test', 'Gray Seed', 'sprout'::public.plan_code, 1::smallint, true, false),
    ('00000000-0000-0000-0000-000000000108'::uuid, 'harper.seed+graph@fiveup.test', 'Harper Seed', 'flourish'::public.plan_code, 1::smallint, true, true),
    ('00000000-0000-0000-0000-000000000109'::uuid, 'isla.seed+graph@fiveup.test', 'Isla Seed', 'bloom'::public.plan_code, 1::smallint, true, true)
  ) as t(user_id, email, display_name, plan_code, degrees_of_separation, allow_semi_duplicate_matches, allow_semi_duplicate_with_free)
)
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
select
  su.user_id,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  su.email,
  crypt('SeedPassword123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', su.display_name),
  now(),
  now(),
  '',
  '',
  '',
  ''
from seed_users su
on conflict (id) do update
set email = excluded.email,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = now();

with seed_profiles as (
  select *
  from (values
    ('00000000-0000-0000-0000-000000000101'::uuid, 'Avery Seed', 'bloom'::public.plan_code, 1::smallint, true, true),
    ('00000000-0000-0000-0000-000000000102'::uuid, 'Blake Seed', 'bloom'::public.plan_code, 1::smallint, true, true),
    ('00000000-0000-0000-0000-000000000103'::uuid, 'Casey Seed', 'flourish'::public.plan_code, 1::smallint, true, true),
    ('00000000-0000-0000-0000-000000000104'::uuid, 'Devon Seed', 'sprout'::public.plan_code, 1::smallint, true, false),
    ('00000000-0000-0000-0000-000000000105'::uuid, 'Ember Seed', 'sprout'::public.plan_code, 1::smallint, true, false),
    ('00000000-0000-0000-0000-000000000106'::uuid, 'Flynn Seed', 'bloom'::public.plan_code, 1::smallint, true, true),
    ('00000000-0000-0000-0000-000000000107'::uuid, 'Gray Seed', 'sprout'::public.plan_code, 1::smallint, true, false),
    ('00000000-0000-0000-0000-000000000108'::uuid, 'Harper Seed', 'flourish'::public.plan_code, 1::smallint, true, true),
    ('00000000-0000-0000-0000-000000000109'::uuid, 'Isla Seed', 'bloom'::public.plan_code, 1::smallint, true, true)
  ) as t(user_id, display_name, plan_code, degrees_of_separation, allow_semi_duplicate_matches, allow_semi_duplicate_with_free)
)
insert into public.user_profiles (
  user_id,
  display_name,
  bio,
  location_text,
  plan_code,
  degrees_of_separation,
  allow_semi_duplicate_matches,
  allow_semi_duplicate_with_free
)
select
  sp.user_id,
  sp.display_name,
  'Seeded graph test member',
  'Seed Data',
  sp.plan_code,
  sp.degrees_of_separation,
  sp.allow_semi_duplicate_matches,
  sp.allow_semi_duplicate_with_free
from seed_profiles sp
on conflict (user_id) do update
set display_name = excluded.display_name,
    bio = excluded.bio,
    location_text = excluded.location_text,
    plan_code = excluded.plan_code,
    degrees_of_separation = excluded.degrees_of_separation,
    allow_semi_duplicate_matches = excluded.allow_semi_duplicate_matches,
    allow_semi_duplicate_with_free = excluded.allow_semi_duplicate_with_free,
    updated_at = now();

insert into public.assets (
  id,
  owner_user_id,
  name,
  public_url,
  asset_type,
  description,
  status,
  require_star_rating,
  require_star_plus_one_other
)
values
  ('10000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, 'Avery Growth Audit', 'https://seed.fiveup.test/avery-growth-audit', 'service_consulting', 'Seed asset for Avery', 'active', true, false),
  ('10000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000102'::uuid, 'Blake Product Demo', 'https://seed.fiveup.test/blake-product-demo', 'digital_product_saas', 'Seed asset for Blake', 'active', true, false),
  ('10000000-0000-0000-0000-000000000103'::uuid, '00000000-0000-0000-0000-000000000103'::uuid, 'Casey Advisory Session', 'https://seed.fiveup.test/casey-advisory-session', 'advisory_skills', 'Seed asset for Casey', 'active', true, true),
  ('10000000-0000-0000-0000-000000000104'::uuid, '00000000-0000-0000-0000-000000000104'::uuid, 'Devon Storefront', 'https://seed.fiveup.test/devon-storefront', 'ecommerce_store', 'Seed asset for Devon', 'active', false, false),
  ('10000000-0000-0000-0000-000000000105'::uuid, '00000000-0000-0000-0000-000000000105'::uuid, 'Ember Coaching Call', 'https://seed.fiveup.test/ember-coaching-call', 'free_session_consultation', 'Seed asset for Ember', 'active', false, false),
  ('10000000-0000-0000-0000-000000000106'::uuid, '00000000-0000-0000-0000-000000000106'::uuid, 'Flynn Demo Funnel', 'https://seed.fiveup.test/flynn-demo-funnel', 'digital_product_saas', 'Seed asset for Flynn', 'active', true, false),
  ('10000000-0000-0000-0000-000000000107'::uuid, '00000000-0000-0000-0000-000000000107'::uuid, 'Gray Landing Page', 'https://seed.fiveup.test/gray-landing-page', 'digital_product_saas', 'Seed asset for Gray', 'active', false, false),
  ('10000000-0000-0000-0000-000000000108'::uuid, '00000000-0000-0000-0000-000000000108'::uuid, 'Harper Podcast', 'https://seed.fiveup.test/harper-podcast', 'content_podcast_video', 'Seed asset for Harper', 'active', false, false),
  ('10000000-0000-0000-0000-000000000109'::uuid, '00000000-0000-0000-0000-000000000109'::uuid, 'Isla SEO Audit', 'https://seed.fiveup.test/isla-seo-audit', 'service_consulting', 'Seed asset for Isla', 'active', true, false)
on conflict (id) do update
set name = excluded.name,
    public_url = excluded.public_url,
    asset_type = excluded.asset_type,
    description = excluded.description,
    status = excluded.status,
    require_star_rating = excluded.require_star_rating,
    require_star_plus_one_other = excluded.require_star_plus_one_other,
    updated_at = now();

insert into public.asset_channels (asset_id, channel_name, channel_url)
values
  ('10000000-0000-0000-0000-000000000101'::uuid, 'Google Business Profile', 'https://reviews.seed/avery-google'),
  ('10000000-0000-0000-0000-000000000102'::uuid, 'G2', 'https://reviews.seed/blake-g2'),
  ('10000000-0000-0000-0000-000000000103'::uuid, 'Clutch', 'https://reviews.seed/casey-clutch'),
  ('10000000-0000-0000-0000-000000000104'::uuid, 'Shopify', 'https://reviews.seed/devon-shopify'),
  ('10000000-0000-0000-0000-000000000105'::uuid, 'Yelp', 'https://reviews.seed/ember-yelp'),
  ('10000000-0000-0000-0000-000000000106'::uuid, 'Capterra', 'https://reviews.seed/flynn-capterra'),
  ('10000000-0000-0000-0000-000000000107'::uuid, 'Product Hunt', 'https://reviews.seed/gray-producthunt'),
  ('10000000-0000-0000-0000-000000000108'::uuid, 'Apple Podcasts', 'https://reviews.seed/harper-applepodcasts'),
  ('10000000-0000-0000-0000-000000000109'::uuid, 'Google Business Profile', 'https://reviews.seed/isla-google')
on conflict (asset_id, channel_name) do update
set channel_url = excluded.channel_url;

insert into public.asset_feedback_formats (asset_id, format)
values
  ('10000000-0000-0000-0000-000000000101'::uuid, 'stars'),
  ('10000000-0000-0000-0000-000000000102'::uuid, 'written'),
  ('10000000-0000-0000-0000-000000000103'::uuid, 'structured'),
  ('10000000-0000-0000-0000-000000000104'::uuid, 'written'),
  ('10000000-0000-0000-0000-000000000105'::uuid, 'video_audio'),
  ('10000000-0000-0000-0000-000000000106'::uuid, 'stars'),
  ('10000000-0000-0000-0000-000000000107'::uuid, 'written'),
  ('10000000-0000-0000-0000-000000000108'::uuid, 'video_audio'),
  ('10000000-0000-0000-0000-000000000109'::uuid, 'structured')
on conflict (asset_id, format) do nothing;

insert into public.matches (
  id,
  member_a_user_id,
  member_b_user_id,
  member_a_asset_id,
  member_b_asset_id,
  source,
  status,
  feedback_due_at,
  is_semi_duplicate,
  previous_match_id,
  separation_degree_used,
  created_at
)
values
  ('20000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000102'::uuid, '10000000-0000-0000-0000-000000000101'::uuid, '10000000-0000-0000-0000-000000000102'::uuid, 'browse', 'completed', now() - interval '20 days', false, null, 1, now() - interval '24 days'),
  ('20000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000103'::uuid, '10000000-0000-0000-0000-000000000102'::uuid, '10000000-0000-0000-0000-000000000103'::uuid, 'browse', 'completed', now() - interval '15 days', false, null, 1, now() - interval '18 days'),
  ('20000000-0000-0000-0000-000000000103'::uuid, '00000000-0000-0000-0000-000000000103'::uuid, '00000000-0000-0000-0000-000000000104'::uuid, '10000000-0000-0000-0000-000000000103'::uuid, '10000000-0000-0000-0000-000000000104'::uuid, 'browse', 'completed', now() - interval '10 days', false, null, 1, now() - interval '12 days'),
  ('20000000-0000-0000-0000-000000000104'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000102'::uuid, '10000000-0000-0000-0000-000000000101'::uuid, '10000000-0000-0000-0000-000000000102'::uuid, 'browse', 'completed', now() - interval '5 days', true, '20000000-0000-0000-0000-000000000101'::uuid, 1, now() - interval '6 days'),
  ('20000000-0000-0000-0000-000000000105'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000105'::uuid, '10000000-0000-0000-0000-000000000101'::uuid, '10000000-0000-0000-0000-000000000105'::uuid, 'queued', 'queued_next_month', now() + interval '20 days', false, null, 1, now() - interval '1 day'),
  ('20000000-0000-0000-0000-000000000106'::uuid, '00000000-0000-0000-0000-000000000104'::uuid, '00000000-0000-0000-0000-000000000106'::uuid, '10000000-0000-0000-0000-000000000104'::uuid, '10000000-0000-0000-0000-000000000106'::uuid, 'browse', 'completed', now() - interval '9 days', false, null, 1, now() - interval '11 days'),
  ('20000000-0000-0000-0000-000000000107'::uuid, '00000000-0000-0000-0000-000000000106'::uuid, '00000000-0000-0000-0000-000000000107'::uuid, '10000000-0000-0000-0000-000000000106'::uuid, '10000000-0000-0000-0000-000000000107'::uuid, 'browse', 'completed', now() - interval '8 days', false, null, 1, now() - interval '10 days'),
  ('20000000-0000-0000-0000-000000000108'::uuid, '00000000-0000-0000-0000-000000000107'::uuid, '00000000-0000-0000-0000-000000000108'::uuid, '10000000-0000-0000-0000-000000000107'::uuid, '10000000-0000-0000-0000-000000000108'::uuid, 'browse', 'completed', now() - interval '7 days', false, null, 1, now() - interval '8 days')
on conflict (id) do update
set member_a_user_id = excluded.member_a_user_id,
    member_b_user_id = excluded.member_b_user_id,
    member_a_asset_id = excluded.member_a_asset_id,
    member_b_asset_id = excluded.member_b_asset_id,
    source = excluded.source,
    status = excluded.status,
    feedback_due_at = excluded.feedback_due_at,
    is_semi_duplicate = excluded.is_semi_duplicate,
    previous_match_id = excluded.previous_match_id,
    separation_degree_used = excluded.separation_degree_used,
    created_at = excluded.created_at,
    updated_at = now();

insert into public.user_monthly_usage (
  user_id,
  usage_month,
  total_matches_started,
  browse_matches_initiated
)
values
  ('00000000-0000-0000-0000-000000000105'::uuid, public.month_bucket_start(now()), 4, 0),
  ('00000000-0000-0000-0000-000000000101'::uuid, public.month_bucket_start(now()), 1, 1)
on conflict (user_id, usage_month) do update
set total_matches_started = excluded.total_matches_started,
    browse_matches_initiated = excluded.browse_matches_initiated,
    updated_at = now();

select
  'graph seed ready' as status,
  9 as seeded_users,
  9 as seeded_assets,
  8 as seeded_matches,
  6 as expected_distinct_graph_edges;