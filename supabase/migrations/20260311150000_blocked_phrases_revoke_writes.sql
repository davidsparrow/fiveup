-- Defense-in-depth follow-up to 20260311140000_blocked_phrases_rls.sql.
--
-- RLS already neutralizes these, but the anon + authenticated roles still hold
-- Supabase's default INSERT/UPDATE/DELETE/TRUNCATE grants on blocked_phrases,
-- which they never legitimately need (all reads/writes go through the
-- SECURITY DEFINER scanner or operator SQL). Revoke them so the table's grant
-- surface matches its actual usage — one less thing standing between a future
-- accidental RLS-disable and a writable moderation blocklist.
--
-- SELECT is left to RLS (admin-only policy) rather than revoked, mirroring how
-- the rest of the schema gates reads. The table owner / postgres are
-- unaffected, so the scanner and operator curation keep working.
--
-- Idempotent / safely re-runnable.

revoke insert, update, delete, truncate on public.blocked_phrases from anon, authenticated;
