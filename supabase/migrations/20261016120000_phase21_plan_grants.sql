-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 21 / Discord D2a — something can finally set a plan.
--
-- `plan_code` decides match quotas, browse access, publishing, the Discord
-- Pro role and (soon) which points spends a member is eligible for. As of
-- today it is written by exactly two things: the 'sprout' default in
-- handle_new_auth_user, and a direct table write. There is no RPC and no
-- admin control, which was fine while nothing was sold and is not fine now
-- that `bloom` means "paid Skool member".
--
-- Decided 2026-10-15/16:
--   sprout   = free Skool member
--   bloom    = paid Skool member (the "Pro" tier throughout the build spec)
--   flourish = retired. Left in the enum because removing a value means
--              recreating the type; set_member_plan refuses to assign it.
--
-- Skool is the billing system and there is no Stripe. But the entitlement is
-- recorded with its SOURCE, so adding Stripe later — or reconciling a
-- disagreement between two sources — is a second caller of one RPC rather
-- than a refactor of everything that reads a plan.
--
-- What is deliberately NOT here: the Skool webhook. Admin-by-hand is the
-- launch mechanism and is the permanent fallback for every case Zapier's
-- email matching misses. When volume justifies it, the Zap calls
-- set_member_plan(..., 'skool', <email>) and nothing else changes.
--
-- Note on write privileges: 20260715120000 revoked insert/update/delete on
-- user_profiles from anon and authenticated, so despite the permissive
-- profiles_update_self policy a member cannot promote themselves through
-- PostgREST. Everything below assumes that stays true.
--
-- Idempotent / safely re-runnable.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. plan_grants — the audit trail
-- ═══════════════════════════════════════════════════════════════════════════
--
-- One row per change, never per read. An entitlement that moves with no
-- record behind it is a support question nobody can answer six weeks later:
-- who granted this, when, on the strength of what.

create table if not exists public.plan_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  plan_code public.plan_code not null,
  previous_plan_code public.plan_code,
  source text not null check (source in ('signup', 'skool', 'stripe', 'admin')),
  -- Skool email, Stripe subscription id, or null for an admin decision.
  external_ref text,
  granted_by_user_id uuid references public.user_profiles(user_id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_plan_grants_user on public.plan_grants (user_id, created_at desc);
create index if not exists idx_plan_grants_source on public.plan_grants (source, created_at desc);
create index if not exists idx_plan_grants_external_ref
  on public.plan_grants (lower(external_ref))
  where external_ref is not null;

comment on table public.plan_grants is
  'Append-only history of plan_code changes, with the source that caused each one. Written only by set_member_plan(). See 20261016120000_phase21_plan_grants.sql.';
comment on column public.plan_grants.source is
  'Where the entitlement came from: signup (the sprout default), skool (the paid group), stripe (unbuilt), admin (a human decision).';

-- Append-only, with two documented exceptions, both forced by account
-- deletion. Everything that makes a row evidence — who it was about, which
-- plan, which source, the reference, the note, the timestamp — is immutable.
--
--   • DELETE is allowed, so the `on delete cascade` from user_profiles still
--     works. Blocking it would make deleting a member impossible, which is a
--     worse failure than a cascade taking its own audit rows with it.
--
--   • The single UPDATE of `granted_by_user_id` to null is allowed, because
--     that is what the FK's `on delete set null` does when the admin who made
--     a grant has their own account deleted. A dangling pointer would be
--     worse than a null, and refusing it makes that admin undeletable.
--
-- The trigger is FOR EACH ROW, not FOR EACH STATEMENT, and that is
-- load-bearing: a statement-level trigger fires even when the UPDATE matches
-- no rows, so the referential-integrity UPDATE that `on delete set null`
-- issues for *every* deleted profile would abort every account deletion in
-- the system, whether or not that person had ever granted anything.
create or replace function public.plan_grants_reject_update()
returns trigger
language plpgsql
as $$
begin
  if new.granted_by_user_id is null
     and old.granted_by_user_id is not null
     and new.id = old.id
     and new.user_id = old.user_id
     and new.plan_code = old.plan_code
     and new.previous_plan_code is not distinct from old.previous_plan_code
     and new.source = old.source
     and new.external_ref is not distinct from old.external_ref
     and new.note is not distinct from old.note
     and new.created_at = old.created_at then
    return new;
  end if;

  raise exception 'plan_grants is append-only; record a new grant instead of editing one';
end;
$$;

drop trigger if exists trg_plan_grants_append_only on public.plan_grants;
create trigger trg_plan_grants_append_only
before update on public.plan_grants
for each row execute function public.plan_grants_reject_update();

alter table public.plan_grants enable row level security;

drop policy if exists "plan_grants_select_own_or_admin" on public.plan_grants;
create policy "plan_grants_select_own_or_admin"
on public.plan_grants for select to authenticated
using (user_id = auth.uid() or public.is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. set_member_plan — the one writer
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.set_member_plan(
  p_user_id uuid,
  p_plan_code public.plan_code,
  p_source text default 'admin',
  p_external_ref text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_service boolean := auth.role() = 'service_role';
  v_source text := lower(nullif(btrim(coalesce(p_source, '')), ''));
  v_previous public.plan_code;
  v_grant_id uuid;
begin
  if not (v_is_service or public.is_admin()) then
    raise exception 'only an admin can set a member plan';
  end if;

  if v_source is null or v_source not in ('signup', 'skool', 'stripe', 'admin') then
    raise exception 'source must be signup, skool, stripe or admin';
  end if;

  -- flourish is retired. Refusing it here is what keeps the decision true:
  -- a dormant enum value is otherwise one typo away from being assigned.
  if p_plan_code = 'flourish' then
    raise exception 'flourish is retired; assign sprout or bloom';
  end if;

  select plan_code into v_previous
  from public.user_profiles
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'member not found';
  end if;

  -- Re-asserting the plan a member already holds writes nothing. The audit
  -- trail is a record of changes, and filling it with no-ops makes the
  -- changes harder to find.
  if v_previous = p_plan_code then
    return jsonb_build_object(
      'status', 'unchanged',
      'user_id', p_user_id,
      'plan_code', p_plan_code
    );
  end if;

  update public.user_profiles
  set plan_code = p_plan_code,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.plan_grants (
    user_id, plan_code, previous_plan_code, source, external_ref, granted_by_user_id, note
  )
  values (
    p_user_id,
    p_plan_code,
    v_previous,
    v_source,
    nullif(btrim(coalesce(p_external_ref, '')), ''),
    v_caller,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into v_grant_id;

  return jsonb_build_object(
    'status', 'changed',
    'user_id', p_user_id,
    'plan_code', p_plan_code,
    'previous_plan_code', v_previous,
    'source', v_source,
    'grant_id', v_grant_id
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. member_plan_state — plan plus where it came from
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.member_plan_state(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_service boolean := auth.role() = 'service_role';
  v_profile public.user_profiles%rowtype;
  v_grant public.plan_grants%rowtype;
begin
  if not (v_is_service or public.is_admin() or (v_caller is not null and v_caller = p_user_id)) then
    raise exception 'you can only read your own plan';
  end if;

  select * into v_profile from public.user_profiles where user_id = p_user_id;
  if not found then
    raise exception 'member not found';
  end if;

  select * into v_grant
  from public.plan_grants
  where user_id = p_user_id
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'user_id', p_user_id,
    'plan_code', v_profile.plan_code,
    -- No grant row means the member is still on the signup default.
    'source', coalesce(v_grant.source, 'signup'),
    'external_ref', v_grant.external_ref,
    'granted_at', coalesce(v_grant.created_at, v_profile.created_at),
    'granted_by_user_id', v_grant.granted_by_user_id,
    'note', v_grant.note
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. admin_search_members — so the admin control is usable
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Setting a plan by hand means finding the member first, and the thing an
-- admin has is an email — which lives in auth.users, not user_profiles.
-- Without this the control would mean pasting UUIDs, which is the kind of
-- friction that gets a feature quietly abandoned.

create or replace function public.admin_search_members(
  p_query text,
  p_limit integer default 20
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  plan_code public.plan_code,
  plan_source text,
  account_status text,
  is_demo boolean,
  skool_ref text,
  discord_handle text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not (public.is_admin() or auth.role() = 'service_role') then
    raise exception 'admin only';
  end if;

  if v_query is null then
    raise exception 'a search term is required';
  end if;

  return query
  select
    up.user_id,
    au.email::text,
    up.display_name,
    up.plan_code,
    coalesce((
      select pg.source from public.plan_grants pg
      where pg.user_id = up.user_id
      order by pg.created_at desc
      limit 1
    ), 'signup') as plan_source,
    up.account_status,
    up.is_demo,
    (select mi.external_id from public.member_identities mi
      where mi.user_id = up.user_id and mi.provider = 'skool' and mi.status = 'linked'
      limit 1) as skool_ref,
    (select mi.handle from public.member_identities mi
      where mi.user_id = up.user_id and mi.provider = 'discord' and mi.status = 'linked'
      limit 1) as discord_handle
  from public.user_profiles up
  join auth.users au on au.id = up.user_id
  where au.email ilike '%' || v_query || '%'
     or up.display_name ilike '%' || v_query || '%'
     or up.public_username::text ilike '%' || v_query || '%'
  order by up.created_at desc
  limit greatest(least(coalesce(p_limit, 20), 50), 1);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Backfill — explain the plans that already exist
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Only non-sprout profiles get a row. sprout is the signup default and needs
-- no explanation; member_plan_state reports 'signup' when no grant exists.

insert into public.plan_grants (user_id, plan_code, previous_plan_code, source, note, created_at)
select up.user_id, up.plan_code, null, 'admin',
       'backfilled 2026-10-16: plan predates plan_grants', up.created_at
from public.user_profiles up
where up.plan_code <> 'sprout'
  and not exists (select 1 from public.plan_grants pg where pg.user_id = up.user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Grants
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.set_member_plan(uuid, public.plan_code, text, text, text) from public;
revoke all on function public.member_plan_state(uuid) from public;
revoke all on function public.admin_search_members(text, integer) from public;

-- set_member_plan and admin_search_members re-check is_admin()/service_role
-- in their own bodies; the grant to `authenticated` is what lets a signed-in
-- admin call them at all, not what authorises them.
grant execute on function public.set_member_plan(uuid, public.plan_code, text, text, text) to authenticated, service_role;
grant execute on function public.member_plan_state(uuid) to authenticated, service_role;
grant execute on function public.admin_search_members(text, integer) to authenticated, service_role;
