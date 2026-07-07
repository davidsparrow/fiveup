-- Phase 8b: Public surfaces — the anon-callable public-read layer.
--
-- The security boundary: this is where an UNAUTHENTICATED visitor first reads
-- data. It does so ONLY through security-definer projection RPCs granted to
-- `anon` that return a curated set of approved public fields — never raw table
-- rows (no `anon` table policies exist or are added). Every public read ANDs in
-- Phase-7 suppression: owner not suspended AND the row's moderation_status='ok'.
-- Paid sections are re-checked against the owner's *current* plan (so a
-- downgrade immediately hides paid content even if the toggle is still on).
--
--   • assets.public_slug (citext unique) for /a/[slug]; auto-assigned when an
--     asset is first published (set_asset_visibility updated).
--   • public_feedback_permissions — per-item approval by the recipient; only
--     approved received feedback/reviews can appear publicly.
--   • get_public_profile / get_public_feedback / get_public_assets /
--     get_public_offers — anon-callable curated projections.
--
-- Idempotent / safely re-runnable.

-- ── Asset public slug ──────────────────────────────────────────────────────
alter table public.assets add column if not exists public_slug citext unique;

create or replace function public.slugify(p_text text)
returns text language sql immutable as $$
  select coalesce(nullif(btrim(left(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'), 40), '-'), ''), 'asset');
$$;

-- ── Per-item public approval (recipient curates their own testimonials) ────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'public_feedback_source') then
    create type public.public_feedback_source as enum ('match_feedback', 'engaged_review');
  end if;
end $$;

create table if not exists public.public_feedback_permissions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.user_profiles(user_id) on delete cascade, -- the reviewee
  source_type public.public_feedback_source not null,
  source_id uuid not null,
  approved boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);
create index if not exists idx_pfp_owner on public.public_feedback_permissions (owner_user_id);

drop trigger if exists trg_pfp_updated_at on public.public_feedback_permissions;
create trigger trg_pfp_updated_at before update on public.public_feedback_permissions
  for each row execute function public.set_updated_at();

alter table public.public_feedback_permissions enable row level security;
drop policy if exists "pfp_select_own_or_mod" on public.public_feedback_permissions;
create policy "pfp_select_own_or_mod" on public.public_feedback_permissions
  for select to authenticated using (owner_user_id = auth.uid() or public.is_moderator());

-- The recipient of a piece of feedback approves (or unapproves) showing it
-- publicly. Only feedback ABOUT the caller can be approved by them.
create or replace function public.approve_public_feedback(
  p_source_type public.public_feedback_source,
  p_source_id uuid,
  p_approved boolean default true
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_recipient boolean;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();

  if p_source_type = 'match_feedback' then
    select exists (select 1 from public.feedback_submissions where id = p_source_id and reviewee_user_id = v_uid) into v_is_recipient;
  else
    select exists (select 1 from public.proof_lab_reviews where id = p_source_id and reviewee_user_id = v_uid) into v_is_recipient;
  end if;
  if not v_is_recipient then raise exception 'you can only publish feedback you received'; end if;

  insert into public.public_feedback_permissions (owner_user_id, source_type, source_id, approved)
  values (v_uid, p_source_type, p_source_id, coalesce(p_approved, true))
  on conflict (source_type, source_id) do update set approved = excluded.approved, updated_at = now();
end;
$$;

-- ── set_asset_visibility gains slug auto-assignment on first publish ───────
create or replace function public.set_asset_visibility(
  p_asset_id uuid,
  p_visibility public.asset_visibility
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mod text;
  v_name text;
  v_slug citext;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();

  select moderation_status, name into v_mod, v_name from public.assets
    where id = p_asset_id and owner_user_id = v_uid;
  if not found then raise exception 'asset not found'; end if;
  if p_visibility = 'public' and v_mod <> 'ok' then
    raise exception 'this asset cannot be made public';
  end if;

  update public.assets set visibility = p_visibility where id = p_asset_id;

  -- assign a stable public slug the first time an asset is published
  if p_visibility = 'public' then
    update public.assets
      set public_slug = (public.slugify(v_name) || '-' || left(replace(p_asset_id::text, '-', ''), 6))::citext
      where id = p_asset_id and public_slug is null;
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Public-read RPCs — anon-callable, curated projections. A profile is only
-- visible when profile_public_enabled AND owner not suspended AND
-- moderation_status='ok'; each field/section is additionally gated by its
-- show_* toggle and (for paid sections) the owner's current plan.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.get_public_profile(p_username citext)
returns table (
  display_name text,
  public_username citext,
  bio text,
  avatar_url text,
  location_text text,
  feedback_rating_avg numeric,
  feedback_rating_count integer,
  proof_lab_rating_avg numeric,
  proof_lab_rating_count integer,
  categories text[],
  searchable boolean
)
language sql stable security definer set search_path = public
as $$
  select
    up.display_name,
    up.public_username,
    up.bio,
    case when up.show_logo then up.avatar_url end,
    case when up.show_location then up.location_text end,
    case when up.show_stats then up.feedback_rating_avg end,
    case when up.show_stats then up.feedback_rating_count end,
    case when up.show_stats then up.proof_lab_rating_avg end,
    case when up.show_stats then up.proof_lab_rating_count end,
    coalesce((
      select array_agg(distinct cat order by cat) from (
        select c.label as cat
        from public.proof_lab_listings l
        join public.proof_lab_categories c on c.slug = l.category_slug
        where l.seller_user_id = up.user_id and l.status = 'active' and l.moderation_status = 'ok'
        union
        select initcap(replace(a.asset_type::text, '_', ' '))
        from public.assets a
        where a.owner_user_id = up.user_id and a.visibility = 'public' and a.moderation_status = 'ok'
      ) d
    ), '{}'::text[]),
    up.searchable_public_profile and public.plan_feature_enabled(up.plan_code, 'public_profile_indexing_enabled')
  from public.user_profiles up
  where up.public_username = p_username
    and up.profile_public_enabled
    and up.account_status <> 'suspended'
    and up.moderation_status = 'ok';
$$;

-- Approved written excerpts + approved video/audio clips, each gated by its
-- paid toggle AND the owner's current plan.
create or replace function public.get_public_feedback(p_username citext)
returns table (kind text, body text, stars smallint, media_url text, created_at timestamptz, source text)
language sql stable security definer set search_path = public
as $$
  with up as (
    select * from public.user_profiles
    where public_username = p_username and profile_public_enabled
      and account_status <> 'suspended' and moderation_status = 'ok'
  )
  select 'excerpt'::text, fs.written_feedback, fs.stars::smallint, null::text, fs.submitted_at, 'match'::text
  from up
  join public.feedback_submissions fs on fs.reviewee_user_id = up.user_id
  join public.public_feedback_permissions pp on pp.source_type = 'match_feedback' and pp.source_id = fs.id and pp.approved
  where up.show_feedback_excerpts and public.plan_feature_enabled(up.plan_code, 'public_feedback_excerpts_enabled')
    and fs.moderation_status = 'ok'
    and nullif(btrim(coalesce(fs.written_feedback, '')), '') is not null
  union all
  select 'excerpt'::text, r.written_review, r.stars, null::text, r.created_at, 'engaged_review'::text
  from up
  join public.proof_lab_reviews r on r.reviewee_user_id = up.user_id
  join public.public_feedback_permissions pp on pp.source_type = 'engaged_review' and pp.source_id = r.id and pp.approved
  where up.show_feedback_excerpts and public.plan_feature_enabled(up.plan_code, 'public_feedback_excerpts_enabled')
    and r.moderation_status = 'ok'
    and nullif(btrim(coalesce(r.written_review, '')), '') is not null
  union all
  select 'clip'::text, fs.written_feedback, fs.stars::smallint, fs.media_url, fs.submitted_at, 'match'::text
  from up
  join public.feedback_submissions fs on fs.reviewee_user_id = up.user_id
  join public.public_feedback_permissions pp on pp.source_type = 'match_feedback' and pp.source_id = fs.id and pp.approved
  where up.show_public_videos and public.plan_feature_enabled(up.plan_code, 'public_video_enabled')
    and fs.moderation_status = 'ok'
    and nullif(btrim(coalesce(fs.media_url, '')), '') is not null;
$$;

create or replace function public.get_public_assets(p_username citext)
returns table (name text, description text, asset_type text, public_slug citext, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select a.name, a.description, a.asset_type::text, a.public_slug, a.created_at
  from public.user_profiles up
  join public.assets a on a.owner_user_id = up.user_id
  where up.public_username = p_username and up.profile_public_enabled
    and up.account_status <> 'suspended' and up.moderation_status = 'ok'
    and a.visibility = 'public' and a.moderation_status = 'ok'
  order by a.created_at desc;
$$;

create or replace function public.get_public_offers(p_username citext)
returns table (title text, category text, badge text, member_price_cents integer, price_unit text, donation_percent smallint)
language sql stable security definer set search_path = public
as $$
  select l.title, c.label, l.badge, l.member_price_cents, l.price_unit, l.donation_percent
  from public.user_profiles up
  join public.proof_lab_listings l on l.seller_user_id = up.user_id
  left join public.proof_lab_categories c on c.slug = l.category_slug
  where up.public_username = p_username and up.profile_public_enabled
    and up.account_status <> 'suspended' and up.moderation_status = 'ok'
    and up.show_marketplace_offers and public.plan_feature_enabled(up.plan_code, 'proof_lab_listings_enabled')
    and l.status = 'active' and l.moderation_status = 'ok'
  order by l.created_at desc;
$$;

revoke all on function public.approve_public_feedback(public.public_feedback_source, uuid, boolean) from public;
revoke all on function public.get_public_profile(citext) from public;
revoke all on function public.get_public_feedback(citext) from public;
revoke all on function public.get_public_assets(citext) from public;
revoke all on function public.get_public_offers(citext) from public;
revoke all on function public.slugify(text) from public;

grant execute on function public.approve_public_feedback(public.public_feedback_source, uuid, boolean) to authenticated;
grant execute on function public.get_public_profile(citext) to anon, authenticated;
grant execute on function public.get_public_feedback(citext) to anon, authenticated;
grant execute on function public.get_public_assets(citext) to anon, authenticated;
grant execute on function public.get_public_offers(citext) to anon, authenticated;
