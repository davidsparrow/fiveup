-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 20 / Discord D1 — member identities, and the two roads to one row.
--
-- A ProofSignals account can only be proved on a page where the member is
-- already signed in; Discord hands the bot a snowflake and nothing else. So
-- linking runs two ways into one table:
--
--   road 1 — the member is on the site. Supabase's Discord OAuth provider
--            attaches a Discord identity to their existing auth user, and
--            link_discord_from_auth_identity() copies it across. The id is
--            read out of auth.identities, never out of client input.
--
--   road 2 — the member found Discord first. /link asks the bot for a code
--            (issue_member_link_code, service role only), the member pastes
--            it on /account while signed in (redeem_member_link_code), and
--            the row is written under their own session.
--
-- member_identities is unique on (provider, external_id) AND on
-- (user_id, provider): one Discord account per member, one member per
-- Discord account. That is what stops two site accounts farming the same
-- person's help later, and it holds across unlinking — unlink sets a status
-- and keeps the row, so a member who leaves and comes back keeps their
-- history and nobody else can claim their snowflake in the gap. Moving a
-- Discord account to a different member is deliberately an admin act
-- (admin_reassign_member_identity).
--
-- provider = 'skool' needs no schema change when the Zapier tie-back lands;
-- external_id is the member's Skool email there.
--
-- Nothing here grants points, reads a review, or touches the match
-- lifecycle. Idempotent / safely re-runnable.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. member_identities — the linked-account row
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.member_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  provider text not null check (provider in ('discord', 'skool')),
  external_id text not null,
  handle text,
  status text not null default 'linked' check (status in ('linked', 'unlinked')),
  linked_via text not null default 'oauth' check (linked_via in ('oauth', 'code', 'admin')),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  -- Set once the Discord Member role has actually been granted, so a failed
  -- role call is visible and retryable instead of silently leaving someone
  -- linked on the site and Unlinked in the server.
  role_granted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_member_identities_provider_external
  on public.member_identities (provider, external_id);
create unique index if not exists uq_member_identities_user_provider
  on public.member_identities (user_id, provider);

comment on table public.member_identities is
  'One row per (member, provider). Unlinking sets status, never deletes: the uniqueness has to hold across a gap so nobody else can claim a departed member''s Discord account. See 20261015130000_phase20_member_identities.sql.';
comment on column public.member_identities.external_id is
  'Discord user snowflake for provider=discord; the member''s Skool email for provider=skool.';
comment on column public.member_identities.role_granted_at is
  'When the Discord Member role was granted. Null on a linked row means the grant failed or the bot was not configured — retryable.';

alter table public.member_identities enable row level security;

-- Members read their own rows and nothing else; a Discord handle is not
-- public information. Writes go through the RPCs below, which is why there
-- is no insert or update policy.
drop policy if exists "member_identities_select_own" on public.member_identities;
create policy "member_identities_select_own"
on public.member_identities for select to authenticated
using (user_id = auth.uid() or public.is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. member_link_codes — road 2's one-time code
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Issued to a Discord user by the bot, redeemed on the site by whoever is
-- signed in. Crockford base32 (no I, L, O or U), 8 characters, 15 minutes.
-- Single use, and issuing a new one invalidates that Discord user's
-- outstanding codes so a stale code in a chat log is worthless.

create table if not exists public.member_link_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  provider text not null default 'discord' check (provider in ('discord', 'skool')),
  external_id text not null,
  external_handle text,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_user_id uuid references public.user_profiles(user_id) on delete set null
);

create index if not exists idx_member_link_codes_external
  on public.member_link_codes (provider, external_id);
create index if not exists idx_member_link_codes_open
  on public.member_link_codes (expires_at)
  where consumed_at is null;

comment on table public.member_link_codes is
  'One-time codes for the /link fallback. The bot issues against a Discord snowflake; the member redeems under their own session. Service role issues, authenticated members redeem.';

alter table public.member_link_codes enable row level security;
-- No policy at all: nobody reads this table as a member. The service role
-- bypasses RLS, and redemption happens inside a security-definer RPC. A
-- readable code table would hand anyone else's pending code away.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Code shape — one alphabet, agreed with src/lib/community/rules/link-codes.js
-- ═══════════════════════════════════════════════════════════════════════════

-- Crockford base32 decoding: case-insensitive, O reads as 0, I and L read as
-- 1, and separators are ignored. The JS normaliser does exactly this, and
-- verify-phase20.mjs asserts the two agree on messy input.
create or replace function public.normalize_member_link_code(p_raw text)
returns text
language sql
immutable
as $$
  select nullif(
    translate(upper(regexp_replace(coalesce(p_raw, ''), '[^0-9A-Za-z]', '', 'g')), 'OIL', '011'),
    ''
  );
$$;

create or replace function public.generate_member_link_code()
returns text
language plpgsql
volatile
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_code text := '';
  i integer;
begin
  for i in 1..8 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
  end loop;
  return v_code;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. issue_member_link_code — the bot's half of road 2 (service role only)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.issue_member_link_code(
  p_provider text,
  p_external_id text,
  p_external_handle text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := lower(nullif(btrim(coalesce(p_provider, '')), ''));
  v_external text := nullif(btrim(coalesce(p_external_id, '')), '');
  v_existing public.member_identities%rowtype;
  v_code text;
  v_expires timestamptz := now() + interval '15 minutes';
  v_attempt integer := 0;
begin
  -- The bot is the only caller. An authenticated member reaching this could
  -- mint a code against someone else's snowflake and link their account.
  if auth.role() <> 'service_role' then
    raise exception 'link codes are issued by the bot only';
  end if;

  if v_provider is null or v_provider not in ('discord', 'skool') then
    raise exception 'provider must be discord or skool';
  end if;

  if v_external is null then
    raise exception 'external_id is required';
  end if;

  select * into v_existing
  from public.member_identities
  where provider = v_provider
    and external_id = v_external;

  if found and v_existing.status = 'linked' then
    return jsonb_build_object(
      'status', 'already_linked',
      'user_id', v_existing.user_id,
      'role_granted_at', v_existing.role_granted_at
    );
  end if;

  -- A new code retires this Discord user's outstanding ones.
  update public.member_link_codes
  set consumed_at = now()
  where provider = v_provider
    and external_id = v_external
    and consumed_at is null;

  loop
    v_attempt := v_attempt + 1;
    v_code := public.generate_member_link_code();

    begin
      insert into public.member_link_codes (code, provider, external_id, external_handle, expires_at)
      values (v_code, v_provider, v_external, nullif(btrim(coalesce(p_external_handle, '')), ''), v_expires);
      exit;
    exception when unique_violation then
      if v_attempt >= 8 then
        raise exception 'could not allocate a link code';
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'status', 'issued',
    'code', v_code,
    'expires_at', v_expires
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. redeem_member_link_code — the member's half of road 2
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.redeem_member_link_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_code text := public.normalize_member_link_code(p_code);
  v_row public.member_link_codes%rowtype;
  v_identity public.member_identities%rowtype;
begin
  if v_caller is null then
    raise exception 'authentication required';
  end if;
  perform public.assert_active_caller();

  if v_code is null then
    raise exception 'that code is not valid or has expired';
  end if;

  select * into v_row
  from public.member_link_codes
  where code = v_code
  for update;

  -- One message for every failure mode. A code that reports "expired"
  -- separately from "wrong" tells a guesser which half of the space to work.
  if not found or v_row.consumed_at is not null or v_row.expires_at <= now() then
    raise exception 'that code is not valid or has expired';
  end if;

  -- Is this Discord account spoken for?
  select * into v_identity
  from public.member_identities
  where provider = v_row.provider
    and external_id = v_row.external_id;

  if found and v_identity.user_id <> v_caller then
    raise exception 'that % account is already linked to another ProofSignals member', v_row.provider;
  end if;

  -- Does this member already hold a different account on that provider?
  if exists (
    select 1
    from public.member_identities
    where user_id = v_caller
      and provider = v_row.provider
      and external_id <> v_row.external_id
  ) then
    raise exception 'your account is already linked to a different % account; unlink it first', v_row.provider;
  end if;

  insert into public.member_identities (
    user_id, provider, external_id, handle, status, linked_via, linked_at, unlinked_at, metadata
  )
  values (
    v_caller, v_row.provider, v_row.external_id, v_row.external_handle,
    'linked', 'code', now(), null, '{}'::jsonb
  )
  on conflict (provider, external_id) do update
  set user_id = excluded.user_id,
      handle = coalesce(excluded.handle, member_identities.handle),
      status = 'linked',
      linked_via = 'code',
      linked_at = now(),
      unlinked_at = null,
      updated_at = now()
  returning * into v_identity;

  update public.member_link_codes
  set consumed_at = now(),
      consumed_by_user_id = v_caller
  where id = v_row.id;

  return jsonb_build_object(
    'status', 'linked',
    'provider', v_identity.provider,
    'external_id', v_identity.external_id,
    'handle', v_identity.handle,
    'identity_id', v_identity.id
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. link_discord_from_auth_identity — road 1
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Reads the Discord identity Supabase attached to the caller's auth user.
-- The snowflake comes out of auth.identities, so there is no client-supplied
-- id to forge: a member can only link the Discord account they just proved
-- they control through OAuth.

create or replace function public.link_discord_from_auth_identity()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_external text;
  v_handle text;
  v_identity public.member_identities%rowtype;
  v_claimed public.member_identities%rowtype;
begin
  if v_caller is null then
    raise exception 'authentication required';
  end if;
  perform public.assert_active_caller();

  select
    coalesce(i.identity_data ->> 'provider_id', i.identity_data ->> 'sub'),
    coalesce(
      i.identity_data ->> 'user_name',
      i.identity_data ->> 'preferred_username',
      i.identity_data ->> 'name',
      i.identity_data ->> 'full_name'
    )
  into v_external, v_handle
  from auth.identities i
  where i.user_id = v_caller
    and i.provider = 'discord'
  order by i.created_at desc
  limit 1;

  if v_external is null then
    raise exception 'no Discord identity is attached to your account';
  end if;

  select * into v_claimed
  from public.member_identities
  where provider = 'discord'
    and external_id = v_external;

  if found and v_claimed.user_id <> v_caller then
    raise exception 'that Discord account is already linked to another ProofSignals member';
  end if;

  if exists (
    select 1
    from public.member_identities
    where user_id = v_caller
      and provider = 'discord'
      and external_id <> v_external
  ) then
    raise exception 'your account is already linked to a different Discord account; unlink it first';
  end if;

  insert into public.member_identities (
    user_id, provider, external_id, handle, status, linked_via, linked_at, unlinked_at
  )
  values (v_caller, 'discord', v_external, v_handle, 'linked', 'oauth', now(), null)
  on conflict (provider, external_id) do update
  set user_id = excluded.user_id,
      handle = coalesce(excluded.handle, member_identities.handle),
      status = 'linked',
      linked_via = 'oauth',
      linked_at = now(),
      unlinked_at = null,
      updated_at = now()
  returning * into v_identity;

  return jsonb_build_object(
    'status', 'linked',
    'provider', 'discord',
    'external_id', v_identity.external_id,
    'handle', v_identity.handle,
    'identity_id', v_identity.id,
    'role_granted_at', v_identity.role_granted_at
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. unlink, and the bot's lookups
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.unlink_member_identity(p_provider text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_provider text := lower(nullif(btrim(coalesce(p_provider, '')), ''));
begin
  if v_caller is null then
    raise exception 'authentication required';
  end if;

  update public.member_identities
  set status = 'unlinked',
      unlinked_at = now(),
      role_granted_at = null,
      updated_at = now()
  where user_id = v_caller
    and provider = v_provider
    and status = 'linked';

  if not found then
    raise exception 'no linked % account to unlink', coalesce(v_provider, 'provider');
  end if;
end;
$$;

-- discord_user_id -> user_id. The bot's first call on every command.
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
begin
  if auth.role() <> 'service_role' then
    raise exception 'identity lookup is for the bot only';
  end if;

  select * into v_row
  from public.member_identities
  where provider = lower(coalesce(p_provider, ''))
    and external_id = nullif(btrim(coalesce(p_external_id, '')), '')
    and status = 'linked';

  if not found then
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
    'is_demo', v_profile.is_demo,
    'role_granted_at', v_row.role_granted_at
  );
end;
$$;

-- Recorded by whoever actually completed the Discord role call — the site
-- route on the OAuth road, the bot on the code road.
create or replace function public.mark_member_role_granted(
  p_provider text,
  p_external_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_service boolean := auth.role() = 'service_role';
begin
  if not v_is_service and v_caller is null then
    raise exception 'authentication required';
  end if;

  update public.member_identities
  set role_granted_at = now(),
      updated_at = now()
  where provider = lower(coalesce(p_provider, ''))
    and external_id = nullif(btrim(coalesce(p_external_id, '')), '')
    and status = 'linked'
    and (v_is_service or user_id = v_caller);

  if not found then
    raise exception 'no linked identity to mark';
  end if;
end;
$$;

-- Moving a Discord account to a different member is a judgement call, so it
-- is an admin act rather than something the uniqueness rules allow by
-- accident. The old row is unlinked, not deleted.
create or replace function public.admin_reassign_member_identity(
  p_provider text,
  p_external_id text,
  p_to_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := lower(nullif(btrim(coalesce(p_provider, '')), ''));
  v_external text := nullif(btrim(coalesce(p_external_id, '')), '');
begin
  if not (public.is_admin() or auth.role() = 'service_role') then
    raise exception 'admin only';
  end if;

  if not exists (select 1 from public.user_profiles where user_id = p_to_user_id) then
    raise exception 'target profile not found';
  end if;

  update public.member_identities
  set status = 'unlinked',
      unlinked_at = now(),
      role_granted_at = null,
      updated_at = now()
  where user_id = p_to_user_id
    and provider = v_provider
    and external_id <> v_external;

  update public.member_identities
  set user_id = p_to_user_id,
      status = 'linked',
      linked_via = 'admin',
      linked_at = now(),
      unlinked_at = null,
      role_granted_at = null,
      updated_at = now()
  where provider = v_provider
    and external_id = v_external;

  if not found then
    raise exception 'no identity row for that % account', v_provider;
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Grants — bot-only functions never reach `authenticated`
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.normalize_member_link_code(text) from public;
revoke all on function public.generate_member_link_code() from public;
revoke all on function public.issue_member_link_code(text, text, text) from public;
revoke all on function public.redeem_member_link_code(text) from public;
revoke all on function public.link_discord_from_auth_identity() from public;
revoke all on function public.unlink_member_identity(text) from public;
revoke all on function public.member_for_external_identity(text, text) from public;
revoke all on function public.mark_member_role_granted(text, text) from public;
revoke all on function public.admin_reassign_member_identity(text, text, uuid) from public;

grant execute on function public.redeem_member_link_code(text) to authenticated;
grant execute on function public.link_discord_from_auth_identity() to authenticated;
grant execute on function public.unlink_member_identity(text) to authenticated;
grant execute on function public.mark_member_role_granted(text, text) to authenticated, service_role;
grant execute on function public.admin_reassign_member_identity(text, text, uuid) to authenticated, service_role;

-- Bot only. These are granted to service_role explicitly and to nobody else;
-- each also re-checks auth.role() in its body, so a stray grant is not the
-- only thing standing between a member and someone else's snowflake.
grant execute on function public.issue_member_link_code(text, text, text) to service_role;
grant execute on function public.member_for_external_identity(text, text) to service_role;
grant execute on function public.normalize_member_link_code(text) to authenticated, service_role;
