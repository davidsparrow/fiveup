-- Phase 23: member profile cards.
--
-- The public profile at /u/<handle> becomes a single-viewport, tab-layered
-- "card": a framed photo the member styles, a tagline, an optional headline
-- review, and Reviews / About / Links layers. This migration adds what the
-- card stores, the one member-facing writer for it, the public projection of
-- it, flips review excerpts on for the free plan, and creates the avatar
-- bucket. Idempotent; runs as one transaction via the Management API.
--
-- Style contract: `profile_style` holds only keys and values from the closed
-- lists in src/components/fivestarz/profile-card/cardStyle.js. The validator
-- below is that file's twin; verify-phase23.mjs asserts they never drift. A
-- member never supplies a colour, a length or CSS — only a key the renderer
-- maps — so nothing user-controlled reaches a style attribute unmapped.
-- Later changes to the validator may only WIDEN the sets: a CHECK is not
-- re-evaluated on existing rows, so narrowing needs a data migration first.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Validator — immutable, so it can back a CHECK constraint.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.profile_style_is_valid(p jsonb)
returns boolean
language sql immutable
as $$
  select p is not null
    and jsonb_typeof(p) = 'object'
    and length(p::text) <= 1500
    and not exists (
      select 1 from jsonb_object_keys(p) k
      where k not in ('shape','ring','ringWidth','ringColor','ringColor2','photoBg','shadow',
                      'photoPos','textSide','textAlign','bgKind','bgColor','bgColor2','bgPreset')
    )
    -- Every present value must be a JSON string (null, numbers, objects fail).
    and not exists (
      select 1 from jsonb_each(p) e where jsonb_typeof(e.value) <> 'string'
    )
    -- An absent key is null -> coalesce true; a present one must be listed.
    and coalesce(p->>'shape'      in ('circle','rounded','squircle','arch','none'), true)
    and coalesce(p->>'ring'       in ('solid','gradient','none'), true)
    and coalesce(p->>'ringWidth'  in ('thin','regular','bold'), true)
    and coalesce(p->>'photoBg'    in ('transparent','white'), true)
    and coalesce(p->>'shadow'     in ('none','soft','strong'), true)
    and coalesce(p->>'photoPos'   in ('top-left','top-center','top-right','bottom-left','bottom-center','bottom-right'), true)
    and coalesce(p->>'textSide'   in ('auto','top','bottom'), true)
    and coalesce(p->>'textAlign'  in ('auto','left','center','right'), true)
    and coalesce(p->>'bgKind'     in ('solid','gradient','preset'), true)
    and coalesce(p->>'bgPreset'   in ('ember','tide','dusk','cream'), true)
    and coalesce(p->>'ringColor'  in ('orange','orangeL','gold','goldL','brown','brownM','teal','tealL','cream','purple','green','slate','white'), true)
    and coalesce(p->>'ringColor2' in ('orange','orangeL','gold','goldL','brown','brownM','teal','tealL','cream','purple','green','slate','white'), true)
    and coalesce(p->>'bgColor'    in ('orange','orangeL','gold','goldL','brown','brownM','teal','tealL','cream','purple','green','slate','white'), true)
    and coalesce(p->>'bgColor2'   in ('orange','orangeL','gold','goldL','brown','brownM','teal','tealL','cream','purple','green','slate','white'), true);
$$;

comment on function public.profile_style_is_valid(jsonb) is
  'Closed whitelist for user_profiles.profile_style. Twin of cardStyle.js; widen only. See 20261027120000_phase23_profile_card.sql.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Columns and constraints on user_profiles.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.user_profiles
  add column if not exists profile_style jsonb not null default '{}'::jsonb,
  add column if not exists tagline text,
  add column if not exists headline_feedback_source_type public.public_feedback_source,
  add column if not exists headline_feedback_source_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_profile_style_valid') then
    alter table public.user_profiles
      add constraint user_profiles_profile_style_valid
      check (public.profile_style_is_valid(profile_style));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'user_profiles_tagline_len') then
    alter table public.user_profiles
      add constraint user_profiles_tagline_len
      check (tagline is null or (char_length(tagline) <= 80 and tagline !~ '[\n\r]'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'user_profiles_headline_pair') then
    alter table public.user_profiles
      add constraint user_profiles_headline_pair
      check ((headline_feedback_source_type is null) = (headline_feedback_source_id is null));
  end if;

  -- public_feedback_permissions is unique (source_type, source_id), so the
  -- headline can reference the approval row itself. Deleting that row (never
  -- done today — approvals flip `approved`) nulls the headline; the read side
  -- still re-checks `approved` and every excerpt gate at query time.
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_headline_fk') then
    alter table public.user_profiles
      add constraint user_profiles_headline_fk
      foreign key (headline_feedback_source_type, headline_feedback_source_id)
      references public.public_feedback_permissions (source_type, source_id)
      on delete set null;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. update_profile_card — the only member writer for the three new fields.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.update_profile_card(
  p_tagline text default null,
  p_clear_tagline boolean default false,
  p_profile_style jsonb default null,
  p_headline_source_type public.public_feedback_source default null,
  p_headline_source_id uuid default null,
  p_clear_headline boolean default false
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tag text;
  v_sev public.moderation_severity;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();

  if p_profile_style is not null and not public.profile_style_is_valid(p_profile_style) then
    raise exception 'invalid profile style';
  end if;

  if p_tagline is not null then
    v_tag := nullif(regexp_replace(btrim(p_tagline), '\s+', ' ', 'g'), '');
    if char_length(v_tag) > 80 then
      raise exception 'tagline must be 80 characters or fewer';
    end if;
    v_sev := public.scan_text_for_blocked_phrases(v_tag);
    if v_sev = 'block' then
      raise exception 'this content contains prohibited language and cannot be posted';
    end if;
  end if;

  if p_headline_source_id is not null then
    if p_headline_source_type is null then
      raise exception 'headline review needs a source type';
    end if;
    -- approve_public_feedback only ever writes a permission row for the
    -- recipient, so owner + approved here covers both "not yours" and "not
    -- approved".
    if not exists (
      select 1 from public.public_feedback_permissions
      where owner_user_id = v_uid
        and source_type = p_headline_source_type
        and source_id = p_headline_source_id
        and approved
    ) then
      raise exception 'headline review must be one you have approved';
    end if;
  end if;

  update public.user_profiles set
    profile_style = coalesce(p_profile_style, profile_style),
    tagline = case when p_clear_tagline then null else coalesce(v_tag, tagline) end,
    headline_feedback_source_type = case when p_clear_headline then null
      else coalesce(p_headline_source_type, headline_feedback_source_type) end,
    headline_feedback_source_id = case when p_clear_headline then null
      else coalesce(p_headline_source_id, headline_feedback_source_id) end
  where user_id = v_uid;

  if v_sev = 'flag' then
    perform public.record_auto_flag('profile_bio', v_uid, v_uid, 'flag');
  end if;
end;
$$;

revoke all on function public.update_profile_card(text, boolean, jsonb, public.public_feedback_source, uuid, boolean) from public;
grant execute on function public.update_profile_card(text, boolean, jsonb, public.public_feedback_source, uuid, boolean) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. update_my_profile — add p_clear_avatar_url and an https guard.
--    Coalesce semantics mean null = keep, so clearing needs an explicit flag.
--    Drop + recreate: `create or replace` with a new signature would leave the
--    old overload in place and PostgREST would then refuse named calls as
--    ambiguous. Parameter names are unchanged so every existing caller
--    (seed-demo.mjs, verify-phase7a/8b/8c/…) keeps working.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.update_my_profile(text, text, text, text);

create function public.update_my_profile(
  p_display_name text default null,
  p_bio text default null,
  p_location_text text default null,
  p_avatar_url text default null,
  p_clear_avatar_url boolean default false
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sev public.moderation_severity;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();

  if p_avatar_url is not null and (p_avatar_url !~ '^https://' or char_length(p_avatar_url) > 1024) then
    raise exception 'avatar must be an https URL';
  end if;

  v_sev := public.scan_text_for_blocked_phrases(concat_ws(' ', p_display_name, p_bio, p_location_text));
  if v_sev = 'block' then
    raise exception 'this content contains prohibited language and cannot be posted';
  end if;

  update public.user_profiles set
    display_name  = coalesce(p_display_name, display_name),
    bio           = coalesce(p_bio, bio),
    location_text = coalesce(p_location_text, location_text),
    avatar_url    = case when p_clear_avatar_url then null else coalesce(p_avatar_url, avatar_url) end
  where user_id = v_uid;

  if v_sev = 'flag' then
    perform public.record_auto_flag('profile_bio', v_uid, v_uid, 'flag');
  end if;
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text, boolean) from public;
grant execute on function public.update_my_profile(text, text, text, text, boolean) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. get_public_profile — append tagline, profile_style and the headline
--    review (drop + recreate: return shape changes). The first twelve columns
--    are unchanged and in the same order. The headline is projected under
--    exactly the gates get_public_feedback applies to an excerpt, so the card
--    can never pin a quote the Reviews layer would refuse to show.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.get_public_profile(citext);

create function public.get_public_profile(p_username citext)
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
  searchable boolean,
  is_demo boolean,
  tagline text,
  profile_style jsonb,
  headline_stars smallint,
  headline_body text,
  headline_source text,
  headline_product_name text
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
    up.searchable_public_profile and public.plan_feature_enabled(up.plan_code, 'public_profile_indexing_enabled'),
    up.is_demo,
    up.tagline,
    up.profile_style,
    h.stars,
    h.body,
    h.source,
    h.product_name
  from public.user_profiles up
  left join lateral (
    select fs.stars::smallint as stars, fs.written_feedback as body, 'match'::text as source,
      case when a.visibility = 'public' and a.moderation_status = 'ok'
            and not (a.brand_visibility = 'hidden_until_feedback_complete'
                     and public.plan_feature_enabled(up.plan_code, 'brand_visibility_enabled'))
           then a.name end as product_name
    from public.feedback_submissions fs
    join public.assets a on a.id = fs.asset_id
    join public.public_feedback_permissions pp
      on pp.source_type = 'match_feedback' and pp.source_id = fs.id and pp.approved
    where up.headline_feedback_source_type = 'match_feedback'
      and fs.id = up.headline_feedback_source_id
      and fs.reviewee_user_id = up.user_id
      and pp.owner_user_id = up.user_id
      and up.show_feedback_excerpts
      and public.plan_feature_enabled(up.plan_code, 'public_feedback_excerpts_enabled')
      and fs.moderation_status = 'ok'
      and nullif(btrim(coalesce(fs.written_feedback, '')), '') is not null
    union all
    select r.stars, r.written_review, 'engaged_review'::text,
      case when l.moderation_status = 'ok' then l.title end
    from public.proof_lab_reviews r
    join public.proof_lab_listings l on l.id = r.listing_id
    join public.public_feedback_permissions pp
      on pp.source_type = 'engaged_review' and pp.source_id = r.id and pp.approved
    where up.headline_feedback_source_type = 'engaged_review'
      and r.id = up.headline_feedback_source_id
      and r.reviewee_user_id = up.user_id
      and pp.owner_user_id = up.user_id
      and up.show_feedback_excerpts
      and public.plan_feature_enabled(up.plan_code, 'public_feedback_excerpts_enabled')
      and r.moderation_status = 'ok'
      and nullif(btrim(coalesce(r.written_review, '')), '') is not null
    limit 1
  ) h on true
  where up.public_username = p_username
    and up.profile_public_enabled
    and up.account_status <> 'suspended'
    and up.moderation_status = 'ok';
$$;

revoke all on function public.get_public_profile(citext) from public;
grant execute on function public.get_public_profile(citext) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Review excerpts for the free plan. Clips and indexing stay paid.
--    public_plan_caps() publishes this key, so the /pricing free card now
--    shows "Publish feedback excerpts" as included — intended.
-- ═══════════════════════════════════════════════════════════════════════════

update public.plan_feature_gates
set enabled = true, updated_at = now()
where plan_code = 'sprout' and feature_key = 'public_feedback_excerpts_enabled';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. The `avatars` bucket: public read, owner-prefix write.
--    Objects live at <uid>/avatar.<ext> and are upserted, so nothing
--    accumulates. The prefix predicate (rather than `owner = auth.uid()`) is
--    what makes "cannot write under another member's id" true and testable.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');
