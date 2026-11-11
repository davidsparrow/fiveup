-- Revoke TRUNCATE from anon and authenticated on every public table.
--
-- TRUNCATE is the one write where RLS provides no backstop: PostgreSQL does
-- not apply row-level security to TRUNCATE at all. For every other verb the
-- grant is permissive and the policy decides — which is Supabase's intended
-- model and why `anon` holding INSERT on a dozen tables is not a bug. For
-- TRUNCATE the grant IS the only gate, and Supabase's default
-- `grant all on all tables in schema public to anon, authenticated` leaves it
-- open on every table created without an explicit revoke.
--
-- 29 of 31 tables were in that state. The two that were not —
-- `blocked_phrases` (20260311150000) and `user_profiles` (20260715120000) —
-- each spell `revoke insert, update, delete, truncate`, so the pattern was
-- already established here; phase 22 wrote `revoke insert, update, delete` on
-- `groups` and `group_members` and omitted the fourth word.
--
-- NOT remotely reachable today, and this is a defense-in-depth fix rather
-- than an incident response. Checked before writing it:
--   • `anon` and `authenticated` are NOLOGIN — only `authenticator` can open
--     a session, and it SET ROLEs per request
--   • neither holds CREATE on schema public, so the TRIGGER grant that comes
--     from the same default is not an escalation path
--   • PostgREST exposes no TRUNCATE verb
--   • there are no SECURITY INVOKER functions using dynamic EXECUTE, so
--     there is no injection surface that would inherit these grants
-- Any one of those changing would turn this from latent into live, which is
-- the argument for closing it now rather than noting it.
--
-- Nothing in the codebase, the migrations or the verify scripts issues a
-- TRUNCATE, so there is nothing to break. Restricting a privilege nobody
-- exercises is the safe direction.
--
-- Written to cover tables added later as well: the loop reads pg_class at
-- apply time rather than naming 31 tables that will be 35 by D6.

do $$
declare
  v_table text;
  v_count integer := 0;
begin
  for v_table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
    order by c.relname
  loop
    execute format('revoke truncate on public.%I from anon, authenticated', v_table);
    v_count := v_count + 1;
  end loop;

  raise notice 'revoked truncate on % table(s) from anon, authenticated', v_count;
end $$;

-- And for anything created after this migration runs. Supabase's own default
-- privileges are what granted TRUNCATE in the first place; this narrows the
-- default rather than relying on every future migration to remember the
-- fourth word.
--
-- `alter default privileges` applies per granting role, so it is set for the
-- role that owns new objects here. A table created by a different owner would
-- still arrive with the old default, which is why the loop above exists and
-- why the verify assertion matters more than this clause.
alter default privileges in schema public
  revoke truncate on tables from anon, authenticated;
