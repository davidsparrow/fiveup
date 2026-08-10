-- Phase 13 follow-up: surface the reviewed product/service name on each public
-- feedback excerpt so the profile "What members say" cards can label what was
-- actually reviewed (e.g. "Inbox Engine — Email List Course").
--
-- Adds a `product_name` column to get_public_feedback:
--   • match feedback   → the reviewed asset's name  (assets.name)
--   • engaged reviews  → the reviewed offer's title (proof_lab_listings.title)
--
-- Read-only, backward-compatible projection change. Same publishability +
-- paid-toggle gating as before; the joined name is already public context
-- (the asset/offer it references is itself a public surface).
--
-- Idempotent / safely re-runnable. The return-table shape changes, so we drop
-- and recreate (CREATE OR REPLACE cannot alter a function's OUT columns).

drop function if exists public.get_public_feedback(citext);

create or replace function public.get_public_feedback(p_username citext)
returns table (kind text, body text, stars smallint, media_url text, created_at timestamptz, source text, product_name text)
language sql stable security definer set search_path = public
as $$
  with up as (
    select * from public.user_profiles
    where public_username = p_username and profile_public_enabled
      and account_status <> 'suspended' and moderation_status = 'ok'
  )
  select 'excerpt'::text, fs.written_feedback, fs.stars::smallint, null::text, fs.submitted_at, 'match'::text, a.name
  from up
  join public.feedback_submissions fs on fs.reviewee_user_id = up.user_id
  join public.assets a on a.id = fs.asset_id
  join public.public_feedback_permissions pp on pp.source_type = 'match_feedback' and pp.source_id = fs.id and pp.approved
  where up.show_feedback_excerpts and public.plan_feature_enabled(up.plan_code, 'public_feedback_excerpts_enabled')
    and fs.moderation_status = 'ok'
    and nullif(btrim(coalesce(fs.written_feedback, '')), '') is not null
  union all
  select 'excerpt'::text, r.written_review, r.stars, null::text, r.created_at, 'engaged_review'::text, l.title
  from up
  join public.proof_lab_reviews r on r.reviewee_user_id = up.user_id
  join public.proof_lab_listings l on l.id = r.listing_id
  join public.public_feedback_permissions pp on pp.source_type = 'engaged_review' and pp.source_id = r.id and pp.approved
  where up.show_feedback_excerpts and public.plan_feature_enabled(up.plan_code, 'public_feedback_excerpts_enabled')
    and r.moderation_status = 'ok'
    and nullif(btrim(coalesce(r.written_review, '')), '') is not null
  union all
  select 'clip'::text, fs.written_feedback, fs.stars::smallint, fs.media_url, fs.submitted_at, 'match'::text, a.name
  from up
  join public.feedback_submissions fs on fs.reviewee_user_id = up.user_id
  join public.assets a on a.id = fs.asset_id
  join public.public_feedback_permissions pp on pp.source_type = 'match_feedback' and pp.source_id = fs.id and pp.approved
  where up.show_public_videos and public.plan_feature_enabled(up.plan_code, 'public_video_enabled')
    and fs.moderation_status = 'ok'
    and nullif(btrim(coalesce(fs.media_url, '')), '') is not null;
$$;

revoke all on function public.get_public_feedback(citext) from public;
grant execute on function public.get_public_feedback(citext) to anon, authenticated;
