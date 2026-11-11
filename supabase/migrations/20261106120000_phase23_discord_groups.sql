-- Phase 23 / D3 — groups in Discord.
--
-- D3 is mostly Discord-side: command definitions, handlers, threads. The
-- database owes it three things, and no new tables.
--
--   1. member_for_external_identity gains `track`. /group create inherits the
--      creator's track (the locked decision: a Track is the entry cohort,
--      singular), and the bot's only read of a member is this one function.
--      Without the column here the handler would need a second round trip
--      just to learn a string the first call already had in hand.
--
--   2. my_pairable_assets(). create_group and join_group both require an
--      asset, a member may own several, and Discord has no asset picker.
--      There is no "default asset" column anywhere in this schema, so the
--      handler auto-picks when there is exactly one and names the choices
--      when there are more. That needs a list, and the list has to apply
--      exactly the criteria assert_pairable_asset applies — otherwise the
--      bot offers a member an asset the RPC will then refuse.
--
--   3. member_overview(). /me answers "who am I here, and what are my caps"
--      in one round trip. The cap helpers and plan_feature_limit are all
--      revoked from authenticated by design, so a caller cannot assemble
--      this itself; this is the one security-definer reader that may.
--
-- Everything else D3 needs shipped in phase 22. The nine group RPCs already
-- take p_acting_user_id, which is how the bot calls them.

begin;

-- ── 1 · The bot's member read gains the Track ───────────────────────────────
--
-- Identical to the phase 20 version but for the one added key. Restated in
-- full rather than patched, because `create or replace` is the only way to
-- change a function's body and a diff is easier to review than a guess.

create or replace function public.member_for_external_identity(
  p_provider text,
  p_external_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.member_identities%rowtype;
  v_profile public.user_profiles%rowtype;
  v_found boolean;
begin
  if coalesce(auth.role() <> 'service_role', true) then
    raise exception 'identity lookup is for the bot only';
  end if;

  select * into v_row
  from public.member_identities
  where provider = lower(coalesce(p_provider, ''))
    and external_id = nullif(btrim(coalesce(p_external_id, '')), '')
    and status = 'linked';

  v_found := found;

  if not v_found then
    return jsonb_build_object('status', 'unlinked');
  end if;

  select * into v_profile from public.user_profiles where user_id = v_row.user_id;

  return jsonb_build_object(
    'status', 'linked',
    'user_id', v_row.user_id,
    'handle', v_row.handle,
    'display_name', v_profile.display_name,
    'public_username', v_profile.public_username,
    'plan_code', v_profile.plan_code,
    'account_status', v_profile.account_status,
    'track', v_profile.track,
    'is_demo', v_profile.is_demo,
    'role_granted_at', v_row.role_granted_at
  );
end;
$$;

comment on function public.member_for_external_identity(text, text) is
  'Bot-only member lookup by external identity. Returns track as of phase 23 so /group create can inherit the creator''s cohort without a second round trip.';

-- ── 2 · The assets a member may actually bring to a group ───────────────────
--
-- The where-clause here and the one in assert_pairable_asset must stay in
-- step. If they drift, the bot offers an asset the RPC refuses and the member
-- sees a raw database error instead of a choice.

create or replace function public.my_pairable_assets(p_acting_user_id uuid default null)
returns table (
  asset_id uuid,
  name text,
  asset_type public.asset_type,
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
  select a.id, a.name, a.asset_type, a.created_at
  from public.assets a
  where a.owner_user_id = v_member
    and a.status = 'active'
    and a.moderation_status = 'ok'
  order by a.created_at, a.name;
end;
$$;

comment on function public.my_pairable_assets(uuid) is
  'The caller''s assets that assert_pairable_asset would accept. Exists for Discord, which has no asset picker and no default-asset column to fall back on.';

-- ── 3 · /me, in one round trip ──────────────────────────────────────────────
--
-- plan_feature_limit and the three count helpers are revoked from
-- authenticated (phase 22 section 11), so this is a security-definer reader
-- rather than something a caller could assemble. It deliberately publishes
-- only the member's OWN caps and usage — no other member appears in it.
--
-- match_surface is included because /me is where a member finds out why web
-- pairing stopped working. It is an internal switch and stays out of
-- public_plan_caps(); telling the member who is subject to it what it is set
-- to is a different thing from publishing the gate table.

create or replace function public.member_overview(p_acting_user_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member uuid := public.resolve_acting_member(p_acting_user_id);
  v_profile public.user_profiles%rowtype;
  v_found boolean;
  v_surface text;
begin
  select * into v_profile from public.user_profiles where user_id = v_member;
  v_found := found;

  if not v_found then
    raise exception 'member not found';
  end if;

  -- Not match_surface(): that reader keys off auth.uid(), which is null on
  -- the act-as path, so for a bot call it would report the sprout row rather
  -- than this member's plan. Same validity rule as that function, though —
  -- an unrecognised value falls back to 'web' rather than being passed on.
  select case
           when g.config ->> 'surface' in ('web', 'discord') then g.config ->> 'surface'
           else null
         end
    into v_surface
  from public.plan_feature_gates g
  where g.feature_key = 'match_surface'
    and g.plan_code = v_profile.plan_code;

  return jsonb_build_object(
    'user_id', v_member,
    'display_name', v_profile.display_name,
    'public_username', v_profile.public_username,
    'plan_code', v_profile.plan_code,
    'account_status', v_profile.account_status,
    'track', v_profile.track,
    'is_demo', v_profile.is_demo,
    'match_surface', coalesce(v_surface, 'web'),
    'caps', jsonb_build_object(
      'max_concurrent_groups',
        public.plan_feature_limit(v_profile.plan_code, 'max_concurrent_groups'),
      'feedback_groups_per_month',
        public.plan_feature_limit(v_profile.plan_code, 'feedback_groups_per_month'),
      'max_concurrent_matchups',
        public.plan_feature_limit(v_profile.plan_code, 'max_concurrent_matchups')
    ),
    'usage', jsonb_build_object(
      'open_groups', public.member_open_group_count(v_member),
      'groups_joined_this_month', public.member_groups_joined_this_month(v_member),
      'concurrent_matchups', public.member_concurrent_matchup_count(v_member)
    ),
    'pairable_asset_count', (
      select count(*)
      from public.assets a
      where a.owner_user_id = v_member
        and a.status = 'active'
        and a.moderation_status = 'ok'
    )
  );
end;
$$;

comment on function public.member_overview(uuid) is
  'The caller''s own plan, track, caps and usage in one object, for /me. Security definer because the cap helpers it calls are revoked from authenticated.';

-- ── 4 · Grants, by role name ────────────────────────────────────────────────
--
-- `revoke all ... from public` does almost nothing here: Supabase ships an
-- ALTER DEFAULT PRIVILEGES granting EXECUTE on every new function in `public`
-- to anon and authenticated BY NAME, and revoking the PUBLIC pseudo-role
-- leaves named grants untouched. This cost real time in phase 22 — it left
-- match_candidates_for reachable by any member. Revoke by role name, then
-- grant back deliberately, and assert the ACL in the verify script.
--
-- `create or replace` preserves an existing function's ACL, so the restated
-- member_for_external_identity is re-locked here rather than assumed.

revoke all on function public.member_for_external_identity(text, text) from public;
revoke execute on function public.member_for_external_identity(text, text)
  from anon, authenticated;
grant execute on function public.member_for_external_identity(text, text) to service_role;

revoke all on function public.my_pairable_assets(uuid) from public;
revoke execute on function public.my_pairable_assets(uuid) from anon;
grant execute on function public.my_pairable_assets(uuid) to authenticated, service_role;

revoke all on function public.member_overview(uuid) from public;
revoke execute on function public.member_overview(uuid) from anon;
grant execute on function public.member_overview(uuid) to authenticated, service_role;

commit;
