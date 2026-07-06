-- Phase 6b.2: Proof Lab dual completion confirmation.
-- Both participants independently confirm a fulfilled deal completed; both →
-- 'completed'. Deals stuck with exactly one confirmation are surfaced (admin)
-- for ops follow-up. Idempotent / re-runnable.
--
-- Safe transaction note: 'completed' is added to the enum here and only ever
-- referenced inside plpgsql function bodies below (not executed at creation,
-- and no view/index/check uses it), so it is never "used" in this same
-- transaction — which is the only thing ALTER TYPE ADD VALUE disallows.

alter type public.proof_lab_request_status add value if not exists 'completed';

alter table public.proof_lab_deal_requests
  add column if not exists buyer_confirmed_at  timestamptz,
  add column if not exists seller_confirmed_at timestamptz,
  add column if not exists completed_at        timestamptz;

-- Either participant confirms a fulfilled deal; when both have, it completes.
create or replace function public.confirm_proof_lab_deal(p_deal_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_buyer uuid;
  v_status public.proof_lab_request_status;
  v_bc timestamptz;
  v_sc timestamptz;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select seller_user_id, requester_user_id, status, buyer_confirmed_at, seller_confirmed_at
    into v_seller, v_buyer, v_status, v_bc, v_sc
    from public.proof_lab_deal_requests where id = p_deal_id;
  if not found then raise exception 'deal request not found'; end if;
  if v_uid <> v_seller and v_uid <> v_buyer then raise exception 'not a participant in this deal'; end if;
  if v_status <> 'fulfilled' then raise exception 'only a fulfilled deal can be confirmed complete'; end if;

  if v_uid = v_buyer then
    v_bc := coalesce(v_bc, now());
  else
    v_sc := coalesce(v_sc, now());
  end if;

  if v_bc is not null and v_sc is not null then
    update public.proof_lab_deal_requests
      set buyer_confirmed_at = v_bc, seller_confirmed_at = v_sc,
          status = 'completed', completed_at = now()
      where id = p_deal_id;
  else
    update public.proof_lab_deal_requests
      set buyer_confirmed_at = v_bc, seller_confirmed_at = v_sc
      where id = p_deal_id;
  end if;
end;
$$;

-- Ops follow-up: fulfilled deals where the confirmation window (default 14 days
-- after fulfilled_at) has elapsed with exactly ONE side confirmed. Admin-only.
create or replace function public.proof_lab_deals_awaiting_confirmation(p_stale_days integer default 14)
returns table (
  deal_id uuid,
  listing_title text,
  seller_user_id uuid,
  requester_user_id uuid,
  fulfilled_at timestamptz,
  buyer_confirmed boolean,
  seller_confirmed boolean
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  return query
  select d.id, l.title, d.seller_user_id, d.requester_user_id, d.fulfilled_at,
         d.buyer_confirmed_at is not null, d.seller_confirmed_at is not null
  from public.proof_lab_deal_requests d
  join public.proof_lab_listings l on l.id = d.listing_id
  where d.status = 'fulfilled'
    and d.fulfilled_at < now() - make_interval(days => p_stale_days)
    and ((d.buyer_confirmed_at is not null) <> (d.seller_confirmed_at is not null))
  order by d.fulfilled_at asc;
end;
$$;

revoke all on function public.confirm_proof_lab_deal(uuid) from public;
revoke all on function public.proof_lab_deals_awaiting_confirmation(integer) from public;
grant execute on function public.confirm_proof_lab_deal(uuid) to authenticated;
grant execute on function public.proof_lab_deals_awaiting_confirmation(integer) to authenticated;
