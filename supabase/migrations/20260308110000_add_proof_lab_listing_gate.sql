insert into public.plan_feature_gates (plan_code, feature_key, enabled, limit_int, description, config)
values
  ('sprout', 'proof_lab_listings_enabled', false, null, 'Whether members can create Proof Lab marketplace listings', '{}'::jsonb),
  ('bloom', 'proof_lab_listings_enabled', true, null, 'Whether members can create Proof Lab marketplace listings', '{}'::jsonb),
  ('flourish', 'proof_lab_listings_enabled', true, null, 'Whether members can create Proof Lab marketplace listings', '{}'::jsonb)
on conflict (plan_code, feature_key)
do update set
  enabled = excluded.enabled,
  limit_int = excluded.limit_int,
  description = excluded.description,
  config = excluded.config,
  updated_at = now();