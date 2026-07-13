-- Security fix: enable RLS on public.blocked_phrases.
--
-- The 7a moderation migration (20260309120000) enabled RLS on moderation_flags
-- but omitted it on the sibling blocked_phrases table. Supabase's default
-- grants give anon + authenticated full SELECT/INSERT/UPDATE/DELETE on public
-- tables, so with RLS off the moderation blocklist was both readable AND
-- writable by anonymous callers over PostgREST (e.g. delete a 'block' phrase to
-- defeat the scanner). Flagged by the "RLS Disabled in Public" linter.
--
-- The scanner scan_text_for_blocked_phrases() is SECURITY DEFINER, so it
-- bypasses RLS and keeps working; operator curation runs as postgres via the
-- Management API and also bypasses RLS. Enabling RLS with only an admin-read
-- policy (mirroring moderation_flags) closes anon/authenticated access to the
-- table entirely while leaving a path for a future admin UI.
--
-- Idempotent / safely re-runnable.

alter table public.blocked_phrases enable row level security;

drop policy if exists "blocked_phrases_select_admin" on public.blocked_phrases;
create policy "blocked_phrases_select_admin"
on public.blocked_phrases for select to authenticated
using (public.is_admin());
