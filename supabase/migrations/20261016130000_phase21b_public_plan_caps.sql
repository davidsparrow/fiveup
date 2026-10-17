-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 21b — publish the cap schedule.
--
-- /pricing becomes a lander that feeds the Skool groups, and the caps on its
-- two cards have to come from `plan_feature_gates` rather than from hardcoded
-- marketing copy. Copy drifts from the database silently; a card that reads
-- the gate row cannot.
--
-- The obstacle: `feature_gates_select_authenticated` is granted `to
-- authenticated`, and almost everyone who reads a pricing page is anonymous.
--
-- Rather than widening that policy to `anon` — which would publish every
-- gate, including internal ones like `match_surface` and whatever D2 and the
-- points phase add — this is a reader over an explicit whitelist. Publishing
-- a cap is then a deliberate one-line act, and a new internal gate is private
-- by default.
--
-- That split is also the spec's own instinct about the point map: "Publish
-- it. A visible, flat schedule is both the fairness story and the
-- anti-gaming story — there is nothing to discover and nothing to optimise."
-- The same argument applies to caps. It does not apply to switches.
--
-- Only sprout and bloom are returned. flourish is retired.
--
-- Idempotent / safely re-runnable.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.public_plan_caps()
returns table (
  plan_code public.plan_code,
  feature_key text,
  enabled boolean,
  limit_int integer,
  config jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pfg.plan_code,
    pfg.feature_key,
    pfg.enabled,
    pfg.limit_int,
    pfg.config
  from public.plan_feature_gates pfg
  where pfg.plan_code in ('sprout', 'bloom')
    and pfg.feature_key in (
      -- Published today. Add a key here to put it on the cards; the pricing
      -- page renders a row only for keys that come back, so D2's three gates
      -- appear on their own once they are seeded.
      'auto_matches_per_month',
      'browse_matches_per_month',
      'max_assets',
      'max_channels_per_asset',
      'max_proof_lab_listings',
      'degrees_of_separation_control',
      'max_concurrent_matchups',
      'max_concurrent_groups',
      'feedback_groups_per_month',
      'advisory_assets_enabled',
      'client_assets_enabled',
      'require_specific_feedback_types',
      'public_profile_indexing_enabled',
      'public_feedback_excerpts_enabled'
    )
  order by pfg.feature_key, pfg.plan_code;
$$;

comment on function public.public_plan_caps() is
  'Anon-readable subset of plan_feature_gates for the /pricing lander. Whitelist of published keys only — internal switches (match_surface, and anything added later) stay private by default. See 20261016130000_phase21b_public_plan_caps.sql.';

revoke all on function public.public_plan_caps() from public;
grant execute on function public.public_plan_caps() to anon, authenticated, service_role;
