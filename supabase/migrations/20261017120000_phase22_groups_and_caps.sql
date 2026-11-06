-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 22 / Discord D2 — groups and caps, on the site.
--
-- The ordering rule from the build spec: groups work on the site before they
-- work in Discord. The site is the source of truth and the bot is a client of
-- it, so every command D3 adds lands on an RPC that is already tested, and a
-- Discord outage degrades to a usable product rather than no product.
--
-- What this file adds:
--
--   1. Three cap gates          max_concurrent_matchups, max_concurrent_groups,
--                               feedback_groups_per_month
--   2. user_profiles.track      the entry cohort, plus set_member_track
--   3. groups / group_members   one pair of tables for feedback groups and
--                               (from D5) challenge cohorts
--   4. matches.in_group_id      a group pairing, exempt from match quota
--      matches.discord_thread_id  a 1-on-1's room
--   5. Caps and helpers         concurrency, open groups, joins this month
--   6. match_candidates_for     the ungated core of eligible_match_candidates
--   7. The group RPCs           create / invite / respond / join / review /
--                               leave / close, plus three readers
--   8. recommend_group_members  wraps the matcher; adds the all-pairs rule
--   9. create_match             drops and recreates with p_in_group_id and
--                               the concurrency cap
--
-- Two traps the Phase 21 handoff named explicitly, and how they are handled:
--
--   • THE SURFACE GATE WOULD BREAK THE RECOMMENDER IN D3.
--     eligible_match_candidates carries the Phase A guard and raises
--     'matching is handled in Discord' unless match_surface() = 'web'. The
--     gate is live as 'web' today, so a recommender built on that RPC would
--     pass every test now and silently stop working for members the day D3
--     flips the gate to 'discord' — surfacing as a D3 bug when it is really
--     a D2 decision. So section 6 extracts the candidate query into
--     match_candidates_for(), which takes the member explicitly and applies
--     NO surface gate, and eligible_match_candidates becomes a thin gated
--     wrapper around it. One copy of the matching logic, two entry points
--     with different guards. verify-phase22.mjs flips the gate to 'discord'
--     and asserts the recommender still answers while the member-facing RPC
--     still refuses.
--
--   • APPEND-ONLY TABLES NEED `FOR EACH ROW`.
--     Phase 21 learned it the hard way. Neither table here is append-only —
--     group_members rows change status through their whole lifecycle — so no
--     such trigger exists to get wrong. The lesson still shapes the foreign
--     keys below: every FK was chosen by asking what deleting an account is
--     allowed to do, before writing the constraint. See section 3.
--
-- Deliberately NOT here (D4 owns them): widening create_match for
-- source = 'discord', the service-role act-as path for create_match, and
-- widening member_feedback_ratings to (rater, rated, feedback_submission_id).
--
-- Idempotent / safely re-runnable.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The three cap gates
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Numbers live in gate rows, so changing one costs nothing and needs no
-- deploy. That is also the documented rollback for this whole phase: raise
-- the limits, the tables stay.
--
-- `flourish` is seeded as a twin of `bloom` rather than left undefined. The
-- tier is retired and set_member_plan refuses it, but a dormant enum value
-- with no gate rows is a surprise waiting for whoever assigns it by
-- accident — plan_feature_limit would return null, which several callers
-- read as "unlimited".
--
-- ON CONFLICT DO NOTHING, not DO UPDATE, and that is load-bearing: raising a
-- limit is this phase's rollback, so re-running this file must never quietly
-- revert an admin's change. (Phase A's match_surface seed is DO NOTHING for
-- the same reason.)
--
-- public_plan_caps() already whitelists all three keys and plans.js already
-- carries their labels — both landed in Phase 21b — so these rows appear on
-- /pricing the moment they exist, with no code change.

insert into public.plan_feature_gates (plan_code, feature_key, enabled, limit_int, description, config)
values
  ('sprout',   'max_concurrent_matchups', true, 1, 'Open 1-on-1 match-ups a member may hold at once. Group pairings are exempt.', '{}'::jsonb),
  ('bloom',    'max_concurrent_matchups', true, 3, 'Open 1-on-1 match-ups a member may hold at once. Group pairings are exempt.', '{}'::jsonb),
  ('flourish', 'max_concurrent_matchups', true, 3, 'Open 1-on-1 match-ups a member may hold at once. Group pairings are exempt.', '{}'::jsonb),

  ('sprout',   'max_concurrent_groups', true, 1, 'Feedback groups a member may be an active member of at once.', '{}'::jsonb),
  ('bloom',    'max_concurrent_groups', true, 3, 'Feedback groups a member may be an active member of at once.', '{}'::jsonb),
  ('flourish', 'max_concurrent_groups', true, 3, 'Feedback groups a member may be an active member of at once.', '{}'::jsonb),

  ('sprout',   'feedback_groups_per_month', true, 1, 'Feedback groups a member may newly join in one calendar month.', '{}'::jsonb),
  ('bloom',    'feedback_groups_per_month', true, 3, 'Feedback groups a member may newly join in one calendar month.', '{}'::jsonb),
  ('flourish', 'feedback_groups_per_month', true, 3, 'Feedback groups a member may newly join in one calendar month.', '{}'::jsonb)
on conflict (plan_code, feature_key) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. user_profiles.track — the entry cohort
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The build spec gives the recommender a rule it cannot execute today:
-- "filters the result by the group's Track". There was no Track anywhere in
-- the database, so this column is what makes that rule real, and it is the
-- same column D3 reads to grant the Discord Track role.
--
-- ONE track per member, deliberately. A Track is the starting-point cohort
-- from the Skool join poll — where someone came in — and that is singular.
-- Members WILL belong to several rooms at once, but the shape for that
-- already exists: a room is a `groups` row, and belonging to several is
-- several `group_members` rows. The Missions / Build Groups idea is
-- `groups` (kind = 'challenge' from D5), not a second track column. If that
-- turns out to be wrong, the additive fix is a `member_tracks` join table
-- and this column becomes the primary — nothing below assumes one track
-- except the recommender's filter, which would then read the join table.
--
-- Null means unset, and it is the default: the recommender treats a null
-- group track as cross-track and a null member track as "do not filter this
-- candidate out", so an empty column degrades to today's behaviour rather
-- than to an empty list.

alter table public.user_profiles add column if not exists track text;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_profiles'::regclass and conname = 'user_profiles_track_check'
  ) then
    alter table public.user_profiles drop constraint user_profiles_track_check;
  end if;
  alter table public.user_profiles
    add constraint user_profiles_track_check
    check (track is null or track in ('ai_builders', 'agency_marketers', 'offline_operators', 'creators'));
end $$;

create index if not exists idx_user_profiles_track
  on public.user_profiles (track)
  where track is not null;

comment on column public.user_profiles.track is
  'The member''s entry cohort from the Skool join poll: ai_builders, agency_marketers, offline_operators, creators, or null. One per member — belonging to several rooms is group_members rows, not several tracks. Read by recommend_group_members and (from D3) the Discord Track role. See 20261017120000_phase22_groups_and_caps.sql.';

-- The writer. 20260715120000 revoked insert/update/delete on user_profiles
-- from anon and authenticated, so a member cannot set this through
-- PostgREST however permissive the select policy is — an RPC is the only
-- road, which is the same arrangement plan_code has.
create or replace function public.set_member_track(
  p_track text,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_service boolean := auth.role() = 'service_role';
  v_target uuid := coalesce(p_user_id, v_caller);
  v_track text := nullif(btrim(coalesce(p_track, '')), '');
  v_previous text;
begin
  if v_target is null then
    raise exception 'authentication required';
  end if;

  -- A member may set their own; an admin or the bot may set anyone's, which
  -- is how the Skool join poll will land in D3.
  if not (v_is_service or public.is_admin() or coalesce(v_target = v_caller, false)) then
    raise exception 'you can only set your own track';
  end if;

  if v_track is not null and v_track not in ('ai_builders', 'agency_marketers', 'offline_operators', 'creators') then
    raise exception 'track must be ai_builders, agency_marketers, offline_operators or creators';
  end if;

  select track into v_previous from public.user_profiles where user_id = v_target for update;
  if not found then
    raise exception 'member not found';
  end if;

  update public.user_profiles
  set track = v_track,
      updated_at = now()
  where user_id = v_target;

  return jsonb_build_object(
    'status', case when v_previous is not distinct from v_track then 'unchanged' else 'changed' end,
    'user_id', v_target,
    'track', v_track,
    'previous_track', v_previous
  );
end;
$$;

revoke all on function public.set_member_track(text, uuid) from public;
grant execute on function public.set_member_track(text, uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. groups and group_members
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A private feedback group and a build-challenge cohort are the same thing
-- with a different kind, a different size and a different clock, so one pair
-- of tables covers both and the Sep 24 plan's squads / squad_members sketch
-- is retired rather than built. D5 fills in kind = 'challenge'; everything
-- here works for it already except the Pro gate, which is D5's.
--
-- FOREIGN KEYS — decided by asking what deleting an account may do:
--
--   created_by → user_profiles ON DELETE SET NULL, and nullable, which
--     departs from the spec's `not null`. A group is a shared room, not the
--     creator's property. With `not null` the FK would have to cascade, and
--     one member deleting their account would evaporate a four-person group,
--     take its group_members rows with it, and (worse) take the provenance
--     off the matches that happened inside it. A null creator is a smaller
--     loss than that, and close_group lets an admin tidy up afterwards.
--
--   group_members.user_id → user_profiles ON DELETE CASCADE. A departed
--     member's membership row is not evidence of anything; the matches they
--     were in are, and those cascade on their own terms.
--
--   group_members.asset_id → assets ON DELETE SET NULL. RESTRICT was the
--     first instinct — it is what matches does with the assets it points at —
--     and it was wrong here. Deleting an account cascades BOTH its assets and
--     its group_members rows from the same parent row, so whether RESTRICT
--     fired depended on the order PostgreSQL happened to run two cascade
--     triggers in. It worked. "It worked" is not a guarantee, and an account
--     that cannot be deleted is the exact failure Phase 21 shipped. SET NULL
--     makes deletion unconditional; the member keeps their seat with nothing
--     on it, and set_group_asset lets them put something back.
--
--   matches.in_group_id → groups ON DELETE RESTRICT (section 4). Groups are
--     closed, never deleted, and nothing deletes one as a side effect now
--     that created_by sets null — so restrict costs nothing and protects the
--     invariant that section 4's CHECK depends on.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'feedback' check (kind in ('feedback', 'challenge')),
  name text not null check (btrim(name) <> '' and char_length(name) <= 120),
  created_by uuid references public.user_profiles(user_id) on delete set null,
  track text check (track is null or track in ('ai_builders', 'agency_marketers', 'offline_operators', 'creators')),
  visibility text not null default 'private' check (visibility in ('private', 'listed', 'open')),
  max_members smallint not null default 6,
  discord_thread_id text,
  discord_channel_id text,
  opens_at timestamptz,
  closes_at timestamptz,
  status text not null default 'forming' check (status in ('forming', 'active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Sizes, from the locked decisions: feedback groups 4–6, challenge cohorts
  -- up to 12 and as small as 2. max_members is the ceiling the group fills
  -- toward, not its current size.
  constraint groups_max_members_by_kind check (
    (kind = 'feedback'  and max_members between 4 and 6) or
    (kind = 'challenge' and max_members between 2 and 12)
  ),
  constraint groups_clock_ordered check (opens_at is null or closes_at is null or closes_at > opens_at)
);

create index if not exists idx_groups_discoverable
  on public.groups (visibility, status, kind)
  where visibility in ('listed', 'open') and status in ('forming', 'active');
create index if not exists idx_groups_created_by on public.groups (created_by);
create index if not exists idx_groups_track on public.groups (track) where track is not null;

comment on table public.groups is
  'Feedback groups and (from D5) build-challenge cohorts. The room; the record is the matches rows created inside it. Written only by the RPCs in this file. See 20261017120000_phase22_groups_and_caps.sql.';
comment on column public.groups.visibility is
  'private = invite only, unlisted. listed = discoverable, join by request (the owner approves). open = any linked member joins, subject to their plan caps.';
comment on column public.groups.discord_thread_id is
  'The private thread for a feedback group. Private threads, not channels: a server caps at 500 channels, so 125 groups would fill it.';

-- Invites and join requests are group_members rows, so there is no third
-- table and a declined invite leaves an auditable row. The spec's four
-- statuses gained two:
--
--   'requested' — a member asked to join a `listed` group. The owner (or an
--     admin) approves or declines. This is the gate the product wants:
--     discovery on the site is open, but arriving in someone's room is not.
--   'declined'  — an invite refused, or a request turned down. The spec asks
--     for the audit row; without a status of its own it would have to
--     masquerade as 'removed', which means something different.
create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_via text not null check (joined_via in ('created', 'invite', 'recommender', 'apply')),
  asset_id uuid references public.assets(id) on delete set null,
  status text not null default 'invited'
    check (status in ('requested', 'invited', 'active', 'left', 'removed', 'declined')),
  invited_by_user_id uuid references public.user_profiles(user_id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, user_id)
  -- No table-level "an active member has an asset" CHECK, and that is a
  -- decision rather than an omission. See section 12: the CHECK and the
  -- asset_id foreign key's ON DELETE SET NULL cannot both hold, and the
  -- alternative FK action (RESTRICT) made account deletion depend on the
  -- order PostgreSQL happens to fire cascade triggers in. The requirement
  -- lives in assert_pairable_asset, on every path that reaches 'active'.
);

create index if not exists idx_group_members_group on public.group_members (group_id, status);
create index if not exists idx_group_members_user on public.group_members (user_id, status);
create index if not exists idx_group_members_joined_at on public.group_members (user_id, joined_at desc) where joined_at is not null;

comment on table public.group_members is
  'Membership, invites and join requests in one table — a declined invite leaves an auditable row. Written only by the RPCs in this file.';
comment on column public.group_members.joined_via is
  'created | invite | recommender | apply. What tells you later whether recommended members outperform self-invited ones.';

drop trigger if exists trg_groups_set_updated_at on public.groups;
create trigger trg_groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

drop trigger if exists trg_group_members_set_updated_at on public.group_members;
create trigger trg_group_members_set_updated_at
before update on public.group_members
for each row execute function public.set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. matches — in_group_id and discord_thread_id
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A four-person feedback group produces up to six pairings. Left alone,
-- joining one group would spend a free member's whole monthly match quota in
-- an afternoon. The member made ONE decision — join a group — so they are
-- charged one group, and groups are capped separately by the two gates in
-- section 1.
--
-- source = 'group' is the fourth value this column has gained (Phase A added
-- 'discord'), and it exists so that a quota-exempt row is visibly different
-- in the data. Anyone auditing why usage did not increment should be able to
-- see the answer in the row rather than infer it, which is also what makes
-- the biconditional CHECK below possible: the exemption and the label cannot
-- drift apart.

alter table public.matches add column if not exists in_group_id uuid;
alter table public.matches add column if not exists discord_thread_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.matches'::regclass and conname = 'matches_in_group_id_fkey'
  ) then
    alter table public.matches
      add constraint matches_in_group_id_fkey
      foreign key (in_group_id) references public.groups(id) on delete restrict;
  end if;
end $$;

create index if not exists idx_matches_in_group on public.matches (in_group_id) where in_group_id is not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.matches'::regclass and conname = 'matches_source_check'
  ) then
    alter table public.matches drop constraint matches_source_check;
  end if;
  alter table public.matches
    add constraint matches_source_check
    check (source in ('auto', 'browse', 'queued', 'discord', 'group'));

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.matches'::regclass and conname = 'matches_group_source_agrees'
  ) then
    alter table public.matches drop constraint matches_group_source_agrees;
  end if;
  alter table public.matches
    add constraint matches_group_source_agrees
    check ((in_group_id is null) = (source <> 'group'));
end $$;

comment on column public.matches.source is
  'Who created the match: auto (system monthly), browse (web Browse page), queued (web, deferred by quota), discord (the bot, D4), group (a pairing inside a groups row — exempt from monthly quota and the concurrency cap). source = ''group'' and in_group_id are kept in step by matches_group_source_agrees.';
comment on column public.matches.in_group_id is
  'The group this pairing happened inside, or null for a real 1-on-1. Set means exempt from monthly match quota and from max_concurrent_matchups: the member is charged one group, not its pairings.';
comment on column public.matches.discord_thread_id is
  'The private thread giving a 1-on-1 match-up a room. groups is for three or more.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Helpers — identity, membership, and the three caps
-- ═══════════════════════════════════════════════════════════════════════════
--
-- resolve_acting_member exists because of a constraint the handoff spells
-- out: the bot cannot call member RPCs, since they resolve the caller from
-- auth.uid() and that is null for a service-role call. D1 solved it for its
-- own RPCs by taking the external id as an argument; D4 owes create_match
-- the same thing. Rather than build the group RPCs with the same hole and
-- then reopen all seven of them in D3, every writer below takes an optional
-- p_acting_user_id that is honoured ONLY for the service role. A member
-- passing someone else's id is refused, and passing their own is a no-op.
--
-- This is the shape D4 should reuse for create_match. It is not applied to
-- create_match here: that function's act-as path and its source = 'discord'
-- guard are D4's, and widening them is a bigger decision than unblocking a
-- new RPC that no one calls yet.

create or replace function public.resolve_acting_member(p_acting_user_id uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if auth.role() = 'service_role' then
    if p_acting_user_id is null then
      raise exception 'a service-role call must name the member it is acting for';
    end if;
    return p_acting_user_id;
  end if;

  if v_caller is null then
    raise exception 'authentication required';
  end if;

  if p_acting_user_id is not null and p_acting_user_id <> v_caller then
    raise exception 'you cannot act on behalf of another member';
  end if;

  return v_caller;
end;
$$;

-- assert_active_caller() only knows how to check auth.uid(), which is null on
-- the act-as path. This is the by-id form D4's list already asks for.
create or replace function public.assert_active_user(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select account_status into v_status from public.user_profiles where user_id = p_user_id;

  if not found then
    raise exception 'member not found';
  end if;

  if v_status = 'suspended' then
    raise exception 'this account is suspended and cannot perform this action';
  end if;
end;
$$;

-- Membership, as a security-definer read. The RLS policies in section 10 need
-- to ask "is this person in that group?" from inside a policy on
-- group_members itself; a policy that queries its own table recurses, and
-- this function is what breaks the cycle.
create or replace function public.is_group_member(
  p_group_id uuid,
  p_user_id uuid default auth.uid(),
  p_statuses text[] default array['active']
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.status = any (coalesce(p_statuses, array['active']))
  );
$$;

create or replace function public.group_role_of(
  p_group_id uuid,
  p_user_id uuid default auth.uid()
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select gm.role
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.user_id = p_user_id
    and gm.status = 'active'
  limit 1;
$$;

-- Ownership as a BOOLEAN, which group_role_of() cannot be: it returns null
-- for someone with no seat, and `null = 'owner'` is null, not false. Every
-- owner-only guard here is of the form
--
--   if not (<owner?> or <service role?> or is_admin()) then raise
--
-- and a single null operand makes that whole expression null, which `if`
-- treats as false — so the guard silently waves everyone through. That is
-- precisely what happened before this function existed: a non-member could
-- invite to someone else's group, approve their own join request, and read
-- another group's recommendations. `exists` is never null, and the service /
-- admin operands are wrapped in coalesce for the same reason.
create or replace function public.is_group_owner(
  p_group_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.status = 'active'
      and gm.role = 'owner'
  );
$$;

-- ── The three caps ──────────────────────────────────────────────────────────
--
-- Each is a count plus a gate row, and each counts only what the cap is
-- about:
--
--   concurrent match-ups — the four open statuses the spec names, and ONLY
--     rows with in_group_id null. Counting group pairings here would make a
--     sprout member's cap of 1 unsatisfiable the moment they joined a
--     four-person group, which is the opposite of the intent.
--
--   open groups — active membership of a feedback group that is still
--     forming or active. Challenge cohorts are not counted: D5 gates those
--     on plan_code = 'bloom' separately, and charging them against the
--     feedback-group cap would mean joining a cohort costs you a group.
--
--   groups joined this month — any feedback membership that BECAME active
--     this month, including ones since left or removed. Counting only
--     current memberships would let a member join, leave and rejoin without
--     limit, which is not a monthly cap at all.

create or replace function public.member_concurrent_matchup_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.matches m
  where (m.member_a_user_id = p_user_id or m.member_b_user_id = p_user_id)
    and m.in_group_id is null
    and m.status in ('matched', 'accepted', 'feedback_pending', 'awaiting_post');
$$;

create or replace function public.member_open_group_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  where gm.user_id = p_user_id
    and gm.status = 'active'
    and g.kind = 'feedback'
    and g.status in ('forming', 'active');
$$;

create or replace function public.member_groups_joined_this_month(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  where gm.user_id = p_user_id
    and g.kind = 'feedback'
    and gm.joined_at is not null
    and gm.joined_at >= public.month_bucket_start(now());
$$;

-- One place that decides whether a member may take up a feedback-group seat,
-- so the create, join and approve paths cannot disagree about it. Called
-- again at approval time as well as at request time: weeks can pass between
-- asking and being let in, and the cap that matters is the one in force when
-- the seat is actually taken.
create or replace function public.assert_can_take_group_seat(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan public.plan_code;
  v_open_limit integer;
  v_month_limit integer;
begin
  select plan_code into v_plan from public.user_profiles where user_id = p_user_id;
  if not found then
    raise exception 'member not found';
  end if;

  v_open_limit := public.plan_feature_limit(v_plan, 'max_concurrent_groups');
  v_month_limit := public.plan_feature_limit(v_plan, 'feedback_groups_per_month');

  -- A null limit means the gate row is missing, which is why section 1 seeds
  -- every plan including the dormant one. Treated as unlimited rather than
  -- zero: a missing seed must not lock members out of a feature they pay for.
  if v_open_limit is not null and public.member_open_group_count(p_user_id) >= v_open_limit then
    raise exception 'you are already in % feedback group(s), which is the limit on your plan', v_open_limit;
  end if;

  if v_month_limit is not null and public.member_groups_joined_this_month(p_user_id) >= v_month_limit then
    raise exception 'you have joined % feedback group(s) this month, which is the limit on your plan', v_month_limit;
  end if;
end;
$$;

revoke all on function public.resolve_acting_member(uuid) from public;
revoke all on function public.assert_active_user(uuid) from public;
revoke all on function public.assert_can_take_group_seat(uuid) from public;
grant execute on function public.is_group_member(uuid, uuid, text[]) to authenticated;
grant execute on function public.group_role_of(uuid, uuid) to authenticated;
grant execute on function public.is_group_owner(uuid, uuid) to authenticated;
grant execute on function public.member_concurrent_matchup_count(uuid) to authenticated;
grant execute on function public.member_open_group_count(uuid) to authenticated;
grant execute on function public.member_groups_joined_this_month(uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. match_candidates_for — the ungated core, and the gated wrapper
-- ═══════════════════════════════════════════════════════════════════════════
--
-- THE FIRST TRAP, closed. eligible_match_candidates carries the Phase A
-- surface guard: it raises 'matching is handled in Discord' unless
-- match_surface() = 'web', the caller is the service role, or the caller is
-- an admin. The gate is live as 'web', so a recommender built on top of it
-- would pass every test today and silently stop answering members the day D3
-- flips the gate to 'discord'. It would look like a D3 bug. It is a D2
-- decision.
--
-- So the candidate query moves here, with the member as an explicit argument
-- and no surface gate — because a group recommendation is not the web
-- matching surface, it is the engine underneath both surfaces.
-- eligible_match_candidates keeps its name, signature and guard and becomes
-- a wrapper, so there is still exactly one copy of the matching logic.
--
-- The body is unchanged from 20260925120000 apart from reading p_for_user_id
-- where it read auth.uid(). Execute is revoked from everyone: the only
-- callers are the two security-definer functions below, which run as the
-- owner.

create or replace function public.match_candidates_for(
  p_for_user_id uuid,
  p_asset_id uuid,
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
stable
security definer
set search_path = public
as $$
declare
  v_profile public.user_profiles%rowtype;
  v_usage_month date := public.month_bucket_start(now());
begin
  if p_for_user_id is null then
    raise exception 'a member is required';
  end if;

  select * into v_profile
  from public.user_profiles
  where user_id = p_for_user_id;

  if not found then
    raise exception 'caller profile not found';
  end if;

  if not exists (
    select 1
    from public.assets a
    where a.id = p_asset_id
      and a.owner_user_id = p_for_user_id
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
        where ((m.member_a_user_id = p_for_user_id and m.member_b_user_id = up.user_id)
            or (m.member_a_user_id = up.user_id and m.member_b_user_id = p_for_user_id))
          and m.status not in ('cancelled', 'completed')
      ) as has_active_match,
      (
        select count(*)::integer
        from public.matches m
        where (m.member_a_user_id = p_for_user_id and m.member_b_user_id = up.user_id)
           or (m.member_a_user_id = up.user_id and m.member_b_user_id = p_for_user_id)
      ) as prior_match_count,
      public.member_shortest_path_degree(p_for_user_id, up.user_id, 4) as shortest_path_degree
    from public.user_profiles up
    join public.assets a
      on a.owner_user_id = up.user_id
     and a.status = 'active'
     and a.moderation_status = 'ok'
    left join public.user_monthly_usage umu
      on umu.user_id = up.user_id
     and umu.usage_month = v_usage_month
    where up.user_id <> p_for_user_id
      -- Suspended members are not matchable (create_match rejects them too).
      -- 'warned' stays eligible, and up.moderation_status is deliberately NOT
      -- checked — on user_profiles it means "bio removed", not a hidden account.
      and up.account_status <> 'suspended'
      -- Demo and real members never see each other as candidates (create_match
      -- enforces the same wall, so anything else would be an unusable result).
      and up.is_demo = v_profile.is_demo
  )
  select
    cb.candidate_user_id,
    cb.candidate_asset_id,
    cb.candidate_display_name,
    cb.candidate_plan_code,
    cb.candidate_asset_name,
    cb.candidate_asset_type,
    cb.shortest_path_degree,
    (cb.shortest_path_degree is null or cb.shortest_path_degree > greatest(v_profile.degrees_of_separation, cb.candidate_degree_pref) + 1) as respects_separation_preference,
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

comment on function public.match_candidates_for(uuid, uuid, integer, integer) is
  'The candidate query with no surface gate, for callers that are not the web matching surface. Execute is revoked from every role on purpose: call it only from a security-definer function that has already decided the caller may ask. eligible_match_candidates is the gated member-facing wrapper; recommend_group_members is the other caller.';

-- The member-facing entry point. Same name, same signature, same guard as
-- 20260925120000 — only the body moved.
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
stable
security definer
set search_path = public
as $$
declare
  v_caller_user_id uuid := auth.uid();
begin
  -- Phase A match-surface gate: member calls are refused unless this plan's
  -- surface is 'web'; the service role (Discord bot) and admins always pass.
  if not (public.match_surface() = 'web'
          or coalesce(auth.role() = 'service_role', false) or public.is_admin()) then
    raise exception 'matching is handled in Discord';
  end if;

  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;

  return query
  select * from public.match_candidates_for(v_caller_user_id, p_my_asset_id, p_limit, p_offset);
end;
$$;

revoke all on function public.match_candidates_for(uuid, uuid, integer, integer) from public;
revoke all on function public.eligible_match_candidates(uuid, integer, integer) from public;
grant execute on function public.eligible_match_candidates(uuid, integer, integer) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. The group RPCs
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Seven writers, and they are the only road into these tables: section 10
-- revokes insert, update and delete from anon and authenticated, the same
-- arrangement user_profiles has had since 20260715120000.
--
-- Every one of them resolves the member through resolve_acting_member, so
-- D3's bot calls the same functions a member's browser does and inherits
-- every check rather than reimplementing a subset of them.

create or replace function public.group_active_member_count(p_group_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.status = 'active';
$$;

grant execute on function public.group_active_member_count(uuid) to authenticated;

-- Demo accounts live alongside real members but never match across the line,
-- and a group is a machine for producing matches — so a mixed group would be
-- a room whose pairings create_match refuses one by one. Checked when a seat
-- is taken. The empty-group case needs no rule: whoever arrives first sets
-- which side of the line the room is on.
create or replace function public.assert_group_demo_wall(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_demo boolean;
begin
  select is_demo into v_is_demo from public.user_profiles where user_id = p_user_id;

  if exists (
    select 1
    from public.group_members gm
    join public.user_profiles up on up.user_id = gm.user_id
    where gm.group_id = p_group_id
      and gm.status = 'active'
      and up.is_demo <> v_is_demo
  ) then
    raise exception 'demo accounts can only share a group with other demo accounts';
  end if;
end;
$$;

revoke all on function public.assert_group_demo_wall(uuid, uuid) from public;

-- An asset that can actually be paired: owned by this member, active, and
-- past moderation. create_match applies exactly these three conditions, so
-- accepting anything looser here would seat a member who can never be paired.
create or replace function public.assert_pairable_asset(p_user_id uuid, p_asset_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_asset_id is null then
    raise exception 'bring an asset: a feedback group pairs members by what they want reviewed';
  end if;

  if not exists (
    select 1 from public.assets a
    where a.id = p_asset_id
      and a.owner_user_id = p_user_id
      and a.status = 'active'
      and a.moderation_status = 'ok'
  ) then
    raise exception 'your selected asset must exist, be active, and have passed moderation';
  end if;
end;
$$;

revoke all on function public.assert_pairable_asset(uuid, uuid) from public;

-- ── create_group ────────────────────────────────────────────────────────────
--
-- kind = 'challenge' is admin-only and takes no seat: a cohort's name is
-- admin-chosen, the admin is its organiser rather than a participant, and D5
-- gates who may JOIN one on plan_code = 'bloom'. Feedback groups are the
-- member-facing kind, and their creator takes the first seat — which is why
-- they need an asset and why the seat counts against both group caps.

create or replace function public.create_group(
  p_name text,
  p_asset_id uuid default null,
  p_kind text default 'feedback',
  p_track text default null,
  p_visibility text default 'private',
  p_max_members smallint default null,
  p_acting_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := public.resolve_acting_member(p_acting_user_id);
  v_kind text := coalesce(nullif(btrim(lower(p_kind)), ''), 'feedback');
  v_visibility text := coalesce(nullif(btrim(lower(p_visibility)), ''), 'private');
  v_track text := nullif(btrim(lower(coalesce(p_track, ''))), '');
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_max smallint;
  v_group_id uuid;
begin
  perform public.assert_active_user(v_member);

  if v_name is null then
    raise exception 'a group needs a name';
  end if;

  if v_kind not in ('feedback', 'challenge') then
    raise exception 'kind must be feedback or challenge';
  end if;

  if v_visibility not in ('private', 'listed', 'open') then
    raise exception 'visibility must be private, listed or open';
  end if;

  if v_track is not null and v_track not in ('ai_builders', 'agency_marketers', 'offline_operators', 'creators') then
    raise exception 'track must be ai_builders, agency_marketers, offline_operators or creators';
  end if;

  if v_kind = 'challenge' and not (coalesce(auth.role() = 'service_role', false) or public.is_admin()) then
    raise exception 'challenge cohorts are created by an admin';
  end if;

  v_max := coalesce(p_max_members, case when v_kind = 'challenge' then 12 else 6 end)::smallint;

  if v_kind = 'feedback' then
    perform public.assert_can_take_group_seat(v_member);
    perform public.assert_pairable_asset(v_member, p_asset_id);
  end if;

  insert into public.groups (kind, name, created_by, track, visibility, max_members, status)
  values (v_kind, v_name, v_member, v_track, v_visibility, v_max, 'forming')
  returning id into v_group_id;

  if v_kind = 'feedback' then
    insert into public.group_members (group_id, user_id, role, joined_via, asset_id, status, joined_at)
    values (v_group_id, v_member, 'owner', 'created', p_asset_id, 'active', now());
  end if;

  return jsonb_build_object(
    'status', 'created',
    'group_id', v_group_id,
    'kind', v_kind,
    'name', v_name,
    'track', v_track,
    'visibility', v_visibility,
    'max_members', v_max
  );
end;
$$;

-- ── invite_to_group ─────────────────────────────────────────────────────────
--
-- joined_via carries whether the invite came out of the recommendations or
-- the owner's own head, which is the column that answers "do recommended
-- members outperform self-invited ones" a year from now. A re-invite after a
-- decline or a departure updates the existing row rather than adding a
-- second one, because (group_id, user_id) is unique and the history that
-- matters is the current state plus the audit of how it got there.

create or replace function public.invite_to_group(
  p_group_id uuid,
  p_user_id uuid,
  p_joined_via text default 'invite',
  p_acting_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := public.resolve_acting_member(p_acting_user_id);
  v_group public.groups%rowtype;
  v_via text := coalesce(nullif(btrim(lower(p_joined_via)), ''), 'invite');
  v_existing public.group_members%rowtype;
begin
  perform public.assert_active_user(v_member);

  if v_via not in ('invite', 'recommender') then
    raise exception 'joined_via must be invite or recommender';
  end if;

  select * into v_group from public.groups where id = p_group_id for update;
  if not found then
    raise exception 'group not found';
  end if;

  if v_group.status = 'closed' then
    raise exception 'this group is closed';
  end if;

  if not (public.is_group_owner(p_group_id, v_member)
          or coalesce(auth.role() = 'service_role', false) or public.is_admin()) then
    raise exception 'only the group owner can invite members';
  end if;

  if p_user_id = v_member then
    raise exception 'you are already in this group';
  end if;

  perform public.assert_active_user(p_user_id);
  perform public.assert_group_demo_wall(p_group_id, p_user_id);

  if public.group_active_member_count(p_group_id) >= v_group.max_members then
    raise exception 'this group is full (% of % seats)',
      public.group_active_member_count(p_group_id), v_group.max_members;
  end if;

  select * into v_existing
  from public.group_members
  where group_id = p_group_id and user_id = p_user_id
  for update;

  if found then
    if v_existing.status = 'active' then
      return jsonb_build_object('status', 'already_member', 'group_id', p_group_id, 'user_id', p_user_id);
    end if;

    if v_existing.status = 'invited' then
      return jsonb_build_object('status', 'already_invited', 'group_id', p_group_id, 'user_id', p_user_id);
    end if;

    -- A standing request plus an invite is agreement from both sides, so the
    -- invite approves the request rather than replacing it with a weaker state.
    if v_existing.status = 'requested' then
      perform public.assert_can_take_group_seat(p_user_id);
      perform public.assert_pairable_asset(p_user_id, v_existing.asset_id);

      update public.group_members
      set status = 'active', joined_at = now(), invited_by_user_id = v_member
      where id = v_existing.id;

      return jsonb_build_object('status', 'joined', 'group_id', p_group_id, 'user_id', p_user_id);
    end if;

    update public.group_members
    set status = 'invited', joined_via = v_via, invited_by_user_id = v_member, joined_at = null
    where id = v_existing.id;

    return jsonb_build_object('status', 'invited', 'group_id', p_group_id, 'user_id', p_user_id, 'reinvited', true);
  end if;

  insert into public.group_members (group_id, user_id, role, joined_via, status, invited_by_user_id)
  values (p_group_id, p_user_id, 'member', v_via, 'invited', v_member);

  return jsonb_build_object('status', 'invited', 'group_id', p_group_id, 'user_id', p_user_id, 'reinvited', false);
end;
$$;

-- ── respond_to_group_invite ─────────────────────────────────────────────────

create or replace function public.respond_to_group_invite(
  p_group_id uuid,
  p_accept boolean,
  p_asset_id uuid default null,
  p_acting_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := public.resolve_acting_member(p_acting_user_id);
  v_group public.groups%rowtype;
  v_row public.group_members%rowtype;
begin
  perform public.assert_active_user(v_member);

  select * into v_group from public.groups where id = p_group_id for update;
  if not found then
    raise exception 'group not found';
  end if;

  select * into v_row
  from public.group_members
  where group_id = p_group_id and user_id = v_member
  for update;

  if not found or v_row.status <> 'invited' then
    raise exception 'you have no open invitation to this group';
  end if;

  if not p_accept then
    update public.group_members set status = 'declined' where id = v_row.id;
    return jsonb_build_object('status', 'declined', 'group_id', p_group_id);
  end if;

  if v_group.status = 'closed' then
    raise exception 'this group is closed';
  end if;

  if v_group.kind = 'feedback' then
    perform public.assert_can_take_group_seat(v_member);
  end if;
  perform public.assert_pairable_asset(v_member, coalesce(p_asset_id, v_row.asset_id));
  perform public.assert_group_demo_wall(p_group_id, v_member);

  if public.group_active_member_count(p_group_id) >= v_group.max_members then
    raise exception 'this group filled up before you accepted';
  end if;

  update public.group_members
  set status = 'active',
      asset_id = coalesce(p_asset_id, v_row.asset_id),
      joined_at = now()
  where id = v_row.id;

  return jsonb_build_object('status', 'joined', 'group_id', p_group_id, 'role', v_row.role);
end;
$$;

-- ── join_group ──────────────────────────────────────────────────────────────
--
-- The three visibilities are three different answers to "may I come in":
--
--   open    — yes, subject to your own plan caps. No human in the loop.
--   listed  — ask. The row lands at 'requested' and the owner (or an admin)
--             decides. Discovery on the site is open; arriving in someone's
--             room is not.
--   private — no. Invitation only.
--
-- The asset is recorded with the request rather than at approval, so saying
-- yes is one click for the owner and the caps can be checked immediately
-- with a message the requester can act on. They are checked AGAIN at
-- approval, because weeks can pass and the cap that binds is the one in
-- force when the seat is taken.

create or replace function public.join_group(
  p_group_id uuid,
  p_asset_id uuid default null,
  p_acting_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := public.resolve_acting_member(p_acting_user_id);
  v_group public.groups%rowtype;
  v_row public.group_members%rowtype;
  -- FOUND is reset by PERFORM, not only by SELECT INTO, so the three
  -- assertions below would overwrite it before the insert-or-update decision
  -- at the end of this function reads it. Capturing it once is the fix; the
  -- symptom without it was a silent no-op join — the UPDATE ran against a
  -- null v_row.id, matched nothing, and reported success.
  v_has_row boolean;
begin
  perform public.assert_active_user(v_member);

  select * into v_group from public.groups where id = p_group_id for update;
  if not found then
    raise exception 'group not found';
  end if;

  if v_group.status = 'closed' then
    raise exception 'this group is closed';
  end if;

  if v_group.visibility = 'private' then
    raise exception 'this group is invite only';
  end if;

  -- D5 owns the Pro gate on challenge cohorts; until it lands, joining one
  -- is not a self-serve action.
  if v_group.kind = 'challenge' then
    raise exception 'challenge cohorts open in a later phase';
  end if;

  select * into v_row
  from public.group_members
  where group_id = p_group_id and user_id = v_member
  for update;
  v_has_row := found;

  if v_has_row and v_row.status = 'active' then
    return jsonb_build_object('status', 'already_member', 'group_id', p_group_id);
  end if;

  if v_has_row and v_row.status = 'requested' then
    return jsonb_build_object('status', 'already_requested', 'group_id', p_group_id);
  end if;

  -- An outstanding invite plus an attempt to join is agreement from both
  -- sides; accept it rather than making them find the invite.
  if v_has_row and v_row.status = 'invited' then
    return public.respond_to_group_invite(p_group_id, true, p_asset_id, p_acting_user_id);
  end if;

  perform public.assert_can_take_group_seat(v_member);
  perform public.assert_pairable_asset(v_member, coalesce(p_asset_id, v_row.asset_id));
  perform public.assert_group_demo_wall(p_group_id, v_member);

  if public.group_active_member_count(p_group_id) >= v_group.max_members then
    raise exception 'this group is full';
  end if;

  if v_group.visibility = 'open' then
    if v_has_row then
      update public.group_members
      set status = 'active', joined_via = 'apply', asset_id = coalesce(p_asset_id, v_row.asset_id), joined_at = now()
      where id = v_row.id;
    else
      insert into public.group_members (group_id, user_id, role, joined_via, asset_id, status, joined_at)
      values (p_group_id, v_member, 'member', 'apply', p_asset_id, 'active', now());
    end if;

    return jsonb_build_object('status', 'joined', 'group_id', p_group_id);
  end if;

  if v_has_row then
    update public.group_members
    set status = 'requested', joined_via = 'apply', asset_id = coalesce(p_asset_id, v_row.asset_id), joined_at = null
    where id = v_row.id;
  else
    insert into public.group_members (group_id, user_id, role, joined_via, asset_id, status)
    values (p_group_id, v_member, 'member', 'apply', p_asset_id, 'requested');
  end if;

  return jsonb_build_object('status', 'requested', 'group_id', p_group_id);
end;
$$;

-- ── review_group_join_request ───────────────────────────────────────────────

create or replace function public.review_group_join_request(
  p_group_id uuid,
  p_user_id uuid,
  p_approve boolean,
  p_acting_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := public.resolve_acting_member(p_acting_user_id);
  v_group public.groups%rowtype;
  v_row public.group_members%rowtype;
begin
  perform public.assert_active_user(v_member);

  select * into v_group from public.groups where id = p_group_id for update;
  if not found then
    raise exception 'group not found';
  end if;

  if not (public.is_group_owner(p_group_id, v_member)
          or coalesce(auth.role() = 'service_role', false) or public.is_admin()) then
    raise exception 'only the group owner can review join requests';
  end if;

  select * into v_row
  from public.group_members
  where group_id = p_group_id and user_id = p_user_id
  for update;

  if not found or v_row.status <> 'requested' then
    raise exception 'that member has no open request to join this group';
  end if;

  if not p_approve then
    update public.group_members set status = 'declined' where id = v_row.id;
    return jsonb_build_object('status', 'declined', 'group_id', p_group_id, 'user_id', p_user_id);
  end if;

  if v_group.status = 'closed' then
    raise exception 'this group is closed';
  end if;

  -- Re-checked on the requester, not the approver: time has passed, and the
  -- caps are about the person taking the seat.
  perform public.assert_active_user(p_user_id);
  perform public.assert_can_take_group_seat(p_user_id);
  perform public.assert_pairable_asset(p_user_id, v_row.asset_id);
  perform public.assert_group_demo_wall(p_group_id, p_user_id);

  if public.group_active_member_count(p_group_id) >= v_group.max_members then
    raise exception 'this group is full';
  end if;

  update public.group_members
  set status = 'active', joined_at = now(), invited_by_user_id = v_member
  where id = v_row.id;

  return jsonb_build_object('status', 'joined', 'group_id', p_group_id, 'user_id', p_user_id);
end;
$$;

-- ── leave_group ─────────────────────────────────────────────────────────────
--
-- An owner who leaves a group that still has members hands it to the
-- longest-standing one rather than orphaning it. The alternative — refusing
-- the departure until they close the group — makes leaving a room you
-- started harder than leaving one you joined, and an ownerless group is a
-- group nobody can invite into or close.

create or replace function public.leave_group(
  p_group_id uuid,
  p_acting_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := public.resolve_acting_member(p_acting_user_id);
  v_row public.group_members%rowtype;
  v_successor uuid;
  v_closed boolean := false;
begin
  select * into v_row
  from public.group_members
  where group_id = p_group_id and user_id = v_member
  for update;

  if not found or v_row.status <> 'active' then
    raise exception 'you are not an active member of this group';
  end if;

  update public.group_members set status = 'left' where id = v_row.id;

  if v_row.role = 'owner' then
    select gm.user_id into v_successor
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.status = 'active'
    order by gm.joined_at asc nulls last, gm.created_at asc
    limit 1;

    if v_successor is null then
      update public.groups set status = 'closed' where id = p_group_id and status <> 'closed';
      v_closed := true;
    else
      update public.group_members
      set role = 'owner'
      where group_id = p_group_id and user_id = v_successor;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'left',
    'group_id', p_group_id,
    'new_owner_user_id', v_successor,
    'group_closed', v_closed
  );
end;
$$;

-- ── remove_group_member ─────────────────────────────────────────────────────
--
-- The owner's takedown, and the moderator's. 'removed' is a distinct status
-- from 'left' because who ended the membership is the part worth keeping.

create or replace function public.remove_group_member(
  p_group_id uuid,
  p_user_id uuid,
  p_acting_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := public.resolve_acting_member(p_acting_user_id);
  v_row public.group_members%rowtype;
begin
  if not (public.is_group_owner(p_group_id, v_member)
          or coalesce(auth.role() = 'service_role', false) or public.is_admin() or public.is_moderator()) then
    raise exception 'only the group owner or a moderator can remove a member';
  end if;

  if p_user_id = v_member then
    raise exception 'use leave_group to remove yourself';
  end if;

  select * into v_row
  from public.group_members
  where group_id = p_group_id and user_id = p_user_id
  for update;

  if not found or v_row.status not in ('active', 'invited', 'requested') then
    raise exception 'that member is not in this group';
  end if;

  update public.group_members set status = 'removed' where id = v_row.id;

  return jsonb_build_object('status', 'removed', 'group_id', p_group_id, 'user_id', p_user_id);
end;
$$;

-- ── close_group ─────────────────────────────────────────────────────────────
--
-- Closing is the end of the room, not of the record: the matches created
-- inside it keep their rows, their feedback and their in_group_id, which is
-- why matches.in_group_id is ON DELETE RESTRICT and why nothing here deletes
-- anything. The creator can close even if their membership row is gone,
-- which is the case a cascaded account deletion leaves behind.

create or replace function public.close_group(
  p_group_id uuid,
  p_acting_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := public.resolve_acting_member(p_acting_user_id);
  v_group public.groups%rowtype;
begin
  select * into v_group from public.groups where id = p_group_id for update;
  if not found then
    raise exception 'group not found';
  end if;

  -- created_by is nullable (ON DELETE SET NULL), so this operand MUST be
  -- coalesced: `null = v_member` is null, and a null anywhere in the
  -- disjunction used to let anyone close a group whose creator had deleted
  -- their account.
  if not (public.is_group_owner(p_group_id, v_member)
          or coalesce(v_group.created_by = v_member, false)
          or coalesce(auth.role() = 'service_role', false) or public.is_admin()) then
    raise exception 'only the group owner or an admin can close this group';
  end if;

  if v_group.status = 'closed' then
    return jsonb_build_object('status', 'already_closed', 'group_id', p_group_id);
  end if;

  update public.groups set status = 'closed' where id = p_group_id;

  return jsonb_build_object('status', 'closed', 'group_id', p_group_id);
end;
$$;

-- ── set_group_discord_ids ───────────────────────────────────────────────────
--
-- The one write D3 needs that a member never makes: recording the private
-- thread (or a cohort's channel) once Discord has created it. Service role
-- or admin only — a member cannot point a group at an arbitrary thread.

create or replace function public.set_group_discord_ids(
  p_group_id uuid,
  p_thread_id text default null,
  p_channel_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(auth.role() = 'service_role', false) or public.is_admin()) then
    raise exception 'only the bot or an admin can record Discord ids';
  end if;

  update public.groups
  set discord_thread_id = coalesce(nullif(btrim(coalesce(p_thread_id, '')), ''), discord_thread_id),
      discord_channel_id = coalesce(nullif(btrim(coalesce(p_channel_id, '')), ''), discord_channel_id)
  where id = p_group_id;

  if not found then
    raise exception 'group not found';
  end if;

  return jsonb_build_object('status', 'recorded', 'group_id', p_group_id);
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Readers, and the recommender
-- ═══════════════════════════════════════════════════════════════════════════

-- Every group the caller has a live relationship with: a seat, an invitation,
-- or a request waiting on someone. Departures and declines are history and
-- are left out — group_roster still shows them to the group.
create or replace function public.my_groups(p_acting_user_id uuid default null)
returns table (
  group_id uuid,
  kind text,
  name text,
  track text,
  visibility text,
  status text,
  max_members smallint,
  discord_thread_id text,
  opens_at timestamptz,
  closes_at timestamptz,
  my_role text,
  my_status text,
  my_asset_id uuid,
  joined_at timestamptz,
  active_member_count integer,
  pending_request_count integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member uuid := public.resolve_acting_member(p_acting_user_id);
begin
  return query
  select
    g.id,
    g.kind,
    g.name,
    g.track,
    g.visibility,
    g.status,
    g.max_members,
    g.discord_thread_id,
    g.opens_at,
    g.closes_at,
    gm.role,
    gm.status,
    gm.asset_id,
    gm.joined_at,
    public.group_active_member_count(g.id),
    -- Only an owner is shown the queue, because only an owner can act on it.
    case when gm.role = 'owner' and gm.status = 'active' then (
      select count(*)::integer from public.group_members r
      where r.group_id = g.id and r.status = 'requested'
    ) else 0 end,
    g.created_at
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  where gm.user_id = v_member
    and gm.status in ('active', 'invited', 'requested')
  order by
    case gm.status when 'invited' then 0 when 'requested' then 1 else 2 end,
    g.status,
    g.created_at desc;
end;
$$;

-- "Find a group": listed and open rooms the caller is not already involved
-- with. The site carries this as well as Discord's #find-a-group, because the
-- site is the source of truth and a Discord outage should degrade to a usable
-- product rather than no product.
--
-- can_join is advisory only — join_group re-decides it, and a stale "yes" on
-- a page open for ten minutes must never be what lets someone past a cap.
create or replace function public.discoverable_groups(
  p_limit integer default 30,
  p_acting_user_id uuid default null
)
returns table (
  group_id uuid,
  kind text,
  name text,
  track text,
  visibility text,
  status text,
  max_members smallint,
  active_member_count integer,
  owner_display_name text,
  joins_by_request boolean,
  can_join boolean,
  blocked_reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member uuid := public.resolve_acting_member(p_acting_user_id);
  v_is_demo boolean;
  v_plan public.plan_code;
  v_open_limit integer;
  v_month_limit integer;
  v_open_now integer;
  v_month_now integer;
  v_cap_reason text := null;
begin
  select up.is_demo, up.plan_code into v_is_demo, v_plan
  from public.user_profiles up where up.user_id = v_member;

  if not found then
    raise exception 'member not found';
  end if;

  v_open_limit := public.plan_feature_limit(v_plan, 'max_concurrent_groups');
  v_month_limit := public.plan_feature_limit(v_plan, 'feedback_groups_per_month');
  v_open_now := public.member_open_group_count(v_member);
  v_month_now := public.member_groups_joined_this_month(v_member);

  if v_open_limit is not null and v_open_now >= v_open_limit then
    v_cap_reason := format('You are in %s of %s groups your plan allows at once.', v_open_now, v_open_limit);
  elsif v_month_limit is not null and v_month_now >= v_month_limit then
    v_cap_reason := format('You have joined %s of %s groups your plan allows this month.', v_month_now, v_month_limit);
  end if;

  return query
  select
    g.id,
    g.kind,
    g.name,
    g.track,
    g.visibility,
    g.status,
    g.max_members,
    public.group_active_member_count(g.id),
    owner.display_name,
    g.visibility = 'listed',
    (v_cap_reason is null and public.group_active_member_count(g.id) < g.max_members),
    case
      when v_cap_reason is not null then v_cap_reason
      when public.group_active_member_count(g.id) >= g.max_members then 'This group is full.'
      else null
    end,
    g.created_at
  from public.groups g
  left join public.group_members own
    on own.group_id = g.id and own.role = 'owner' and own.status = 'active'
  left join public.user_profiles owner on owner.user_id = own.user_id
  where g.visibility in ('listed', 'open')
    and g.status in ('forming', 'active')
    -- D5 opens cohorts; until then they are not something to walk into.
    and g.kind = 'feedback'
    and not exists (
      select 1 from public.group_members mine
      where mine.group_id = g.id
        and mine.user_id = v_member
        and mine.status in ('active', 'invited', 'requested')
    )
    -- The demo wall, applied to discovery as well as to joining, so a demo
    -- account is never shown a room it would be refused from.
    and not exists (
      select 1 from public.group_members other
      join public.user_profiles op on op.user_id = other.user_id
      where other.group_id = g.id and other.status = 'active' and op.is_demo <> v_is_demo
    )
  order by public.group_active_member_count(g.id) desc, g.created_at desc
  limit greatest(least(coalesce(p_limit, 30), 100), 1);
end;
$$;

-- The roster, with each member's asset — visible to anyone the group has a
-- row for, plus moderators. Includes the departed and the declined: a room's
-- history belongs to the room.
create or replace function public.group_roster(
  p_group_id uuid,
  p_acting_user_id uuid default null
)
returns table (
  user_id uuid,
  display_name text,
  public_username text,
  track text,
  plan_code public.plan_code,
  member_role text,
  member_status text,
  joined_via text,
  asset_id uuid,
  asset_name text,
  asset_type public.asset_type,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member uuid := public.resolve_acting_member(p_acting_user_id);
begin
  if not (public.is_group_member(p_group_id, v_member, array['requested', 'invited', 'active', 'left', 'removed', 'declined'])
          or coalesce(auth.role() = 'service_role', false) or public.is_admin() or public.is_moderator()) then
    raise exception 'you cannot see this group''s roster';
  end if;

  return query
  select
    gm.user_id,
    up.display_name,
    up.public_username::text,
    up.track,
    up.plan_code,
    gm.role,
    gm.status,
    gm.joined_via,
    gm.asset_id,
    a.name,
    a.asset_type,
    gm.joined_at
  from public.group_members gm
  join public.user_profiles up on up.user_id = gm.user_id
  left join public.assets a on a.id = gm.asset_id
  where gm.group_id = p_group_id
  order by
    case gm.status when 'active' then 0 when 'invited' then 1 when 'requested' then 2 else 3 end,
    case gm.role when 'owner' then 0 else 1 end,
    gm.joined_at asc nulls last,
    gm.created_at asc;
end;
$$;

-- ── recommend_group_members ─────────────────────────────────────────────────
--
-- Wraps what exists rather than adding matching logic. Four steps:
--
--   1. match_candidates_for the group's owner — the UNGATED core from
--      section 6, not eligible_match_candidates, so the recommender keeps
--      working when D3 flips the match surface to 'discord'. This is the
--      whole reason section 6 exists.
--   2. Filter by the group's Track. Null group track means cross-track, and
--      a candidate with no track set is never filtered out — an unset column
--      degrades to today's behaviour rather than to an empty list.
--   3. Drop anyone the group already has a row for at requested, invited or
--      active.
--   4. Keep only candidates who pass pair_respects_separation_preferences
--      against EVERY current active member, not just the owner.
--
-- Step 4 is the only genuinely new rule. A two-person match had one pair to
-- check; a four-person group has six, and a candidate who is fine with the
-- owner but one degree from another member is not fine. The pool is
-- over-fetched before filtering, because steps 2–4 can reject most of it.
--
-- The member chooses from this list. Nothing here writes a row, and nothing
-- adds anyone: an invite is still invite_to_group, and the invitee still has
-- to accept.

create or replace function public.recommend_group_members(
  p_group_id uuid,
  p_limit integer default 10,
  p_acting_user_id uuid default null
)
returns table (
  candidate_user_id uuid,
  candidate_display_name text,
  candidate_public_username text,
  candidate_plan_code public.plan_code,
  candidate_track text,
  candidate_asset_id uuid,
  candidate_asset_name text,
  candidate_asset_type public.asset_type,
  shortest_path_degree integer,
  prior_match_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member uuid := public.resolve_acting_member(p_acting_user_id);
  v_group public.groups%rowtype;
  v_owner_user_id uuid;
  v_owner_asset_id uuid;
  v_limit integer := greatest(least(coalesce(p_limit, 10), 50), 1);
begin
  select * into v_group from public.groups where id = p_group_id;
  if not found then
    raise exception 'group not found';
  end if;

  if not (public.is_group_owner(p_group_id, v_member)
          or coalesce(auth.role() = 'service_role', false) or public.is_admin()) then
    raise exception 'only the group owner can see recommendations';
  end if;

  select gm.user_id, gm.asset_id into v_owner_user_id, v_owner_asset_id
  from public.group_members gm
  where gm.group_id = p_group_id and gm.role = 'owner' and gm.status = 'active'
  limit 1;

  if v_owner_user_id is null then
    raise exception 'this group has no active owner to recommend against';
  end if;

  if v_owner_asset_id is null then
    raise exception 'the group owner has no asset on this group';
  end if;

  return query
  with pool as (
    select *
    from public.match_candidates_for(v_owner_user_id, v_owner_asset_id, v_limit * 10, 0)
  )
  select
    p.candidate_user_id,
    p.candidate_display_name,
    up.public_username::text,
    p.candidate_plan_code,
    up.track,
    p.candidate_asset_id,
    p.candidate_asset_name,
    p.candidate_asset_type,
    p.shortest_path_degree,
    p.prior_match_count
  from pool p
  join public.user_profiles up on up.user_id = p.candidate_user_id
  where
    -- 2 · the group's Track
    (v_group.track is null or up.track is null or up.track = v_group.track)
    -- 3 · nobody already in the room or on its way in
    and not exists (
      select 1 from public.group_members gm
      where gm.group_id = p_group_id
        and gm.user_id = p.candidate_user_id
        and gm.status in ('requested', 'invited', 'active')
    )
    -- 4 · all pairs, not just the owner's
    and not exists (
      select 1 from public.group_members gm
      where gm.group_id = p_group_id
        and gm.status = 'active'
        and not public.pair_respects_separation_preferences(p.candidate_user_id, gm.user_id)
    )
  order by
    (p.shortest_path_degree is null) desc,
    p.shortest_path_degree asc nulls last,
    p.prior_match_count asc,
    p.candidate_display_name asc
  limit v_limit;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. create_match — the concurrency cap, and group pairings
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The rule that was missing: nothing limited CONCURRENT match-ups. A free
-- member could hold four open ones at once as long as they were with four
-- different people, because every existing cap is monthly. max_concurrent_
-- matchups closes that, counted for both members and enforced in the
-- database where it cannot be worked around.
--
-- And the consequence the spec flagged: a four-person group produces up to
-- six pairings, so joining one group would otherwise spend a free member's
-- whole month in an afternoon. A pairing carrying in_group_id is therefore
-- exempt from BOTH the monthly quota and the concurrency cap, and groups are
-- capped separately in section 1. The member made one decision; they are
-- charged for one decision.
--
-- The function is dropped and recreated rather than replaced: the parameter
-- list grows, and leaving the old eight-argument signature in place would
-- make every named-parameter call ambiguous.
--
-- Everything else is the body from 20260925120000, unchanged. Still D4's,
-- deliberately untouched here: source = 'discord' for member input, and the
-- service-role act-as path (section 5's resolve_acting_member is the shape
-- it should take).

drop function if exists public.create_match(uuid, uuid, uuid, text, timestamptz, uuid, text[], text[]);

create or replace function public.create_match(
  p_other_user_id uuid,
  p_my_asset_id uuid,
  p_their_asset_id uuid,
  p_source text default 'browse',
  p_feedback_due_at timestamptz default null,
  p_previous_match_id uuid default null,
  p_my_blocked_channels text[] default '{}'::text[],
  p_their_blocked_channels text[] default '{}'::text[],
  p_in_group_id uuid default null
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
  v_group public.groups%rowtype;
  v_in_group boolean := p_in_group_id is not null;
  v_concurrency_limit integer;
begin
  -- Phase A match-surface gate: member calls are refused unless this plan's
  -- surface is 'web'; the service role (Discord bot) and admins always pass.
  if not (public.match_surface() = 'web'
          or coalesce(auth.role() = 'service_role', false) or public.is_admin()) then
    raise exception 'matching is handled in Discord';
  end if;

  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;
  perform public.assert_active_caller();

  if v_caller_user_id = p_other_user_id then
    raise exception 'cannot create a match with yourself';
  end if;

  -- source and in_group_id are kept in step here as well as by the table's
  -- matches_group_source_agrees CHECK, so the error a caller sees names the
  -- argument they got wrong rather than a constraint.
  if v_in_group then
    if p_source <> 'group' then
      raise exception 'a pairing inside a group must have source group';
    end if;
  elsif p_source not in ('browse', 'queued') then
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

  -- A group pairing is only a pairing if both people are actually in the
  -- room. Without this check in_group_id would be a self-service quota
  -- exemption: name any group and the match stops counting.
  if v_in_group then
    select * into v_group from public.groups where id = p_in_group_id;
    if not found then
      raise exception 'group not found';
    end if;

    if v_group.status = 'closed' then
      raise exception 'this group is closed';
    end if;

    if not public.is_group_member(p_in_group_id, v_caller_user_id) then
      raise exception 'you are not an active member of that group';
    end if;

    if not public.is_group_member(p_in_group_id, p_other_user_id) then
      raise exception 'that member is not an active member of that group';
    end if;
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

  -- ── The concurrency cap ───────────────────────────────────────────────────
  --
  -- Applied to both members, because the cap is about how much work a person
  -- has open rather than who asked for it. Skipped for group pairings, and
  -- skipped for a queued row: queued_next_month is not an open match-up, and
  -- the cap is re-checked by whatever opens it.
  if not v_in_group and p_source <> 'queued' then
    v_concurrency_limit := public.plan_feature_limit(v_caller_profile.plan_code, 'max_concurrent_matchups');
    if v_concurrency_limit is not null
       and public.member_concurrent_matchup_count(v_caller_user_id) >= v_concurrency_limit then
      raise exception 'you already have % open match-up(s), which is the limit on your plan; finish one before starting another', v_concurrency_limit;
    end if;

    v_concurrency_limit := public.plan_feature_limit(v_other_profile.plan_code, 'max_concurrent_matchups');
    if v_concurrency_limit is not null
       and public.member_concurrent_matchup_count(p_other_user_id) >= v_concurrency_limit then
      raise exception 'that member already has as many open match-ups as their plan allows';
    end if;
  end if;

  -- Browse entitlement is about the Browse page, not about being paired at
  -- all, so a group pairing does not need it. sprout has it disabled, and a
  -- free member in a group is exactly who this exemption is for.
  if not v_in_group and not public.plan_feature_enabled(v_caller_profile.plan_code, 'browse_matches_per_month') then
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

  -- ── Monthly quota: skipped entirely for a group pairing ───────────────────
  if not v_in_group then
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
    separation_degree_used,
    in_group_id
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
    least(coalesce(v_shortest_path_degree, v_caller_profile.degrees_of_separation + 1), 4)::smallint,
    p_in_group_id
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

  -- The exemption, in one place: a group pairing increments nothing.
  if not v_in_group and p_source = 'browse' then
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


-- ── pair_in_group ───────────────────────────────────────────────────────────
--
-- The convenience that makes a group a machine for producing matches rather
-- than a chat room: both members' assets are already recorded on their
-- group_members rows, so a pairing needs no asset picker. It calls
-- create_match, so it inherits every check — including, deliberately, the
-- Phase A surface gate. When D3 flips the surface to 'discord' this stops
-- answering members and pairing happens in the room, which is the intended
-- direction rather than a regression. The recommender is the thing that must
-- survive the flip, and section 6 is why it does.

create or replace function public.pair_in_group(
  p_group_id uuid,
  p_other_user_id uuid,
  p_previous_match_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_my_asset uuid;
  v_their_asset uuid;
begin
  if v_caller is null then
    raise exception 'authentication required';
  end if;

  -- Two different failures with two different fixes, so they get two
  -- different sentences: no seat in the room, or a seat whose asset was
  -- deleted (the FK sets it null rather than blocking the deletion).
  if not public.is_group_member(p_group_id, v_caller) then
    raise exception 'you are not an active member of that group';
  end if;

  select asset_id into v_my_asset
  from public.group_members
  where group_id = p_group_id and user_id = v_caller and status = 'active';

  if v_my_asset is null then
    raise exception 'your seat in this group has no asset on it; choose one before pairing up';
  end if;

  if not public.is_group_member(p_group_id, p_other_user_id) then
    raise exception 'that member is not an active member of that group';
  end if;

  select asset_id into v_their_asset
  from public.group_members
  where group_id = p_group_id and user_id = p_other_user_id and status = 'active';

  if v_their_asset is null then
    raise exception 'that member has no asset on their seat yet';
  end if;

  return public.create_match(
    p_other_user_id      => p_other_user_id,
    p_my_asset_id        => v_my_asset,
    p_their_asset_id     => v_their_asset,
    p_source             => 'group',
    p_feedback_due_at    => null,
    p_previous_match_id  => p_previous_match_id,
    p_in_group_id        => p_group_id
  );
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 10. RLS and grants
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Reads go through RLS; writes go through the RPCs and nowhere else. The
-- revokes are what make that true rather than conventional: with
-- insert/update/delete revoked, a permissive policy cannot be turned into a
-- back door by a later migration that only adds a policy. This is the same
-- arrangement user_profiles has had since 20260715120000.
--
-- The SELECT policies lean on is_group_member(), which is security definer:
-- a policy on group_members that queried group_members directly would
-- recurse.

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

drop policy if exists "groups_select_visible" on public.groups;
create policy "groups_select_visible"
on public.groups for select to authenticated
using (
  public.is_group_member(id, auth.uid(), array['requested', 'invited', 'active', 'left', 'removed', 'declined'])
  or created_by = auth.uid()
  or (visibility in ('listed', 'open') and status in ('forming', 'active'))
  or public.is_admin()
  or public.is_moderator()
);

drop policy if exists "groups_admin_manage" on public.groups;
create policy "groups_admin_manage"
on public.groups for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "group_members_select_related" on public.group_members;
create policy "group_members_select_related"
on public.group_members for select to authenticated
using (
  user_id = auth.uid()
  or public.is_group_member(group_id, auth.uid(), array['invited', 'active'])
  or public.is_admin()
  or public.is_moderator()
);

drop policy if exists "group_members_admin_manage" on public.group_members;
create policy "group_members_admin_manage"
on public.group_members for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.groups to authenticated;
grant select on public.group_members to authenticated;
revoke insert, update, delete on public.groups from anon, authenticated;
revoke insert, update, delete on public.group_members from anon, authenticated;

revoke all on function public.create_group(text, uuid, text, text, text, smallint, uuid) from public;
revoke all on function public.invite_to_group(uuid, uuid, text, uuid) from public;
revoke all on function public.respond_to_group_invite(uuid, boolean, uuid, uuid) from public;
revoke all on function public.join_group(uuid, uuid, uuid) from public;
revoke all on function public.review_group_join_request(uuid, uuid, boolean, uuid) from public;
revoke all on function public.leave_group(uuid, uuid) from public;
revoke all on function public.remove_group_member(uuid, uuid, uuid) from public;
revoke all on function public.close_group(uuid, uuid) from public;
revoke all on function public.set_group_discord_ids(uuid, text, text) from public;
revoke all on function public.my_groups(uuid) from public;
revoke all on function public.discoverable_groups(integer, uuid) from public;
revoke all on function public.group_roster(uuid, uuid) from public;
revoke all on function public.recommend_group_members(uuid, integer, uuid) from public;
revoke all on function public.pair_in_group(uuid, uuid, uuid) from public;
revoke all on function public.create_match(uuid, uuid, uuid, text, timestamptz, uuid, text[], text[], uuid) from public;

grant execute on function public.create_group(text, uuid, text, text, text, smallint, uuid) to authenticated;
grant execute on function public.invite_to_group(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.respond_to_group_invite(uuid, boolean, uuid, uuid) to authenticated;
grant execute on function public.join_group(uuid, uuid, uuid) to authenticated;
grant execute on function public.review_group_join_request(uuid, uuid, boolean, uuid) to authenticated;
grant execute on function public.leave_group(uuid, uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.close_group(uuid, uuid) to authenticated;
grant execute on function public.my_groups(uuid) to authenticated;
grant execute on function public.discoverable_groups(integer, uuid) to authenticated;
grant execute on function public.group_roster(uuid, uuid) to authenticated;
grant execute on function public.recommend_group_members(uuid, integer, uuid) to authenticated;
grant execute on function public.pair_in_group(uuid, uuid, uuid) to authenticated;
grant execute on function public.create_match(uuid, uuid, uuid, text, timestamptz, uuid, text[], text[], uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Closing the default-privilege hole
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `revoke all on function ... from public` is NOT enough on this database.
-- Supabase ships an ALTER DEFAULT PRIVILEGES that grants EXECUTE on every new
-- function in the public schema to anon and authenticated, and those are
-- grants to named roles — revoking the PUBLIC pseudo-role leaves them
-- untouched. Section 10's revokes read as if they locked these functions
-- down. They did not.
--
-- That matters most for match_candidates_for, which exists precisely because
-- it has NO caller check: it takes the member as an argument. Left executable
-- by `authenticated`, any member could pass another member's user id with one
-- of their asset ids — both readable under existing policies — and read back
-- that person's whole candidate list, including the shortest_path_degree to
-- every other member. The relationship graph is not public, and
-- member_match_edges is not selectable by members for exactly that reason.
--
-- So: every function whose only legitimate callers are the security-definer
-- functions in this file is revoked from anon AND authenticated by name.
--
-- Two deliberate exceptions:
--
--   is_group_member stays executable by authenticated, because the RLS
--   policies in section 10 call it and PostgreSQL checks EXECUTE against the
--   querying role when it evaluates a policy expression. Revoking it would
--   make groups and group_members unreadable to everyone.
--
--   set_group_discord_ids stays granted to authenticated, because admins are
--   authenticated; the function checks is_admin() itself.

revoke execute on function public.match_candidates_for(uuid, uuid, integer, integer) from anon, authenticated;
revoke execute on function public.resolve_acting_member(uuid) from anon, authenticated;
revoke execute on function public.assert_active_user(uuid) from anon, authenticated;
revoke execute on function public.assert_can_take_group_seat(uuid) from anon, authenticated;
revoke execute on function public.assert_group_demo_wall(uuid, uuid) from anon, authenticated;
revoke execute on function public.assert_pairable_asset(uuid, uuid) from anon, authenticated;
revoke execute on function public.group_role_of(uuid, uuid) from anon, authenticated;
revoke execute on function public.is_group_owner(uuid, uuid) from anon, authenticated;
revoke execute on function public.group_active_member_count(uuid) from anon, authenticated;
revoke execute on function public.member_concurrent_matchup_count(uuid) from anon, authenticated;
revoke execute on function public.member_open_group_count(uuid) from anon, authenticated;
revoke execute on function public.member_groups_joined_this_month(uuid) from anon, authenticated;

-- anon has no business in any of the member-facing writers either. They would
-- each raise 'authentication required', but a function that cannot be reached
-- is better than one that is reached and refuses.
revoke execute on function public.set_member_track(text, uuid) from anon;
revoke execute on function public.create_group(text, uuid, text, text, text, smallint, uuid) from anon;
revoke execute on function public.invite_to_group(uuid, uuid, text, uuid) from anon;
revoke execute on function public.respond_to_group_invite(uuid, boolean, uuid, uuid) from anon;
revoke execute on function public.join_group(uuid, uuid, uuid) from anon;
revoke execute on function public.review_group_join_request(uuid, uuid, boolean, uuid) from anon;
revoke execute on function public.leave_group(uuid, uuid) from anon;
revoke execute on function public.remove_group_member(uuid, uuid, uuid) from anon;
revoke execute on function public.close_group(uuid, uuid) from anon;
revoke execute on function public.set_group_discord_ids(uuid, text, text) from anon;
revoke execute on function public.my_groups(uuid) from anon;
revoke execute on function public.discoverable_groups(integer, uuid) from anon;
revoke execute on function public.group_roster(uuid, uuid) from anon;
revoke execute on function public.recommend_group_members(uuid, integer, uuid) from anon;
revoke execute on function public.pair_in_group(uuid, uuid, uuid) from anon;
revoke execute on function public.create_match(uuid, uuid, uuid, text, timestamptz, uuid, text[], text[], uuid) from anon;

-- is_group_member and the RLS policies need each other; this grant is what
-- makes section 10 work rather than a courtesy.
grant execute on function public.is_group_member(uuid, uuid, text[]) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Two corrections found by verify-phase22, and the trigger they need
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Section 3's CREATE TABLE now carries the right shape, but `create table if
-- not exists` does nothing to a table that already exists. These ALTERs are
-- what bring a database that ran the first version of this file into line,
-- and they are written to be safely re-runnable on either.
--
-- (a) group_members.asset_id: RESTRICT → SET NULL, and the CHECK that
--     depended on RESTRICT is dropped. Deleting an account cascades both its
--     assets and its group_members rows from the same parent row, so RESTRICT
--     only held because of the order PostgreSQL happened to fire two cascade
--     triggers in. An undeletable account is the failure Phase 21 shipped;
--     a seat with nothing on it is recoverable with set_group_asset.
--
-- (b) Ownership succession has to survive a DELETE, not just leave_group.
--     leave_group hands an owner's room to the longest-standing member, but
--     an owner who deletes their ACCOUNT never calls it: the cascade removes
--     their group_members row and the room is left with members, no owner,
--     and therefore nobody who can invite, approve a request, see
--     recommendations, or close it. verify-phase22 caught this as "an admin
--     or the surviving owner can still close it" failing against a group
--     whose owner had just been deleted.

-- ── (a) ────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.group_members'::regclass
      and conname = 'group_members_active_has_asset'
  ) then
    alter table public.group_members drop constraint group_members_active_has_asset;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.group_members'::regclass
      and conname = 'group_members_asset_id_fkey'
      and confdeltype = 'r'   -- 'r' = RESTRICT
  ) then
    alter table public.group_members drop constraint group_members_asset_id_fkey;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.group_members'::regclass
      and conname = 'group_members_asset_id_fkey'
  ) then
    alter table public.group_members
      add constraint group_members_asset_id_fkey
      foreign key (asset_id) references public.assets(id) on delete set null;
  end if;
end $$;

comment on column public.group_members.asset_id is
  'What this member brings to be reviewed. ON DELETE SET NULL so deleting an asset — or an account — can never be blocked by a group seat; the seat survives empty and set_group_asset refills it. Required to BECOME active, enforced by assert_pairable_asset on every path.';

-- The member's own fix for an empty seat, and the way to change what they
-- bring without leaving and rejoining (which would spend a monthly group).
create or replace function public.set_group_asset(
  p_group_id uuid,
  p_asset_id uuid,
  p_acting_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := public.resolve_acting_member(p_acting_user_id);
  v_row public.group_members%rowtype;
begin
  perform public.assert_active_user(v_member);
  perform public.assert_pairable_asset(v_member, p_asset_id);

  select * into v_row
  from public.group_members
  where group_id = p_group_id and user_id = v_member
  for update;

  if not found or v_row.status not in ('active', 'invited', 'requested') then
    raise exception 'you have no seat in this group';
  end if;

  update public.group_members set asset_id = p_asset_id where id = v_row.id;

  return jsonb_build_object('status', 'set', 'group_id', p_group_id, 'asset_id', p_asset_id);
end;
$$;

revoke all on function public.set_group_asset(uuid, uuid, uuid) from public;
revoke execute on function public.set_group_asset(uuid, uuid, uuid) from anon;
grant execute on function public.set_group_asset(uuid, uuid, uuid) to authenticated;

-- ── (b) ────────────────────────────────────────────────────────────────────
--
-- FOR EACH ROW, and the Phase 21 reasoning is why. A statement-level trigger
-- fires once for a cascade that touched no rows at all; a row-level one fires
-- with the row in hand, which is the only way to ask "was this an owner?".
--
-- It also raises NOTHING. An AFTER DELETE trigger that can raise is an AFTER
-- DELETE trigger that can make an account undeletable, which is the whole
-- failure this phase has been trying not to repeat. Every branch here is a
-- SELECT or an UPDATE, and the early return covers the case where the group
-- itself is being deleted in the same cascade.
create or replace function public.group_members_succeed_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_successor uuid;
begin
  if old.role <> 'owner' or old.status <> 'active' then
    return old;
  end if;

  -- The group may be going away in the same cascade. Nothing to hand over.
  if not exists (select 1 from public.groups g where g.id = old.group_id) then
    return old;
  end if;

  select gm.user_id into v_successor
  from public.group_members gm
  where gm.group_id = old.group_id
    and gm.status = 'active'
    and gm.user_id <> old.user_id
  order by gm.joined_at asc nulls last, gm.created_at asc
  limit 1;

  if v_successor is null then
    update public.groups
    set status = 'closed'
    where id = old.group_id and status <> 'closed';
  else
    update public.group_members
    set role = 'owner'
    where group_id = old.group_id and user_id = v_successor;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_group_members_succeed_owner on public.group_members;
create trigger trg_group_members_succeed_owner
after delete on public.group_members
for each row execute function public.group_members_succeed_owner();

comment on function public.group_members_succeed_owner() is
  'Hands an ownerless room to its longest-standing member, or closes it if there is nobody left. Fires on DELETE only — leave_group does its own succession on the UPDATE path. FOR EACH ROW and raise-free on purpose: this runs inside account deletion.';
