-- Phase 15: member-facing match preferences RPC.
--
-- The columns (user_profiles.degrees_of_separation, allow_semi_duplicate_
-- matches, allow_semi_duplicate_with_free) and their enforcement in
-- create_match / eligible_match_candidates have existed since the initial
-- schema, and the plan gates (degrees_of_separation_control,
-- semi_duplicate_matching with can_disable / allow_paid_free_toggle config)
-- were seeded on day one — but no RPC ever existed to change the values, and
-- the July hardening revoked direct user_profiles writes, so members
-- literally could not adjust them. This adds:
--
--   • plan_feature_config(plan, key) — jsonb config reader alongside the
--     existing plan_feature_enabled / plan_feature_limit helpers
--   • update_match_preferences(...) — coalesce-style partial update (same
--     pattern as update_my_profile), gated per field:
--       - degrees_of_separation: requires degrees_of_separation_control
--         enabled; value clamped-validated against the gate's limit_int
--       - allow_semi_duplicate_matches: requires semi_duplicate_matching
--         config can_disable = true
--       - allow_semi_duplicate_with_free: requires config
--         allow_paid_free_toggle = true
--
-- Idempotent / safely re-runnable.

create or replace function public.plan_feature_config(
  p_plan_code public.plan_code,
  p_feature_key text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select pfg.config
    from public.plan_feature_gates pfg
    where pfg.plan_code = p_plan_code
      and pfg.feature_key = p_feature_key
  ), '{}'::jsonb);
$$;

create or replace function public.update_match_preferences(
  p_degrees_of_separation smallint default null,
  p_allow_semi_duplicate boolean default null,
  p_allow_semi_duplicate_with_free boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.user_profiles%rowtype;
  v_max_degree integer;
  v_semi_config jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  perform public.assert_active_caller();

  select * into v_profile
  from public.user_profiles
  where user_id = v_uid;

  if not found then
    raise exception 'caller profile not found';
  end if;

  if p_degrees_of_separation is not null then
    if not public.plan_feature_enabled(v_profile.plan_code, 'degrees_of_separation_control') then
      raise exception 'your plan does not include degrees-of-separation control';
    end if;
    v_max_degree := coalesce(public.plan_feature_limit(v_profile.plan_code, 'degrees_of_separation_control'), 1);
    if p_degrees_of_separation < 1 or p_degrees_of_separation > v_max_degree then
      raise exception 'degrees of separation must be between 1 and %', v_max_degree;
    end if;
  end if;

  v_semi_config := public.plan_feature_config(v_profile.plan_code, 'semi_duplicate_matching');

  if p_allow_semi_duplicate is not null
     and not coalesce((v_semi_config ->> 'can_disable')::boolean, false) then
    raise exception 'your plan does not include semi-duplicate matching controls';
  end if;

  if p_allow_semi_duplicate_with_free is not null
     and not coalesce((v_semi_config ->> 'allow_paid_free_toggle')::boolean, false) then
    raise exception 'your plan does not include the semi-duplicate-with-free toggle';
  end if;

  update public.user_profiles set
    degrees_of_separation          = coalesce(p_degrees_of_separation, degrees_of_separation),
    allow_semi_duplicate_matches   = coalesce(p_allow_semi_duplicate, allow_semi_duplicate_matches),
    allow_semi_duplicate_with_free = coalesce(p_allow_semi_duplicate_with_free, allow_semi_duplicate_with_free),
    updated_at = now()
  where user_id = v_uid;
end;
$$;

revoke all on function public.plan_feature_config(public.plan_code, text) from public;
revoke all on function public.update_match_preferences(smallint, boolean, boolean) from public;
grant execute on function public.plan_feature_config(public.plan_code, text) to authenticated;
grant execute on function public.update_match_preferences(smallint, boolean, boolean) to authenticated;
