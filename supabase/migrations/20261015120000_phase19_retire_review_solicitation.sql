-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 19 — Retire review solicitation. The table becomes a report, not a request.
--
-- The platform never raises online reviews. `request_review_post` did the
-- opposite: it let a feedback recipient ask their reviewer to go post a public
-- review on a named external channel, drove the match lifecycle into
-- 'awaiting_post', and rendered "Post Requested" on the dashboard.
--
-- This migration removes the ask and keeps the record. Members may report that
-- an external review happened — in either direction — which is the seed data
-- for per-channel review separation. A report corroborated by the other
-- participant confirms itself with no admin action.
--
-- Safe on an empty members table; there is no production data to migrate.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 ── Drop the solicitation RPCs ────────────────────────────────────────────
drop function if exists public.request_review_post(uuid, text);
drop function if exists public.respond_review_post_request(uuid, boolean);
drop function if exists public.mark_review_posted(uuid, text);

-- 1b ── Drop the old validator first: it references the pre-rename columns and
--       would fire on the backfill below ──────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'review_post_requests') then
    execute 'drop trigger if exists trg_validate_review_post_request on public.review_post_requests';
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'external_review_reports') then
    execute 'drop trigger if exists trg_validate_review_post_request on public.external_review_reports';
  end if;
end
$$;

drop function if exists public.validate_review_post_request();

-- 2 ── Rename the table and columns to reporting semantics ───────────────────
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'review_post_requests') then
    alter table public.review_post_requests rename to external_review_reports;
    alter table public.external_review_reports rename column requester_user_id to subject_user_id;
    alter table public.external_review_reports rename column reviewer_user_id to author_user_id;
    alter table public.external_review_reports rename column requested_channel_name to channel_name;
    alter table public.external_review_reports rename column requested_at to reported_at;
  end if;
end
$$;

-- 3 ── Anchor on the match, record who reported it ───────────────────────────
alter table public.external_review_reports
  add column if not exists match_id uuid references public.matches(id) on delete cascade,
  add column if not exists reported_by_user_id uuid references public.user_profiles(user_id) on delete cascade,
  add column if not exists corroborated_by_user_id uuid references public.user_profiles(user_id) on delete set null,
  add column if not exists confirmed_at timestamptz;

update public.external_review_reports r
set match_id = fs.match_id,
    reported_by_user_id = coalesce(r.reported_by_user_id, r.subject_user_id)
from public.feedback_submissions fs
where fs.id = r.feedback_submission_id
  and r.match_id is null;

delete from public.external_review_reports where match_id is null;

alter table public.external_review_reports alter column match_id set not null;
alter table public.external_review_reports alter column reported_by_user_id set not null;
alter table public.external_review_reports alter column feedback_submission_id drop not null;
alter table public.external_review_reports drop constraint if exists review_post_requests_feedback_submission_id_key;
alter table public.external_review_reports drop column if exists responded_at;

-- One report per (match, author, channel). The second reporter corroborates it.
create unique index if not exists uq_external_review_reports_match_author_channel
  on public.external_review_reports (match_id, author_user_id, channel_name);

-- 4 ── Reporting statuses replace the negotiation statuses ───────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'external_review_report_status') then
    create type public.external_review_report_status as enum ('reported', 'confirmed', 'disputed', 'retracted');
  end if;
end
$$;

alter table public.external_review_reports alter column status drop default;
alter table public.external_review_reports
  alter column status type public.external_review_report_status
  using (case when status::text = 'posted' then 'confirmed' else 'reported' end)::public.external_review_report_status;
alter table public.external_review_reports
  alter column status set default 'reported'::public.external_review_report_status;

-- 5 ── Validator for the new semantics ───────────────────────────────────────
create or replace function public.validate_external_review_report()
returns trigger
language plpgsql
as $$
declare
  v_match public.matches%rowtype;
begin
  select * into v_match from public.matches where id = new.match_id;
  if not found then
    raise exception 'external review reports must reference a match';
  end if;

  if new.author_user_id not in (v_match.member_a_user_id, v_match.member_b_user_id)
     or new.subject_user_id not in (v_match.member_a_user_id, v_match.member_b_user_id) then
    raise exception 'both parties must be participants in the match';
  end if;

  if new.reported_by_user_id not in (v_match.member_a_user_id, v_match.member_b_user_id) then
    raise exception 'only a match participant can report an external review';
  end if;

  if nullif(btrim(coalesce(new.channel_name, '')), '') is null then
    raise exception 'channel_name is required';
  end if;

  return new;
end;
$$;

create trigger trg_validate_external_review_report
before insert or update on public.external_review_reports
for each row execute function public.validate_external_review_report();

-- 6 ── RLS: participants read, reporter corrects, writes go through the RPC ──
drop policy if exists "review_post_requests_select_participants" on public.external_review_reports;
drop policy if exists "review_post_requests_insert_requester" on public.external_review_reports;
drop policy if exists "review_post_requests_update_participants" on public.external_review_reports;
drop policy if exists "external_review_reports_select_participants" on public.external_review_reports;
drop policy if exists "external_review_reports_update_reporter" on public.external_review_reports;

create policy "external_review_reports_select_participants"
on public.external_review_reports for select to authenticated
using (auth.uid() in (subject_user_id, author_user_id) or public.is_admin());

create policy "external_review_reports_update_reporter"
on public.external_review_reports for update to authenticated
using (reported_by_user_id = auth.uid() or public.is_admin())
with check (reported_by_user_id = auth.uid() or public.is_admin());

-- 7 ── Report an external review, in either direction ────────────────────────
create or replace function public.report_external_review(
  p_match_id uuid,
  p_channel_name text,
  p_i_am_the_author boolean,
  p_posted_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_match public.matches%rowtype;
  v_other uuid;
  v_author uuid;
  v_subject uuid;
  v_existing public.external_review_reports%rowtype;
  v_id uuid;
  v_channel text := nullif(btrim(coalesce(p_channel_name, '')), '');
  v_url text := nullif(btrim(coalesce(p_posted_url, '')), '');
begin
  if v_caller is null then
    raise exception 'authentication required';
  end if;
  perform public.assert_active_caller();

  if v_channel is null then
    raise exception 'channel_name is required';
  end if;

  select * into v_match from public.matches where id = p_match_id;
  if not found then
    raise exception 'match not found';
  end if;

  if v_caller = v_match.member_a_user_id then
    v_other := v_match.member_b_user_id;
  elsif v_caller = v_match.member_b_user_id then
    v_other := v_match.member_a_user_id;
  else
    raise exception 'only match participants can report an external review';
  end if;

  if p_i_am_the_author then
    v_author := v_caller;
    v_subject := v_other;
  else
    v_author := v_other;
    v_subject := v_caller;
  end if;

  select * into v_existing
  from public.external_review_reports
  where match_id = p_match_id
    and author_user_id = v_author
    and channel_name = v_channel;

  -- The other participant reporting the same thing is corroboration, and
  -- corroborated reports confirm themselves without an admin looking.
  if found then
    update public.external_review_reports
    set posted_url = coalesce(v_url, posted_url),
        status = case
          when status in ('disputed', 'retracted') then status
          when reported_by_user_id <> v_caller then 'confirmed'::public.external_review_report_status
          else status
        end,
        corroborated_by_user_id = case
          when reported_by_user_id <> v_caller then v_caller
          else corroborated_by_user_id
        end,
        confirmed_at = case
          when reported_by_user_id <> v_caller and confirmed_at is null then now()
          else confirmed_at
        end
    where id = v_existing.id
    returning id into v_id;

    return v_id;
  end if;

  insert into public.external_review_reports (
    match_id,
    feedback_submission_id,
    subject_user_id,
    author_user_id,
    reported_by_user_id,
    channel_name,
    posted_url,
    status
  )
  values (
    p_match_id,
    (select fs.id from public.feedback_submissions fs
      where fs.match_id = p_match_id and fs.reviewer_user_id = v_author
      limit 1),
    v_subject,
    v_author,
    v_caller,
    v_channel,
    v_url,
    'reported'::public.external_review_report_status
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.retract_external_review_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'authentication required';
  end if;

  update public.external_review_reports
  set status = 'retracted'::public.external_review_report_status
  where id = p_report_id
    and reported_by_user_id = v_caller;

  if not found then
    raise exception 'only the member who reported this can retract it';
  end if;
end;
$$;

revoke all on function public.report_external_review(uuid, text, boolean, text) from public;
revoke all on function public.retract_external_review_report(uuid) from public;
grant execute on function public.report_external_review(uuid, text, boolean, text) to authenticated;
grant execute on function public.retract_external_review_report(uuid) to authenticated;

-- 8 ── A completed match is completed. It is not "awaiting a post" ───────────
-- Re-declared from 20260309140000 with one change: the terminal transition
-- when both members have submitted feedback is 'completed', not 'awaiting_post'.
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
    when v_feedback_count >= 2 then 'completed'::public.match_status
    else 'feedback_pending'::public.match_status
  end
  where id = p_match_id;

  if v_sev = 'flag' then
    perform public.record_auto_flag('feedback', v_feedback_id, v_caller_user_id, 'flag');
  end if;

  return v_feedback_id;
end;
$function$;

-- Note: match_status still carries 'awaiting_post' and 'posted'. Nothing writes
-- them any more; they are left in the enum because removing a value requires
-- recreating the type, and a dormant value costs nothing.
