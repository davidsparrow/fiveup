-- Phase 7c: Trust & Safety — moderation actions + enforcement.
--
-- Gives admins/moderators a way to act on flags (dismiss / remove content /
-- warn / suspend / reinstate), records every action in an audit trail, hides
-- removed content from member reads, and stops suspended members from writing.
--
--   • moderation_action_type enum + moderation_actions audit table
--   • user_profiles.account_status  (active | warned | suspended)  — standing
--   • moderation_status (ok | removed) on each of the six content tables
--   • is_moderator()  — admin OR moderator (the 'moderator' app_role, added here)
--   • assert_active_caller()  — injected into every member write RPC below
--   • resolve_flag(flag_id, action, notes)  — the single admin/moderator entry
--     point; each action writes an audit row and advances the flag's status
--   • tightened SELECT policies so other members can't see removed content
--     (owners + moderators still can)
--
-- Design notes:
--   • Suspension is block-writes-first (DB-enforced, reversible); reads still
--     work and login is untouched. Full lockout is later hardening.
--   • For the four "object" content tables (assets, listings, reviews,
--     feedback) removal hides the whole row from other members. For
--     profile_bio and deal_note the row must stay (an account / a live deal),
--     so moderation_status='removed' marks the *field* as hidden — enforced at
--     render (no public read of those exists until Phase 8).
--   • Reputation aggregates (proof_lab_rating_avg, feedback_rating_avg) are NOT
--     recomputed when content is removed — removed content is hidden from
--     display, but excluding it from stored averages is a documented follow-up.
--
-- Idempotent / safely re-runnable.

-- ── 'moderator' role (added; is_moderator compares via ::text so the new value
--    is never used as an enum literal in the same transaction) ───────────────
alter type public.app_role add value if not exists 'moderator';

-- ── Enums + audit table + standing/removal columns ─────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'moderation_action_type') then
    create type public.moderation_action_type as enum
      ('dismiss', 'remove_content', 'warn_user', 'suspend_user', 'reinstate_user');
  end if;
end $$;

alter table public.user_profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'warned', 'suspended'));

-- content-removal marker on every content table
alter table public.user_profiles          add column if not exists moderation_status text not null default 'ok' check (moderation_status in ('ok', 'removed'));
alter table public.assets                  add column if not exists moderation_status text not null default 'ok' check (moderation_status in ('ok', 'removed'));
alter table public.feedback_submissions    add column if not exists moderation_status text not null default 'ok' check (moderation_status in ('ok', 'removed'));
alter table public.proof_lab_listings      add column if not exists moderation_status text not null default 'ok' check (moderation_status in ('ok', 'removed'));
alter table public.proof_lab_deal_requests add column if not exists moderation_status text not null default 'ok' check (moderation_status in ('ok', 'removed'));
alter table public.proof_lab_reviews       add column if not exists moderation_status text not null default 'ok' check (moderation_status in ('ok', 'removed'));

-- ── Helpers (defined before the policies / audit table that call them) ─────
create or replace function public.is_moderator(check_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = check_user_id
      and ur.role::text in ('admin', 'moderator')
  );
$$;

-- Raise if the caller's account is suspended. Injected at the top of every
-- member write RPC (right after its auth check).
create or replace function public.assert_active_caller()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if (select account_status from public.user_profiles where user_id = auth.uid()) = 'suspended' then
    raise exception 'your account is suspended and cannot perform this action';
  end if;
end;
$$;

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid references public.moderation_flags(id) on delete set null,
  admin_user_id uuid not null references public.user_profiles(user_id),
  action public.moderation_action_type not null,
  target_user_id uuid references public.user_profiles(user_id) on delete cascade,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_moderation_actions_flag on public.moderation_actions (flag_id);
create index if not exists idx_moderation_actions_target on public.moderation_actions (target_user_id);

alter table public.moderation_actions enable row level security;
drop policy if exists "moderation_actions_select_moderator" on public.moderation_actions;
create policy "moderation_actions_select_moderator"
on public.moderation_actions for select to authenticated using (public.is_moderator());

-- ── The moderation action dispatcher ───────────────────────────────────────
create or replace function public.resolve_flag(
  p_flag_id uuid,
  p_action public.moderation_action_type,
  p_notes text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_flag public.moderation_flags%rowtype;
  v_target uuid;
begin
  if not public.is_moderator() then raise exception 'moderator or admin only'; end if;

  select * into v_flag from public.moderation_flags where id = p_flag_id;
  if not found then raise exception 'flag not found'; end if;
  v_target := v_flag.content_owner_user_id;

  if p_action = 'dismiss' then
    update public.moderation_flags set status = 'dismissed' where id = p_flag_id;

  elsif p_action = 'remove_content' then
    case v_flag.content_type
      when 'profile_bio'       then update public.user_profiles          set moderation_status = 'removed' where user_id = v_flag.content_id;
      when 'feedback'          then update public.feedback_submissions    set moderation_status = 'removed' where id = v_flag.content_id;
      when 'asset'             then update public.assets                  set moderation_status = 'removed' where id = v_flag.content_id;
      when 'proof_lab_listing' then update public.proof_lab_listings      set moderation_status = 'removed' where id = v_flag.content_id;
      when 'deal_note'         then update public.proof_lab_deal_requests set moderation_status = 'removed' where id = v_flag.content_id;
      when 'proof_lab_review'  then update public.proof_lab_reviews       set moderation_status = 'removed' where id = v_flag.content_id;
    end case;
    update public.moderation_flags set status = 'resolved' where id = p_flag_id;

  elsif p_action = 'warn_user' then
    update public.user_profiles set account_status = 'warned' where user_id = v_target;
    update public.moderation_flags set status = 'resolved' where id = p_flag_id;

  elsif p_action = 'suspend_user' then
    update public.user_profiles set account_status = 'suspended' where user_id = v_target;
    update public.moderation_flags set status = 'resolved' where id = p_flag_id;

  elsif p_action = 'reinstate_user' then
    update public.user_profiles set account_status = 'active' where user_id = v_target;
    update public.moderation_flags set status = 'resolved' where id = p_flag_id;
  end if;

  insert into public.moderation_actions (flag_id, admin_user_id, action, target_user_id, notes)
  values (p_flag_id, v_actor, p_action, v_target, nullif(btrim(coalesce(p_notes, '')), ''));
end;
$$;

revoke all on function public.is_moderator(uuid) from public;
revoke all on function public.assert_active_caller() from public;
revoke all on function public.resolve_flag(uuid, public.moderation_action_type, text) from public;
grant execute on function public.is_moderator(uuid) to authenticated;
grant execute on function public.resolve_flag(uuid, public.moderation_action_type, text) to authenticated;

-- ── Tightened SELECT policies: other members can't see removed content;
--    owners and moderators still can ─────────────────────────────────────────
drop policy if exists "assets_select_visible" on public.assets;
create policy "assets_select_visible" on public.assets for select to authenticated
using (owner_user_id = auth.uid() or (status = 'active' and moderation_status = 'ok') or public.is_moderator());

drop policy if exists "feedback_submissions_select_participants" on public.feedback_submissions;
create policy "feedback_submissions_select_participants" on public.feedback_submissions for select to authenticated
using (auth.uid() = reviewer_user_id or (auth.uid() = reviewee_user_id and moderation_status = 'ok') or public.is_moderator());

drop policy if exists "proof_lab_listings_select_visible" on public.proof_lab_listings;
create policy "proof_lab_listings_select_visible" on public.proof_lab_listings for select to authenticated
using (seller_user_id = auth.uid() or (status = 'active' and moderation_status = 'ok') or public.is_moderator());

drop policy if exists "proof_lab_reviews_select_all" on public.proof_lab_reviews;
create policy "proof_lab_reviews_select_all" on public.proof_lab_reviews for select to authenticated
using (moderation_status = 'ok' or public.is_moderator());

-- ═══════════════════════════════════════════════════════════════════════════
-- Standing check injected into every member write RPC. Each body below is the
-- function's canonical definition with a single line added right after its auth
-- check:  perform public.assert_active_caller();
-- (generated from pg_get_functiondef — no behavioural drift).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_feedback(p_match_id uuid, p_stars integer DEFAULT NULL::integer, p_written_feedback text DEFAULT NULL::text, p_structured_feedback jsonb DEFAULT '{}'::jsonb, p_media_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.assert_active_caller();

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
$function$;

CREATE OR REPLACE FUNCTION public.create_asset(p_name text, p_public_url text, p_asset_type asset_type, p_description text DEFAULT NULL::text, p_is_client_asset boolean DEFAULT false, p_client_name text DEFAULT NULL::text, p_require_star_rating boolean DEFAULT false, p_require_star_plus_one_other boolean DEFAULT false, p_channels text[] DEFAULT '{}'::text[], p_feedback_formats feedback_format[] DEFAULT '{}'::feedback_format[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.assert_active_caller();

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
$function$;

CREATE OR REPLACE FUNCTION public.create_proof_lab_listing(p_title text, p_description text, p_category_slug text, p_retail_price_cents integer DEFAULT NULL::integer, p_member_price_cents integer DEFAULT NULL::integer, p_price_unit text DEFAULT NULL::text, p_badge text DEFAULT NULL::text, p_asset_id uuid DEFAULT NULL::uuid, p_donation_percent smallint DEFAULT NULL::smallint, p_charity_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_plan public.plan_code;
  v_max integer;
  v_active_count integer;
  v_id uuid;
  v_sev public.moderation_severity;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();
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
$function$;

CREATE OR REPLACE FUNCTION public.update_proof_lab_listing(p_listing_id uuid, p_title text, p_description text, p_category_slug text, p_retail_price_cents integer DEFAULT NULL::integer, p_member_price_cents integer DEFAULT NULL::integer, p_price_unit text DEFAULT NULL::text, p_badge text DEFAULT NULL::text, p_asset_id uuid DEFAULT NULL::uuid, p_donation_percent smallint DEFAULT NULL::smallint, p_charity_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sev public.moderation_severity;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();
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
$function$;

CREATE OR REPLACE FUNCTION public.request_proof_lab_deal(p_listing_id uuid, p_requester_email text, p_note text DEFAULT NULL::text, p_timeframe proof_lab_timeframe DEFAULT 'soon'::proof_lab_timeframe)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_status text;
  v_id uuid;
  v_sev public.moderation_severity;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();
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
$function$;

CREATE OR REPLACE FUNCTION public.create_proof_lab_review(p_deal_id uuid, p_stars smallint, p_written text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.assert_active_caller();
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
$function$;

CREATE OR REPLACE FUNCTION public.update_my_profile(p_display_name text DEFAULT NULL::text, p_bio text DEFAULT NULL::text, p_location_text text DEFAULT NULL::text, p_avatar_url text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sev public.moderation_severity;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();

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
$function$;

CREATE OR REPLACE FUNCTION public.accept_proof_lab_deal(p_deal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_status public.proof_lab_request_status;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();
  select status into v_status from public.proof_lab_deal_requests
    where id = p_deal_id and seller_user_id = v_uid;
  if not found then raise exception 'deal request not found'; end if;
  if v_status <> 'pending' then raise exception 'only a pending request can be accepted'; end if;

  update public.proof_lab_deal_requests
    set status = 'accepted', accepted_at = now()
    where id = p_deal_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.decline_proof_lab_deal(p_deal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_status public.proof_lab_request_status;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();
  select status into v_status from public.proof_lab_deal_requests
    where id = p_deal_id and seller_user_id = v_uid;
  if not found then raise exception 'deal request not found'; end if;
  if v_status not in ('pending', 'accepted') then
    raise exception 'this request can no longer be declined';
  end if;

  update public.proof_lab_deal_requests
    set status = 'declined', declined_at = now()
    where id = p_deal_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_proof_lab_deal(p_deal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_status public.proof_lab_request_status;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();
  select status into v_status from public.proof_lab_deal_requests
    where id = p_deal_id and requester_user_id = v_uid;
  if not found then raise exception 'deal request not found'; end if;
  if v_status not in ('pending', 'accepted') then
    raise exception 'this request can no longer be cancelled';
  end if;

  update public.proof_lab_deal_requests
    set status = 'cancelled', cancelled_at = now()
    where id = p_deal_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_proof_lab_deal(p_deal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_buyer uuid;
  v_status public.proof_lab_request_status;
  v_bc timestamptz;
  v_sc timestamptz;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();

  select seller_user_id, requester_user_id, status, buyer_confirmed_at, seller_confirmed_at
    into v_seller, v_buyer, v_status, v_bc, v_sc
    from public.proof_lab_deal_requests where id = p_deal_id;
  if not found then raise exception 'deal request not found'; end if;
  if v_uid <> v_seller and v_uid <> v_buyer then raise exception 'not a participant in this deal'; end if;
  if v_status <> 'fulfilled' then raise exception 'only a fulfilled deal can be confirmed complete'; end if;

  if v_uid = v_buyer then
    v_bc := coalesce(v_bc, now());
  else
    v_sc := coalesce(v_sc, now());
  end if;

  if v_bc is not null and v_sc is not null then
    update public.proof_lab_deal_requests
      set buyer_confirmed_at = v_bc, seller_confirmed_at = v_sc,
          status = 'completed', completed_at = now()
      where id = p_deal_id;
  else
    update public.proof_lab_deal_requests
      set buyer_confirmed_at = v_bc, seller_confirmed_at = v_sc
      where id = p_deal_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_proof_lab_deal_fulfilled(p_deal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_status public.proof_lab_request_status;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();
  select status into v_status from public.proof_lab_deal_requests
    where id = p_deal_id and seller_user_id = v_uid;
  if not found then raise exception 'deal request not found'; end if;
  if v_status <> 'accepted' then raise exception 'only an accepted deal can be marked fulfilled'; end if;

  update public.proof_lab_deal_requests d
    set status = 'fulfilled',
        fulfilled_at = now(),
        deal_value_cents = l.member_price_cents,
        donation_percent = l.donation_percent,
        charity_id = l.charity_id
    from public.proof_lab_listings l
    where d.id = p_deal_id and l.id = d.listing_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_proof_lab_listing_status(p_listing_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_plan public.plan_code;
  v_max integer;
  v_active_count integer;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.assert_active_caller();
  if p_status not in ('active','inactive','archived') then raise exception 'invalid status'; end if;

  if not exists (select 1 from public.proof_lab_listings where id = p_listing_id and seller_user_id = v_uid) then
    raise exception 'listing not found';
  end if;

  if p_status = 'active' then
    select plan_code into v_plan from public.user_profiles where user_id = v_uid;
    select count(*) into v_active_count
    from public.proof_lab_listings
    where seller_user_id = v_uid and status = 'active' and id <> p_listing_id;
    v_max := public.plan_feature_limit(v_plan, 'max_proof_lab_listings');
    if v_max is not null and v_active_count >= v_max then
      raise exception 'you have reached your plan''s active-listing limit (%)', v_max;
    end if;
  end if;

  update public.proof_lab_listings set status = p_status where id = p_listing_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rate_member_feedback(p_feedback_submission_id uuid, p_stars integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_user_id uuid := auth.uid();
  v_feedback public.feedback_submissions%rowtype;
  v_rating_id uuid;
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;
  perform public.assert_active_caller();

  select * into v_feedback
  from public.feedback_submissions
  where id = p_feedback_submission_id;

  if not found then
    raise exception 'feedback submission not found';
  end if;

  if v_feedback.reviewee_user_id <> v_caller_user_id then
    raise exception 'only the feedback recipient can rate the member who submitted it';
  end if;

  insert into public.member_feedback_ratings (
    feedback_submission_id,
    rater_user_id,
    rated_user_id,
    stars
  )
  values (
    p_feedback_submission_id,
    v_caller_user_id,
    v_feedback.reviewer_user_id,
    p_stars
  )
  returning id into v_rating_id;

  return v_rating_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_review_post(p_feedback_submission_id uuid, p_requested_channel_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_user_id uuid := auth.uid();
  v_feedback public.feedback_submissions%rowtype;
  v_request_id uuid;
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;
  perform public.assert_active_caller();

  if nullif(btrim(coalesce(p_requested_channel_name, '')), '') is null then
    raise exception 'requested channel is required';
  end if;

  select * into v_feedback
  from public.feedback_submissions
  where id = p_feedback_submission_id;

  if not found then
    raise exception 'feedback submission not found';
  end if;

  if v_feedback.reviewee_user_id <> v_caller_user_id then
    raise exception 'only the feedback recipient can request a public review post';
  end if;

  if not exists (
    select 1
    from public.asset_channels ac
    where ac.asset_id = v_feedback.asset_id
      and ac.channel_name = p_requested_channel_name
  ) then
    raise exception 'requested channel must belong to the reviewed asset';
  end if;

  insert into public.review_post_requests (
    feedback_submission_id,
    requester_user_id,
    reviewer_user_id,
    requested_channel_name,
    status,
    requested_at,
    responded_at,
    posted_at,
    posted_url
  )
  values (
    p_feedback_submission_id,
    v_caller_user_id,
    v_feedback.reviewer_user_id,
    p_requested_channel_name,
    'pending'::public.review_post_status,
    now(),
    null,
    null,
    null
  )
  on conflict (feedback_submission_id)
  do update set
    requester_user_id = excluded.requester_user_id,
    reviewer_user_id = excluded.reviewer_user_id,
    requested_channel_name = excluded.requested_channel_name,
    status = 'pending'::public.review_post_status,
    requested_at = now(),
    responded_at = null,
    posted_at = null,
    posted_url = null
  returning id into v_request_id;

  update public.matches
  set status = case
    when status in ('posted', 'completed') then status
    else 'awaiting_post'::public.match_status
  end
  where id = v_feedback.match_id;

  return v_request_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.respond_review_post_request(p_request_id uuid, p_accept boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_user_id uuid := auth.uid();
  v_request public.review_post_requests%rowtype;
  v_match_id uuid;
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;
  perform public.assert_active_caller();

  select * into v_request
  from public.review_post_requests
  where id = p_request_id;

  if not found then
    raise exception 'review post request not found';
  end if;

  if v_request.reviewer_user_id <> v_caller_user_id then
    raise exception 'only the requested reviewer can respond';
  end if;

  if v_request.status = 'posted' then
    raise exception 'a posted review request cannot be changed';
  end if;

  update public.review_post_requests
  set status = case when p_accept then 'accepted'::public.review_post_status else 'declined'::public.review_post_status end,
      responded_at = now()
  where id = p_request_id;

  select fs.match_id into v_match_id
  from public.feedback_submissions fs
  where fs.id = v_request.feedback_submission_id;

  update public.matches
  set status = case
    when status in ('posted', 'completed') then status
    when p_accept then 'awaiting_post'::public.match_status
    else 'completed'::public.match_status
  end
  where id = v_match_id;

  return p_request_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_review_posted(p_request_id uuid, p_posted_url text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_user_id uuid := auth.uid();
  v_request public.review_post_requests%rowtype;
  v_match_id uuid;
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;
  perform public.assert_active_caller();

  if nullif(btrim(coalesce(p_posted_url, '')), '') is null then
    raise exception 'posted_url is required';
  end if;

  select * into v_request
  from public.review_post_requests
  where id = p_request_id;

  if not found then
    raise exception 'review post request not found';
  end if;

  if v_request.reviewer_user_id <> v_caller_user_id then
    raise exception 'only the requested reviewer can mark the review as posted';
  end if;

  update public.review_post_requests
  set status = 'posted'::public.review_post_status,
      responded_at = coalesce(responded_at, now()),
      posted_at = now(),
      posted_url = p_posted_url
  where id = p_request_id;

  select fs.match_id into v_match_id
  from public.feedback_submissions fs
  where fs.id = v_request.feedback_submission_id;

  update public.matches
  set status = 'posted'::public.match_status
  where id = v_match_id;

  return p_request_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_match(p_other_user_id uuid, p_my_asset_id uuid, p_their_asset_id uuid, p_source text DEFAULT 'browse'::text, p_feedback_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_previous_match_id uuid DEFAULT NULL::uuid, p_my_blocked_channels text[] DEFAULT '{}'::text[], p_their_blocked_channels text[] DEFAULT '{}'::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;
  perform public.assert_active_caller();

  if v_caller_user_id = p_other_user_id then
    raise exception 'cannot create a match with yourself';
  end if;

  if p_source not in ('browse', 'queued') then
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

  if not exists (
    select 1
    from public.assets a
    where a.id = p_my_asset_id
      and a.owner_user_id = v_caller_user_id
      and a.status = 'active'
  ) then
    raise exception 'your selected asset must exist and be active';
  end if;

  if not exists (
    select 1
    from public.assets a
    where a.id = p_their_asset_id
      and a.owner_user_id = p_other_user_id
      and a.status = 'active'
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

  if not public.plan_feature_enabled(v_caller_profile.plan_code, 'browse_matches_per_month') then
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
    separation_degree_used
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
    coalesce(v_shortest_path_degree, least(v_caller_profile.degrees_of_separation + 1, 3))::smallint
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

  if p_source = 'browse' then
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
$function$;
