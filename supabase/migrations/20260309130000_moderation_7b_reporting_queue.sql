-- Phase 7b: Trust & Safety — member reporting + admin moderation queue.
--
-- Builds on 7a's moderation_flags table (admin-only select, RPC-only writes):
--   • report_content()      — any member reports a piece of content; the owner
--                             is resolved server-side from the content itself,
--                             and a repeat report by the same reporter on the
--                             same content is deduped (returns the existing flag).
--   • list_moderation_queue() — admin-only triage: flags joined to a rendered
--                             snippet of the offending text (polymorphic across
--                             all six content types) + owner/reporter names, so
--                             admins triage without six client queries.
--
-- Member reports leave auto_severity null (only system auto-flags set it).
-- No member-facing view of report status in 7b (locked decision) — the queue
-- stays admin-only via the RLS already on moderation_flags.
--
-- Idempotent / safely re-runnable (create or replace).

-- ── Member reporting ───────────────────────────────────────────────────────
create or replace function public.report_content(
  p_content_type public.moderation_content_type,
  p_content_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_existing uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  -- Resolve the content owner from the content itself (never trust a client).
  v_owner := case p_content_type
    when 'profile_bio'      then (select user_id           from public.user_profiles        where user_id = p_content_id)
    when 'feedback'         then (select reviewer_user_id  from public.feedback_submissions  where id = p_content_id)
    when 'asset'            then (select owner_user_id      from public.assets               where id = p_content_id)
    when 'proof_lab_listing' then (select seller_user_id    from public.proof_lab_listings   where id = p_content_id)
    when 'deal_note'        then (select requester_user_id from public.proof_lab_deal_requests where id = p_content_id)
    when 'proof_lab_review' then (select reviewer_user_id  from public.proof_lab_reviews     where id = p_content_id)
  end;
  if v_owner is null then raise exception 'content not found'; end if;

  if v_owner = v_uid then raise exception 'you cannot report your own content'; end if;

  -- Dedupe: one open/standing report per (reporter, content). Repeat reports
  -- return the existing flag rather than piling up duplicates in the queue.
  select id into v_existing
  from public.moderation_flags
  where content_type = p_content_type
    and content_id = p_content_id
    and reporter_user_id = v_uid
  limit 1;
  if v_existing is not null then return v_existing; end if;

  insert into public.moderation_flags (
    content_type, content_id, content_owner_user_id, reporter_user_id, reason, status
  ) values (
    p_content_type, p_content_id, v_owner, v_uid,
    nullif(btrim(coalesce(p_reason, '')), ''), 'pending'
  ) returning id into v_id;

  return v_id;
end;
$$;

-- ── Admin triage queue (flags + rendered offending snippet) ────────────────
-- p_status null → all statuses; defaults to the pending backlog.
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
  if not public.is_admin() then raise exception 'admin only'; end if;

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

revoke all on function public.report_content(public.moderation_content_type, uuid, text) from public;
revoke all on function public.list_moderation_queue(public.moderation_flag_status) from public;
grant execute on function public.report_content(public.moderation_content_type, uuid, text) to authenticated;
grant execute on function public.list_moderation_queue(public.moderation_flag_status) to authenticated;
