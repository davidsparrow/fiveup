-- Phase 9b: Public surfaces — external profile links on /u/[username].
--
-- Owner-managed external links (freeform https URL + optional label), rendered
-- on the public profile behind the existing show_external_links toggle (added
-- in 8a). Free for all members; capped at 5 per profile. Same security model as
-- the rest of Phase 8/9: writes go through security-definer RPCs with
-- assert_active_caller; the public read is a security-definer projection granted
-- to anon; NO anon policy on the base table. A moderation_status column lets
-- Phase-7 remove a link (the projection ANDs ='ok'); a user-facing report entry
-- point is deferred.
--
-- Idempotent / safely re-runnable.

create table if not exists public.profile_external_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  url text not null,
  label text,
  sort_order integer not null default 0,
  moderation_status text not null default 'ok' check (moderation_status in ('ok', 'removed')),
  created_at timestamptz not null default now()
);
create index if not exists idx_profile_external_links_user on public.profile_external_links (user_id);

alter table public.profile_external_links enable row level security;

-- Owners may read their own links (for a settings UI); everyone else reads only
-- the curated anon projection below. No anon policy — anon stays out of the table.
drop policy if exists "external_links_select_own" on public.profile_external_links;
create policy "external_links_select_own" on public.profile_external_links
  for select to authenticated using (user_id = auth.uid());

-- ── Owner writes ────────────────────────────────────────────────────────────

create or replace function public.add_external_link(p_url text, p_label text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_url text := btrim(coalesce(p_url, ''));
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_count integer;
  v_next integer;
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();

  if v_url !~* '^https://[^ ]+\.[^ ]+' then raise exception 'links must be a valid https:// URL'; end if;
  if length(v_url) > 500 then raise exception 'url is too long (max 500 chars)'; end if;
  if v_label is not null and length(v_label) > 80 then raise exception 'label is too long (max 80 chars)'; end if;

  select count(*) into v_count from public.profile_external_links where user_id = v_uid;
  if v_count >= 5 then raise exception 'you can add at most 5 external links'; end if;

  select coalesce(max(sort_order), -1) + 1 into v_next from public.profile_external_links where user_id = v_uid;
  insert into public.profile_external_links (user_id, url, label, sort_order)
    values (v_uid, v_url, v_label, v_next)
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.remove_external_link(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();

  delete from public.profile_external_links where id = p_id and user_id = v_uid;
  if not found then raise exception 'link not found'; end if;
end;
$$;

-- Reorder the caller's links to match the given id order (ids not owned by the
-- caller are ignored).
create or replace function public.reorder_external_links(p_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();

  update public.profile_external_links pl
    set sort_order = idx.ord
    from (select unnest(p_ids) as id, generate_subscripts(p_ids, 1) - 1 as ord) idx
    where pl.id = idx.id and pl.user_id = v_uid;
end;
$$;

-- ── Anon projection ─────────────────────────────────────────────────────────
-- Only when the profile is public + not suppressed + show_external_links on,
-- and only clean links. Free feature — no plan re-check.
create or replace function public.get_public_links(p_username citext)
returns table (url text, label text)
language sql stable security definer set search_path = public
as $$
  select pl.url, pl.label
  from public.user_profiles up
  join public.profile_external_links pl on pl.user_id = up.user_id
  where up.public_username = p_username
    and up.profile_public_enabled
    and up.account_status <> 'suspended'
    and up.moderation_status = 'ok'
    and up.show_external_links
    and pl.moderation_status = 'ok'
  order by pl.sort_order, pl.created_at;
$$;

revoke all on function public.add_external_link(text, text) from public;
revoke all on function public.remove_external_link(uuid) from public;
revoke all on function public.reorder_external_links(uuid[]) from public;
revoke all on function public.get_public_links(citext) from public;

grant execute on function public.add_external_link(text, text) to authenticated;
grant execute on function public.remove_external_link(uuid) to authenticated;
grant execute on function public.reorder_external_links(uuid[]) to authenticated;
grant execute on function public.get_public_links(citext) to anon, authenticated;
