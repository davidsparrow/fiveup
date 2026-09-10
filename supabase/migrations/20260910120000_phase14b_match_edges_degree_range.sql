-- Phase 14b: widen member_match_edges degree checks to 1–4.
--
-- Phase 14 widened matches.separation_degree_used to 1–4, but the
-- trigger-maintained member_match_edges aggregates that column into
-- min/max_separation_degree_seen, whose own inline checks still capped at 3 —
-- so the first 4° match crashed the edge-refresh trigger
-- (member_match_edges_max_separation_degree_seen_check violation, caught by
-- verify-phase14.mjs). Widen both to match.
--
-- Idempotent / safely re-runnable.

do $$
declare
  v_name text;
  v_col text;
begin
  foreach v_col in array array['min_separation_degree_seen', 'max_separation_degree_seen'] loop
    select conname into v_name
    from pg_constraint
    where conrelid = 'public.member_match_edges'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%' || v_col || '%'
      and conname <> 'member_match_edges_' || v_col || '_range';
    if v_name is not null then
      execute format('alter table public.member_match_edges drop constraint %I', v_name);
    end if;
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.member_match_edges'::regclass
        and conname = 'member_match_edges_' || v_col || '_range'
    ) then
      execute format(
        'alter table public.member_match_edges add constraint %I check (%I between 1 and 4)',
        'member_match_edges_' || v_col || '_range', v_col
      );
    end if;
  end loop;
end $$;
