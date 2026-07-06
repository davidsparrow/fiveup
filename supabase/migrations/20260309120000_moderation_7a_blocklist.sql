-- Phase 7a: Trust & Safety — blocklist + automated flagging on write.
--
-- A curated phrase list that, at write time, either REJECTS the write
-- (severity 'block') or ALLOWS-BUT-FLAGS it (severity 'flag') for human review.
-- scan_text_for_blocked_phrases() is wired into every free-text write RPC.
--
-- The moderation_flags table (and its content_type / status enums) live here
-- rather than in 7b: 7a is the first writer into it (system/auto flags), so it
-- is foundational moderation infra. RLS is admin-only-select + RPC-only-writes
-- from the start. 7b adds the member-facing report_content RPC and the
-- admin list_moderation_queue triage RPC on top of this table.
--
-- Written to be idempotent / safely re-runnable
-- (DO-block enum guards, if not exists, create or replace, drop policy if exists).

-- ── Enums ──────────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'moderation_severity') then
    create type public.moderation_severity as enum ('block', 'flag'); -- block = reject write, flag = allow + queue
  end if;
  if not exists (select 1 from pg_type where typname = 'moderation_content_type') then
    create type public.moderation_content_type as enum
      ('profile_bio', 'feedback', 'asset', 'proof_lab_listing', 'deal_note', 'proof_lab_review');
  end if;
  if not exists (select 1 from pg_type where typname = 'moderation_flag_status') then
    create type public.moderation_flag_status as enum ('pending', 'reviewing', 'resolved', 'dismissed');
  end if;
end $$;

-- ── Curated phrase list ────────────────────────────────────────────────────
create table if not exists public.blocked_phrases (
  id uuid primary key default gen_random_uuid(),
  phrase text not null unique,
  severity public.moderation_severity not null default 'flag',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Conservative starter list. Curate/extend live via the table (admins).
-- NOTE for operator: extend the 'block' set with hate slurs / explicit threats
-- for your community; the entries below are deliberately unambiguous so the
-- verification harness has stable block/flag examples.
insert into public.blocked_phrases (phrase, severity) values
  ('kill yourself',       'block'),
  ('kys',                 'block'),
  ('go die',              'block'),
  ('i will kill you',     'block'),
  ('scam',                'flag'),
  ('crypto giveaway',     'flag'),
  ('free money',          'flag'),
  ('click here',          'flag'),
  ('buy followers',       'flag'),
  ('guaranteed roi',      'flag'),
  ('nigerian prince',     'flag')
on conflict (phrase) do nothing;

-- ── Moderation flag queue (written by system auto-flags in 7a; by member
--    reports in 7b; read only by admins) ─────────────────────────────────────
create table if not exists public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  content_type public.moderation_content_type not null,
  content_id uuid not null,                     -- the row's id (profile: user_id)
  content_owner_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  reporter_user_id uuid references public.user_profiles(user_id) on delete set null, -- null = system/auto
  reason text,
  auto_severity public.moderation_severity,     -- set when system-flagged
  status public.moderation_flag_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_moderation_flags_status on public.moderation_flags (status);
create index if not exists idx_moderation_flags_content on public.moderation_flags (content_type, content_id);
create index if not exists idx_moderation_flags_owner on public.moderation_flags (content_owner_user_id);

drop trigger if exists trg_moderation_flags_updated_at on public.moderation_flags;
create trigger trg_moderation_flags_updated_at
  before update on public.moderation_flags
  for each row execute function public.set_updated_at();

-- RLS: admin-only select; no direct writes (all writes go through
-- security-definer RPCs / helpers below and in 7b).
alter table public.moderation_flags enable row level security;
drop policy if exists "moderation_flags_select_admin" on public.moderation_flags;
create policy "moderation_flags_select_admin"
on public.moderation_flags for select to authenticated
using (public.is_admin());

-- ── Scanner: returns the worst severity matched (null = clean) ──────────────
-- Word-boundary match (\y) to cut "scunthorpe"-style substring false positives;
-- phrase text is regex-escaped so stored phrases are treated literally.
create or replace function public.scan_text_for_blocked_phrases(p_text text)
returns public.moderation_severity
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_text is null or btrim(p_text) = '' then null
    when exists (
      select 1 from public.blocked_phrases bp
      where bp.active and bp.severity = 'block'
        and p_text ~* ('\y' || regexp_replace(bp.phrase, '([\\^$.|?*+()\[\]{}\-])', '\\\1', 'g') || '\y')
    ) then 'block'::public.moderation_severity
    when exists (
      select 1 from public.blocked_phrases bp
      where bp.active and bp.severity = 'flag'
        and p_text ~* ('\y' || regexp_replace(bp.phrase, '([\\^$.|?*+()\[\]{}\-])', '\\\1', 'g') || '\y')
    ) then 'flag'::public.moderation_severity
    else null
  end;
$$;

-- ── Internal helper: record a system/auto flag. NOT granted to authenticated;
--    only callable from the security-definer write RPCs (runs as definer). ───
create or replace function public.record_auto_flag(
  p_content_type public.moderation_content_type,
  p_content_id uuid,
  p_owner_user_id uuid,
  p_severity public.moderation_severity
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.moderation_flags (
    content_type, content_id, content_owner_user_id, reporter_user_id, reason, auto_severity, status
  ) values (
    p_content_type, p_content_id, p_owner_user_id, null,
    'auto-flagged: matched blocked phrase (' || p_severity::text || ')', p_severity, 'pending'
  );
end;
$$;

revoke all on function public.scan_text_for_blocked_phrases(text) from public;
revoke all on function public.record_auto_flag(public.moderation_content_type, uuid, uuid, public.moderation_severity) from public;
grant execute on function public.scan_text_for_blocked_phrases(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Wire the scanner into every free-text write RPC.
-- Pattern per RPC: scan the free-text field(s) → 'block' raises → 'flag' allows
-- the write then records an auto flag against the new row.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Profile: new update_my_profile RPC (bio was never written through an RPC;
--    this makes profile edits the sole, moderated write path) ───────────────
create or replace function public.update_my_profile(
  p_display_name text default null,
  p_bio text default null,
  p_location_text text default null,
  p_avatar_url text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sev public.moderation_severity;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  v_sev := public.scan_text_for_blocked_phrases(concat_ws(' ', p_display_name, p_bio, p_location_text));
  if v_sev = 'block' then
    raise exception 'this content contains prohibited language and cannot be posted';
  end if;

  update public.user_profiles set
    display_name  = coalesce(p_display_name, display_name),
    bio           = coalesce(p_bio, bio),
    location_text = coalesce(p_location_text, location_text),
    avatar_url    = coalesce(p_avatar_url, avatar_url)
  where user_id = v_uid;

  if v_sev = 'flag' then
    perform public.record_auto_flag('profile_bio', v_uid, v_uid, 'flag');
  end if;
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text) from public;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;

-- ── Match feedback ─────────────────────────────────────────────────────────
create or replace function public.submit_feedback(
  p_match_id uuid,
  p_stars integer default null,
  p_written_feedback text default null,
  p_structured_feedback jsonb default '{}'::jsonb,
  p_media_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_user_id uuid := auth.uid();
  v_match public.matches%rowtype;
  v_reviewee_user_id uuid;
  v_asset_id uuid;
  v_feedback_id uuid;
  v_feedback_count integer;
  v_sev public.moderation_severity;
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'match not found';
  end if;

  if v_match.status in ('cancelled', 'queued_next_month') then
    raise exception 'feedback cannot be submitted for this match status';
  end if;

  if v_caller_user_id = v_match.member_a_user_id then
    v_reviewee_user_id := v_match.member_b_user_id;
    v_asset_id := v_match.member_b_asset_id;
  elsif v_caller_user_id = v_match.member_b_user_id then
    v_reviewee_user_id := v_match.member_a_user_id;
    v_asset_id := v_match.member_a_asset_id;
  else
    raise exception 'only match participants can submit feedback';
  end if;

  v_sev := public.scan_text_for_blocked_phrases(
    concat_ws(' ', p_written_feedback, coalesce(p_structured_feedback, '{}'::jsonb)::text));
  if v_sev = 'block' then
    raise exception 'this content contains prohibited language and cannot be posted';
  end if;

  insert into public.feedback_submissions (
    match_id,
    reviewer_user_id,
    reviewee_user_id,
    asset_id,
    stars,
    written_feedback,
    structured_feedback,
    media_url
  )
  values (
    p_match_id,
    v_caller_user_id,
    v_reviewee_user_id,
    v_asset_id,
    p_stars,
    p_written_feedback,
    coalesce(p_structured_feedback, '{}'::jsonb),
    p_media_url
  )
  on conflict (match_id, reviewer_user_id)
  do update set
    stars = excluded.stars,
    written_feedback = excluded.written_feedback,
    structured_feedback = excluded.structured_feedback,
    media_url = excluded.media_url
  returning id into v_feedback_id;

  select count(*) into v_feedback_count
  from public.feedback_submissions
  where match_id = p_match_id;

  update public.matches
  set status = case
    when status in ('posted', 'completed') then status
    when v_feedback_count >= 2 then 'awaiting_post'::public.match_status
    else 'feedback_pending'::public.match_status
  end
  where id = p_match_id;

  if v_sev = 'flag' then
    perform public.record_auto_flag('feedback', v_feedback_id, v_caller_user_id, 'flag');
  end if;

  return v_feedback_id;
end;
$$;

-- ── Asset ──────────────────────────────────────────────────────────────────
create or replace function public.create_asset(
  p_name text,
  p_public_url text,
  p_asset_type public.asset_type,
  p_description text default null,
  p_is_client_asset boolean default false,
  p_client_name text default null,
  p_require_star_rating boolean default false,
  p_require_star_plus_one_other boolean default false,
  p_channels text[] default '{}'::text[],
  p_feedback_formats public.feedback_format[] default '{}'::public.feedback_format[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_user_id uuid := auth.uid();
  v_plan public.plan_code;
  v_max_assets integer;
  v_max_channels integer;
  v_current_asset_count integer;
  v_asset_id uuid;
  v_sev public.moderation_severity;
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;

  v_sev := public.scan_text_for_blocked_phrases(concat_ws(' ', p_name, p_description, p_client_name));
  if v_sev = 'block' then
    raise exception 'this content contains prohibited language and cannot be posted';
  end if;

  select plan_code into v_plan from public.user_profiles where user_id = v_caller_user_id;

  if p_is_client_asset and not public.plan_feature_enabled(v_plan, 'client_assets_enabled') then
    raise exception 'your plan does not support client assets';
  end if;

  if p_asset_type = 'advisory_skills' and not public.plan_feature_enabled(v_plan, 'advisory_assets_enabled') then
    raise exception 'your plan does not support advisory skill assets';
  end if;

  if (p_require_star_rating or p_require_star_plus_one_other)
     and not public.plan_feature_enabled(v_plan, 'require_specific_feedback_types') then
    raise exception 'your plan does not allow requiring specific feedback types';
  end if;

  select count(*) into v_current_asset_count
  from public.assets
  where owner_user_id = v_caller_user_id and status <> 'archived';

  v_max_assets := public.plan_feature_limit(v_plan, 'max_assets');
  if v_max_assets is not null and v_current_asset_count >= v_max_assets then
    raise exception 'you have reached your plan''s asset limit (%)', v_max_assets;
  end if;

  v_max_channels := public.plan_feature_limit(v_plan, 'max_channels_per_asset');
  if v_max_channels is not null and coalesce(array_length(p_channels, 1), 0) > v_max_channels then
    raise exception 'your plan allows at most % channel(s) per asset', v_max_channels;
  end if;

  insert into public.assets (
    owner_user_id, name, public_url, asset_type, description,
    is_client_asset, client_name, status, require_star_rating, require_star_plus_one_other
  ) values (
    v_caller_user_id, p_name, p_public_url, p_asset_type, p_description,
    p_is_client_asset, p_client_name, 'active', p_require_star_rating, p_require_star_plus_one_other
  )
  returning id into v_asset_id;

  insert into public.asset_channels (asset_id, channel_name)
  select v_asset_id, unnest(p_channels) where coalesce(array_length(p_channels, 1), 0) > 0;

  insert into public.asset_feedback_formats (asset_id, format)
  select v_asset_id, unnest(p_feedback_formats) where coalesce(array_length(p_feedback_formats, 1), 0) > 0;

  if v_sev = 'flag' then
    perform public.record_auto_flag('asset', v_asset_id, v_caller_user_id, 'flag');
  end if;

  return v_asset_id;
end;
$$;

-- ── Proof Lab listing (create) ─────────────────────────────────────────────
create or replace function public.create_proof_lab_listing(
  p_title text,
  p_description text,
  p_category_slug text,
  p_retail_price_cents integer default null,
  p_member_price_cents integer default null,
  p_price_unit text default null,
  p_badge text default null,
  p_asset_id uuid default null,
  p_donation_percent smallint default null,
  p_charity_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plan_code;
  v_max integer;
  v_active_count integer;
  v_id uuid;
  v_sev public.moderation_severity;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null then raise exception 'title is required'; end if;
  if nullif(btrim(coalesce(p_description, '')), '') is null then raise exception 'description is required'; end if;

  v_sev := public.scan_text_for_blocked_phrases(concat_ws(' ', p_title, p_description, p_badge));
  if v_sev = 'block' then
    raise exception 'this content contains prohibited language and cannot be posted';
  end if;

  select plan_code into v_plan from public.user_profiles where user_id = v_uid;
  if not public.plan_feature_enabled(v_plan, 'proof_lab_listings_enabled') then
    raise exception 'your plan does not include Proof Lab listings';
  end if;
  if not exists (select 1 from public.proof_lab_categories where slug = p_category_slug) then
    raise exception 'unknown category';
  end if;
  if p_asset_id is not null and not exists (
    select 1 from public.assets where id = p_asset_id and owner_user_id = v_uid
  ) then
    raise exception 'linked asset must be one you own';
  end if;

  if (p_donation_percent is null) <> (p_charity_id is null) then
    raise exception 'donation percent and charity must be set together';
  end if;
  if p_donation_percent is not null then
    if p_donation_percent < 1 or p_donation_percent > 100 then
      raise exception 'donation percent must be between 1 and 100';
    end if;
    if not exists (select 1 from public.charities where id = p_charity_id and active) then
      raise exception 'unknown or inactive charity';
    end if;
  end if;

  select count(*) into v_active_count
  from public.proof_lab_listings
  where seller_user_id = v_uid and status = 'active';
  v_max := public.plan_feature_limit(v_plan, 'max_proof_lab_listings');
  if v_max is not null and v_active_count >= v_max then
    raise exception 'you have reached your plan''s active-listing limit (%)', v_max;
  end if;

  insert into public.proof_lab_listings (
    seller_user_id, asset_id, title, description, category_slug,
    retail_price_cents, member_price_cents, price_unit, badge, status,
    donation_percent, charity_id
  ) values (
    v_uid, p_asset_id, p_title, p_description, p_category_slug,
    p_retail_price_cents, p_member_price_cents, p_price_unit, p_badge, 'active',
    p_donation_percent, p_charity_id
  ) returning id into v_id;

  if v_sev = 'flag' then
    perform public.record_auto_flag('proof_lab_listing', v_id, v_uid, 'flag');
  end if;

  return v_id;
end;
$$;

-- ── Proof Lab listing (update) ─────────────────────────────────────────────
create or replace function public.update_proof_lab_listing(
  p_listing_id uuid,
  p_title text,
  p_description text,
  p_category_slug text,
  p_retail_price_cents integer default null,
  p_member_price_cents integer default null,
  p_price_unit text default null,
  p_badge text default null,
  p_asset_id uuid default null,
  p_donation_percent smallint default null,
  p_charity_id uuid default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sev public.moderation_severity;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not exists (select 1 from public.proof_lab_listings where id = p_listing_id and seller_user_id = v_uid) then
    raise exception 'listing not found';
  end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null then raise exception 'title is required'; end if;
  if nullif(btrim(coalesce(p_description, '')), '') is null then raise exception 'description is required'; end if;

  v_sev := public.scan_text_for_blocked_phrases(concat_ws(' ', p_title, p_description, p_badge));
  if v_sev = 'block' then
    raise exception 'this content contains prohibited language and cannot be posted';
  end if;

  if not exists (select 1 from public.proof_lab_categories where slug = p_category_slug) then
    raise exception 'unknown category';
  end if;
  if p_asset_id is not null and not exists (
    select 1 from public.assets where id = p_asset_id and owner_user_id = v_uid
  ) then
    raise exception 'linked asset must be one you own';
  end if;

  if (p_donation_percent is null) <> (p_charity_id is null) then
    raise exception 'donation percent and charity must be set together';
  end if;
  if p_donation_percent is not null then
    if p_donation_percent < 1 or p_donation_percent > 100 then
      raise exception 'donation percent must be between 1 and 100';
    end if;
    if not exists (select 1 from public.charities where id = p_charity_id and active) then
      raise exception 'unknown or inactive charity';
    end if;
  end if;

  update public.proof_lab_listings set
    title = p_title,
    description = p_description,
    category_slug = p_category_slug,
    retail_price_cents = p_retail_price_cents,
    member_price_cents = p_member_price_cents,
    price_unit = p_price_unit,
    badge = p_badge,
    asset_id = p_asset_id,
    donation_percent = p_donation_percent,
    charity_id = p_charity_id
  where id = p_listing_id;

  if v_sev = 'flag' then
    perform public.record_auto_flag('proof_lab_listing', p_listing_id, v_uid, 'flag');
  end if;
end;
$$;

-- ── Proof Lab deal request note ────────────────────────────────────────────
create or replace function public.request_proof_lab_deal(
  p_listing_id uuid,
  p_requester_email text,
  p_note text default null,
  p_timeframe public.proof_lab_timeframe default 'soon'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_status text;
  v_id uuid;
  v_sev public.moderation_severity;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if nullif(btrim(coalesce(p_requester_email, '')), '') is null then
    raise exception 'contact email is required';
  end if;

  v_sev := public.scan_text_for_blocked_phrases(p_note);
  if v_sev = 'block' then
    raise exception 'this content contains prohibited language and cannot be posted';
  end if;

  select seller_user_id, status into v_seller, v_status
  from public.proof_lab_listings where id = p_listing_id;
  if not found then raise exception 'listing not found'; end if;
  if v_status <> 'active' then raise exception 'this listing is not currently available'; end if;
  if v_seller = v_uid then raise exception 'you cannot request your own listing'; end if;

  insert into public.proof_lab_deal_requests (
    listing_id, requester_user_id, seller_user_id, requester_email, note, timeframe
  ) values (
    p_listing_id, v_uid, v_seller, p_requester_email, p_note, p_timeframe
  ) returning id into v_id;

  if v_sev = 'flag' then
    perform public.record_auto_flag('deal_note', v_id, v_uid, 'flag');
  end if;

  return v_id;
end;
$$;

-- ── Engaged-reviewer review ────────────────────────────────────────────────
create or replace function public.create_proof_lab_review(
  p_deal_id uuid,
  p_stars smallint,
  p_written text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_buyer uuid;
  v_listing uuid;
  v_status public.proof_lab_request_status;
  v_id uuid;
  v_sev public.moderation_severity;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then raise exception 'stars must be between 1 and 5'; end if;

  v_sev := public.scan_text_for_blocked_phrases(p_written);
  if v_sev = 'block' then
    raise exception 'this content contains prohibited language and cannot be posted';
  end if;

  select seller_user_id, requester_user_id, listing_id, status
    into v_seller, v_buyer, v_listing, v_status
    from public.proof_lab_deal_requests where id = p_deal_id;
  if not found then raise exception 'deal request not found'; end if;
  if v_uid <> v_buyer then raise exception 'only the buyer can review this deal'; end if;
  if v_status <> 'completed' then raise exception 'you can review a deal once it is completed'; end if;

  begin
    insert into public.proof_lab_reviews (deal_request_id, listing_id, reviewer_user_id, reviewee_user_id, stars, written_review)
    values (p_deal_id, v_listing, v_buyer, v_seller, p_stars, nullif(btrim(coalesce(p_written, '')), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'you have already reviewed this deal';
  end;

  update public.user_profiles up set
    proof_lab_rating_count = (select count(*) from public.proof_lab_reviews where reviewee_user_id = v_seller),
    proof_lab_rating_avg = coalesce((select round(avg(stars), 2) from public.proof_lab_reviews where reviewee_user_id = v_seller), 0)
  where up.user_id = v_seller;

  if v_sev = 'flag' then
    perform public.record_auto_flag('proof_lab_review', v_id, v_buyer, 'flag');
  end if;

  return v_id;
end;
$$;
