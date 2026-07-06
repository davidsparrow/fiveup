-- Phase 5a: move asset creation from raw client-side inserts into a
-- security-definer RPC that enforces plan_feature_gates quotas
-- (max_assets, max_channels_per_asset, advisory_assets_enabled,
-- client_assets_enabled, require_specific_feedback_types).

create or replace function public.create_asset(
  p_name text,
  p_public_url text,
  p_asset_type public.asset_type,
  p_description text default null,
  p_is_client_asset boolean default false,
  p_client_name text default null,
  p_require_star_rating boolean default false,
  p_require_star_plus_one_other boolean default false,
  p_channels text[] default '{}'::text[],
  p_feedback_formats public.feedback_format[] default '{}'::public.feedback_format[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_user_id uuid := auth.uid();
  v_plan public.plan_code;
  v_max_assets integer;
  v_max_channels integer;
  v_current_asset_count integer;
  v_asset_id uuid;
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;

  select plan_code into v_plan from public.user_profiles where user_id = v_caller_user_id;

  if p_is_client_asset and not public.plan_feature_enabled(v_plan, 'client_assets_enabled') then
    raise exception 'your plan does not support client assets';
  end if;

  if p_asset_type = 'advisory_skills' and not public.plan_feature_enabled(v_plan, 'advisory_assets_enabled') then
    raise exception 'your plan does not support advisory skill assets';
  end if;

  if (p_require_star_rating or p_require_star_plus_one_other)
     and not public.plan_feature_enabled(v_plan, 'require_specific_feedback_types') then
    raise exception 'your plan does not allow requiring specific feedback types';
  end if;

  select count(*) into v_current_asset_count
  from public.assets
  where owner_user_id = v_caller_user_id and status <> 'archived';

  v_max_assets := public.plan_feature_limit(v_plan, 'max_assets');
  if v_max_assets is not null and v_current_asset_count >= v_max_assets then
    raise exception 'you have reached your plan''s asset limit (%)', v_max_assets;
  end if;

  v_max_channels := public.plan_feature_limit(v_plan, 'max_channels_per_asset');
  if v_max_channels is not null and coalesce(array_length(p_channels, 1), 0) > v_max_channels then
    raise exception 'your plan allows at most % channel(s) per asset', v_max_channels;
  end if;

  insert into public.assets (
    owner_user_id, name, public_url, asset_type, description,
    is_client_asset, client_name, status, require_star_rating, require_star_plus_one_other
  ) values (
    v_caller_user_id, p_name, p_public_url, p_asset_type, p_description,
    p_is_client_asset, p_client_name, 'active', p_require_star_rating, p_require_star_plus_one_other
  )
  returning id into v_asset_id;

  insert into public.asset_channels (asset_id, channel_name)
  select v_asset_id, unnest(p_channels) where coalesce(array_length(p_channels, 1), 0) > 0;

  insert into public.asset_feedback_formats (asset_id, format)
  select v_asset_id, unnest(p_feedback_formats) where coalesce(array_length(p_feedback_formats, 1), 0) > 0;

  return v_asset_id;
end;
$$;

revoke all on function public.create_asset(text, text, public.asset_type, text, boolean, text, boolean, boolean, text[], public.feedback_format[]) from public;
grant execute on function public.create_asset(text, text, public.asset_type, text, boolean, text, boolean, boolean, text[], public.feedback_format[]) to authenticated;
