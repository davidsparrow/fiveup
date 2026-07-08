-- Phase 9a: Public surfaces — per-asset commentary on /a/[slug].
--
-- One anon-callable projection RPC returning APPROVED written feedback tied to
-- a specific public asset. Same security model as 8b/8d: security-definer,
-- granted `anon`, no raw table rows. It reuses the recipient's existing
-- per-item approval (public_feedback_permissions) — no new approval surface —
-- and gates on the SAME asset-publishability as get_public_asset:
--   • asset visibility='public' AND moderation_status='ok'
--   • owner not suspended AND owner moderation_status='ok'
--   • the feedback row itself moderation_status='ok' AND approved by the owner
--
-- The reviewer stays anonymous (no reviewer identity returned), matching
-- get_public_feedback; the page shows a coarse "Verified member" label only.
-- All approved items are returned (newest first, no cap).
--
-- Idempotent / safely re-runnable.

create or replace function public.get_public_asset_feedback(p_slug citext)
returns table (body text, stars smallint, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select fs.written_feedback, fs.stars::smallint, fs.submitted_at
  from public.assets a
  join public.user_profiles up on up.user_id = a.owner_user_id
  join public.feedback_submissions fs
    on fs.asset_id = a.id and fs.reviewee_user_id = a.owner_user_id
  join public.public_feedback_permissions pp
    on pp.source_type = 'match_feedback' and pp.source_id = fs.id and pp.approved
  where a.public_slug = p_slug
    and a.visibility = 'public' and a.moderation_status = 'ok'
    and up.account_status <> 'suspended' and up.moderation_status = 'ok'
    and fs.moderation_status = 'ok'
    and nullif(btrim(coalesce(fs.written_feedback, '')), '') is not null
  order by fs.submitted_at desc;
$$;

revoke all on function public.get_public_asset_feedback(citext) from public;
grant execute on function public.get_public_asset_feedback(citext) to anon, authenticated;
