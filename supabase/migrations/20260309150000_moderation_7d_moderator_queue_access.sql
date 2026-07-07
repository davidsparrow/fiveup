-- Phase 7d: admin moderation console.
--
-- The console is gated on is_moderator (admin OR moderator), but the queue read
-- from 7b was is_admin-only — a moderator would get in and then be refused the
-- queue. Loosen the queue read (and the moderation_flags select policy) to
-- is_moderator so both roles can triage. resolve_flag already accepts either
-- (7c); higher-risk ops (proof_lab_deals_awaiting_confirmation) stay is_admin.
--
-- Idempotent / re-runnable. Body is identical to 7b's list_moderation_queue
-- except the guard: is_admin() -> is_moderator().

create or replace function public.list_moderation_queue(
  p_status public.moderation_flag_status default 'pending'
)
returns table (
  id uuid,
  content_type public.moderation_content_type,
  content_id uuid,
  content_owner_user_id uuid,
  owner_display_name text,
  reporter_user_id uuid,
  reporter_display_name text,
  reason text,
  auto_severity public.moderation_severity,
  status public.moderation_flag_status,
  created_at timestamptz,
  snippet text
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_moderator() then raise exception 'moderator or admin only'; end if;

  return query
  select
    f.id,
    f.content_type,
    f.content_id,
    f.content_owner_user_id,
    owner.display_name,
    f.reporter_user_id,
    rep.display_name,
    f.reason,
    f.auto_severity,
    f.status,
    f.created_at,
    left(btrim(coalesce(
      case f.content_type
        when 'profile_bio'       then (select concat_ws(' — ', up.display_name, up.bio) from public.user_profiles up where up.user_id = f.content_id)
        when 'feedback'          then (select concat_ws(' ', fs.written_feedback, nullif(fs.structured_feedback::text, '{}')) from public.feedback_submissions fs where fs.id = f.content_id)
        when 'asset'             then (select concat_ws(' — ', a.name, a.description) from public.assets a where a.id = f.content_id)
        when 'proof_lab_listing' then (select concat_ws(' — ', l.title, l.description) from public.proof_lab_listings l where l.id = f.content_id)
        when 'deal_note'         then (select dr.note from public.proof_lab_deal_requests dr where dr.id = f.content_id)
        when 'proof_lab_review'  then (select r.written_review from public.proof_lab_reviews r where r.id = f.content_id)
      end, '')), 500) as snippet
  from public.moderation_flags f
  left join public.user_profiles owner on owner.user_id = f.content_owner_user_id
  left join public.user_profiles rep on rep.user_id = f.reporter_user_id
  where p_status is null or f.status = p_status
  order by f.created_at desc;
end;
$$;

-- Match the queue's access on direct table reads too (moderators use the RPC,
-- which bypasses RLS, but keep the policy consistent).
drop policy if exists "moderation_flags_select_admin" on public.moderation_flags;
create policy "moderation_flags_select_moderator"
on public.moderation_flags for select to authenticated
using (public.is_moderator());
