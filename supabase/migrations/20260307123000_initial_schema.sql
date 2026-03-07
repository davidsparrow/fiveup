create extension if not exists pgcrypto;

create type public.plan_code as enum ('sprout', 'bloom', 'flourish');
create type public.app_role as enum ('admin');
create type public.asset_type as enum (
  'service_consulting',
  'advisory_skills',
  'physical_product',
  'digital_product_saas',
  'content_podcast_video',
  'ecommerce_store',
  'free_session_consultation',
  'client_asset'
);
create type public.match_status as enum (
  'matched',
  'accepted',
  'feedback_pending',
  'awaiting_post',
  'posted',
  'completed',
  'cancelled',
  'queued_next_month'
);
create type public.feedback_format as enum ('stars', 'written', 'structured', 'video_audio');
create type public.review_post_status as enum ('pending', 'accepted', 'declined', 'posted');

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  location_text text,
  plan_code public.plan_code not null default 'sprout',
  degrees_of_separation smallint not null default 1 check (degrees_of_separation between 1 and 3),
  allow_semi_duplicate_matches boolean not null default true,
  allow_semi_duplicate_with_free boolean not null default false,
  feedback_rating_avg numeric(3,2) not null default 0,
  feedback_rating_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.plan_feature_gates (
  id bigint generated always as identity primary key,
  plan_code public.plan_code not null,
  feature_key text not null,
  enabled boolean not null default true,
  limit_int integer,
  description text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_code, feature_key)
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  name text not null,
  public_url text not null,
  asset_type public.asset_type not null,
  description text,
  is_client_asset boolean not null default false,
  client_name text,
  status text not null default 'draft' check (status in ('draft', 'pending_verification', 'active', 'archived')),
  require_star_rating boolean not null default false,
  require_star_plus_one_other boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, public_url)
);

create table public.asset_channels (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  channel_name text not null,
  channel_url text,
  created_at timestamptz not null default now(),
  unique (asset_id, channel_name)
);

create unique index asset_channels_channel_url_unique
  on public.asset_channels (lower(channel_url))
  where channel_url is not null;

create table public.asset_feedback_formats (
  asset_id uuid not null references public.assets(id) on delete cascade,
  format public.feedback_format not null,
  created_at timestamptz not null default now(),
  primary key (asset_id, format)
);

create table public.asset_screenshots (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  member_a_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  member_b_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  member_a_asset_id uuid not null references public.assets(id) on delete restrict,
  member_b_asset_id uuid not null references public.assets(id) on delete restrict,
  source text not null check (source in ('auto', 'browse', 'queued')),
  status public.match_status not null default 'matched',
  feedback_due_at timestamptz,
  is_semi_duplicate boolean not null default false,
  previous_match_id uuid references public.matches(id) on delete set null,
  separation_degree_used smallint not null default 1 check (separation_degree_used between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (member_a_user_id <> member_b_user_id),
  unique (id, member_a_user_id),
  unique (id, member_b_user_id)
);

create table public.match_blocked_channels (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  blocked_for_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  channel_name text not null,
  created_at timestamptz not null default now(),
  unique (match_id, blocked_for_user_id, channel_name)
);

create table public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  reviewer_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  reviewee_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  stars integer check (stars between 1 and 5),
  written_feedback text,
  structured_feedback jsonb not null default '{}'::jsonb,
  media_url text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, reviewer_user_id),
  check (reviewer_user_id <> reviewee_user_id)
);

create table public.member_feedback_ratings (
  id uuid primary key default gen_random_uuid(),
  feedback_submission_id uuid not null unique references public.feedback_submissions(id) on delete cascade,
  rater_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  rated_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  unique (rater_user_id, rated_user_id),
  check (rater_user_id <> rated_user_id)
);

create table public.review_post_requests (
  id uuid primary key default gen_random_uuid(),
  feedback_submission_id uuid not null unique references public.feedback_submissions(id) on delete cascade,
  requester_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  reviewer_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  requested_channel_name text not null,
  status public.review_post_status not null default 'pending',
  posted_url text,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  posted_at timestamptz,
  check (requester_user_id <> reviewer_user_id)
);

create index idx_assets_owner_user_id on public.assets (owner_user_id);
create index idx_matches_member_a_user_id on public.matches (member_a_user_id);
create index idx_matches_member_b_user_id on public.matches (member_b_user_id);
create index idx_feedback_submissions_reviewer_user_id on public.feedback_submissions (reviewer_user_id);
create index idx_feedback_submissions_reviewee_user_id on public.feedback_submissions (reviewee_user_id);
create index idx_member_feedback_ratings_rated_user_id on public.member_feedback_ratings (rated_user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = check_user_id
      and ur.role = 'admin'
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, display_name, plan_code)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    'sprout'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function public.validate_match_assets()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.assets a
    where a.id = new.member_a_asset_id and a.owner_user_id = new.member_a_user_id
  ) then
    raise exception 'member_a_asset_id must belong to member_a_user_id';
  end if;

  if not exists (
    select 1 from public.assets a
    where a.id = new.member_b_asset_id and a.owner_user_id = new.member_b_user_id
  ) then
    raise exception 'member_b_asset_id must belong to member_b_user_id';
  end if;

  return new;
end;
$$;

create or replace function public.validate_feedback_submission()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.matches m
    where m.id = new.match_id
      and (
        (m.member_a_user_id = new.reviewer_user_id and m.member_b_user_id = new.reviewee_user_id and m.member_b_asset_id = new.asset_id)
        or
        (m.member_b_user_id = new.reviewer_user_id and m.member_a_user_id = new.reviewee_user_id and m.member_a_asset_id = new.asset_id)
      )
  ) then
    raise exception 'feedback can only be left for the matched user and their matched asset';
  end if;

  if coalesce(new.stars::text, '') = ''
     and nullif(btrim(coalesce(new.written_feedback, '')), '') is null
     and new.structured_feedback = '{}'::jsonb
     and new.media_url is null then
    raise exception 'feedback must include at least one format';
  end if;

  return new;
end;
$$;

create or replace function public.validate_member_feedback_rating()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.feedback_submissions fs
    where fs.id = new.feedback_submission_id
      and fs.reviewee_user_id = new.rater_user_id
      and fs.reviewer_user_id = new.rated_user_id
  ) then
    raise exception 'member feedback ratings must target the matched user who submitted the feedback';
  end if;

  return new;
end;
$$;

create or replace function public.validate_review_post_request()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.feedback_submissions fs
    where fs.id = new.feedback_submission_id
      and fs.reviewee_user_id = new.requester_user_id
      and fs.reviewer_user_id = new.reviewer_user_id
  ) then
    raise exception 'review post requests must reference the feedback recipient requesting the original reviewer';
  end if;

  return new;
end;
$$;

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
    select rated_user_id,
           round(avg(stars)::numeric, 2) as avg_stars,
           count(*)::integer as rating_count
    from public.member_feedback_ratings
    where rated_user_id = target_user_id
    group by rated_user_id
  ) s
  where up.user_id = target_user_id;

  if not exists (select 1 from public.member_feedback_ratings where rated_user_id = target_user_id) then
    update public.user_profiles
    set feedback_rating_avg = 0,
        feedback_rating_count = 0,
        updated_at = now()
    where user_id = target_user_id;
  end if;
end;
$$;

create or replace function public.sync_profile_feedback_ratings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_profile_feedback_rating(new.rated_user_id);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_profile_feedback_rating(old.rated_user_id);
  end if;

  return null;
end;
$$;

create trigger trg_user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

create trigger trg_plan_feature_gates_set_updated_at
before update on public.plan_feature_gates
for each row execute function public.set_updated_at();

create trigger trg_assets_set_updated_at
before update on public.assets
for each row execute function public.set_updated_at();

create trigger trg_matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

create trigger trg_feedback_submissions_set_updated_at
before update on public.feedback_submissions
for each row execute function public.set_updated_at();

create trigger trg_validate_match_assets
before insert or update on public.matches
for each row execute function public.validate_match_assets();

create trigger trg_validate_feedback_submission
before insert or update on public.feedback_submissions
for each row execute function public.validate_feedback_submission();

create trigger trg_validate_member_feedback_rating
before insert or update on public.member_feedback_ratings
for each row execute function public.validate_member_feedback_rating();

create trigger trg_validate_review_post_request
before insert or update on public.review_post_requests
for each row execute function public.validate_review_post_request();

create trigger trg_sync_profile_feedback_ratings
after insert or update or delete on public.member_feedback_ratings
for each row execute function public.sync_profile_feedback_ratings();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.user_profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.plan_feature_gates enable row level security;
alter table public.assets enable row level security;
alter table public.asset_channels enable row level security;
alter table public.asset_feedback_formats enable row level security;
alter table public.asset_screenshots enable row level security;
alter table public.matches enable row level security;
alter table public.match_blocked_channels enable row level security;
alter table public.feedback_submissions enable row level security;
alter table public.member_feedback_ratings enable row level security;
alter table public.review_post_requests enable row level security;

create policy "profiles_select_authenticated"
on public.user_profiles for select
to authenticated
using (true);

create policy "profiles_insert_self"
on public.user_profiles for insert
to authenticated
with check (auth.uid() = user_id);

create policy "profiles_update_self"
on public.user_profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "user_roles_select_self_or_admin"
on public.user_roles for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy "user_roles_admin_manage"
on public.user_roles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "feature_gates_select_authenticated"
on public.plan_feature_gates for select
to authenticated
using (true);

create policy "feature_gates_admin_manage"
on public.plan_feature_gates for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "assets_select_visible"
on public.assets for select
to authenticated
using (owner_user_id = auth.uid() or status = 'active');

create policy "assets_insert_self"
on public.assets for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy "assets_update_self"
on public.assets for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "assets_delete_self"
on public.assets for delete
to authenticated
using (owner_user_id = auth.uid());

create policy "asset_channels_select_visible"
on public.asset_channels for select
to authenticated
using (
  exists (
    select 1 from public.assets a
    where a.id = asset_channels.asset_id
      and (a.owner_user_id = auth.uid() or a.status = 'active')
  )
);

create policy "asset_channels_write_owner"
on public.asset_channels for all
to authenticated
using (
  exists (
    select 1 from public.assets a
    where a.id = asset_channels.asset_id
      and a.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.assets a
    where a.id = asset_channels.asset_id
      and a.owner_user_id = auth.uid()
  )
);

create policy "asset_feedback_formats_select_visible"
on public.asset_feedback_formats for select
to authenticated
using (
  exists (
    select 1 from public.assets a
    where a.id = asset_feedback_formats.asset_id
      and (a.owner_user_id = auth.uid() or a.status = 'active')
  )
);

create policy "asset_feedback_formats_write_owner"
on public.asset_feedback_formats for all
to authenticated
using (
  exists (
    select 1 from public.assets a
    where a.id = asset_feedback_formats.asset_id
      and a.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.assets a
    where a.id = asset_feedback_formats.asset_id
      and a.owner_user_id = auth.uid()
  )
);

create policy "asset_screenshots_select_visible"
on public.asset_screenshots for select
to authenticated
using (
  exists (
    select 1 from public.assets a
    where a.id = asset_screenshots.asset_id
      and (a.owner_user_id = auth.uid() or a.status = 'active')
  )
);

create policy "asset_screenshots_write_owner"
on public.asset_screenshots for all
to authenticated
using (
  exists (
    select 1 from public.assets a
    where a.id = asset_screenshots.asset_id
      and a.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.assets a
    where a.id = asset_screenshots.asset_id
      and a.owner_user_id = auth.uid()
  )
);

create policy "matches_select_participants"
on public.matches for select
to authenticated
using (auth.uid() in (member_a_user_id, member_b_user_id));

create policy "matches_admin_manage"
on public.matches for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "match_blocked_channels_select_participants"
on public.match_blocked_channels for select
to authenticated
using (
  exists (
    select 1 from public.matches m
    where m.id = match_blocked_channels.match_id
      and auth.uid() in (m.member_a_user_id, m.member_b_user_id)
  )
);

create policy "match_blocked_channels_admin_manage"
on public.match_blocked_channels for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "feedback_submissions_select_participants"
on public.feedback_submissions for select
to authenticated
using (auth.uid() in (reviewer_user_id, reviewee_user_id));

create policy "feedback_submissions_insert_reviewer"
on public.feedback_submissions for insert
to authenticated
with check (reviewer_user_id = auth.uid());

create policy "feedback_submissions_update_reviewer"
on public.feedback_submissions for update
to authenticated
using (reviewer_user_id = auth.uid())
with check (reviewer_user_id = auth.uid());

create policy "member_feedback_ratings_select_involved"
on public.member_feedback_ratings for select
to authenticated
using (auth.uid() in (rater_user_id, rated_user_id));

create policy "member_feedback_ratings_insert_rater"
on public.member_feedback_ratings for insert
to authenticated
with check (rater_user_id = auth.uid());

create policy "review_post_requests_select_participants"
on public.review_post_requests for select
to authenticated
using (auth.uid() in (requester_user_id, reviewer_user_id));

create policy "review_post_requests_insert_requester"
on public.review_post_requests for insert
to authenticated
with check (requester_user_id = auth.uid());

create policy "review_post_requests_update_participants"
on public.review_post_requests for update
to authenticated
using (auth.uid() in (requester_user_id, reviewer_user_id))
with check (auth.uid() in (requester_user_id, reviewer_user_id));

insert into public.plan_feature_gates (plan_code, feature_key, enabled, limit_int, description, config)
values
  ('sprout', 'auto_matches_per_month', true, 4, 'Automated monthly matches included in plan', '{}'::jsonb),
  ('sprout', 'browse_matches_per_month', false, 0, 'Manual browse matches included in plan', '{}'::jsonb),
  ('sprout', 'max_assets', true, 1, 'Maximum active assets allowed', '{}'::jsonb),
  ('sprout', 'max_channels_per_asset', true, 1, 'Maximum channels allowed per asset', '{}'::jsonb),
  ('sprout', 'advisory_assets_enabled', false, null, 'Whether advisory skill assets are allowed', '{}'::jsonb),
  ('sprout', 'client_assets_enabled', false, null, 'Whether managing client assets is allowed', '{}'::jsonb),
  ('sprout', 'require_specific_feedback_types', false, null, 'Whether owners can require specific feedback combinations', '{}'::jsonb),
  ('sprout', 'degrees_of_separation_control', false, 1, 'Whether plan can change separation degree', '{"max_degree":1}'::jsonb),
  ('sprout', 'semi_duplicate_matching', true, null, 'Whether semi-duplicate matching is available', '{"paid_free_opt_in_required":true}'::jsonb),
  ('sprout', 'team_seats', false, 1, 'Number of seats included', '{}'::jsonb),
  ('bloom', 'auto_matches_per_month', true, 6, 'Automated monthly matches included in plan', '{}'::jsonb),
  ('bloom', 'browse_matches_per_month', true, 6, 'Manual browse matches included in plan', '{}'::jsonb),
  ('bloom', 'max_assets', true, 5, 'Maximum active assets allowed', '{}'::jsonb),
  ('bloom', 'max_channels_per_asset', true, null, 'Maximum channels allowed per asset', '{}'::jsonb),
  ('bloom', 'advisory_assets_enabled', true, null, 'Whether advisory skill assets are allowed', '{}'::jsonb),
  ('bloom', 'client_assets_enabled', true, null, 'Whether managing client assets is allowed', '{}'::jsonb),
  ('bloom', 'require_specific_feedback_types', true, null, 'Whether owners can require specific feedback combinations', '{}'::jsonb),
  ('bloom', 'degrees_of_separation_control', true, 3, 'Whether plan can change separation degree', '{"max_degree":3}'::jsonb),
  ('bloom', 'semi_duplicate_matching', true, null, 'Whether semi-duplicate matching is available', '{"can_disable":true,"allow_paid_free_toggle":true}'::jsonb),
  ('bloom', 'team_seats', false, 1, 'Number of seats included', '{}'::jsonb),
  ('flourish', 'auto_matches_per_month', true, 6, 'Automated monthly matches included in plan', '{}'::jsonb),
  ('flourish', 'browse_matches_per_month', true, 6, 'Manual browse matches included in plan', '{}'::jsonb),
  ('flourish', 'max_assets', true, null, 'Maximum active assets allowed', '{"unlimited":true}'::jsonb),
  ('flourish', 'max_channels_per_asset', true, null, 'Maximum channels allowed per asset', '{}'::jsonb),
  ('flourish', 'advisory_assets_enabled', true, null, 'Whether advisory skill assets are allowed', '{}'::jsonb),
  ('flourish', 'client_assets_enabled', true, null, 'Whether managing client assets is allowed', '{}'::jsonb),
  ('flourish', 'require_specific_feedback_types', true, null, 'Whether owners can require specific feedback combinations', '{}'::jsonb),
  ('flourish', 'degrees_of_separation_control', true, 3, 'Whether plan can change separation degree', '{"max_degree":3}'::jsonb),
  ('flourish', 'semi_duplicate_matching', true, null, 'Whether semi-duplicate matching is available', '{"can_disable":true,"allow_paid_free_toggle":true}'::jsonb),
  ('flourish', 'team_seats', true, 3, 'Number of seats included', '{}'::jsonb);