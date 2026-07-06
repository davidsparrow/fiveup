-- Phase 6b.1: Proof Lab deal lifecycle (payment-free, RPC-only writes).
-- Adds lifecycle timestamp columns + the seller/buyer transition RPCs.
-- Dual confirmation ('completed') is 6b.2; charity snapshots are 6b.3.
-- Idempotent / re-runnable.

alter table public.proof_lab_deal_requests
  add column if not exists accepted_at  timestamptz,
  add column if not exists declined_at  timestamptz,
  add column if not exists fulfilled_at timestamptz,
  add column if not exists cancelled_at timestamptz;

-- ── Lifecycle RPCs ──────────────────────────────────────────────────────
-- Seller accepts a pending request.
create or replace function public.accept_proof_lab_deal(p_deal_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.proof_lab_request_status;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select status into v_status from public.proof_lab_deal_requests
    where id = p_deal_id and seller_user_id = v_uid;
  if not found then raise exception 'deal request not found'; end if;
  if v_status <> 'pending' then raise exception 'only a pending request can be accepted'; end if;

  update public.proof_lab_deal_requests
    set status = 'accepted', accepted_at = now()
    where id = p_deal_id;
end;
$$;

-- Seller declines a pending or accepted request.
create or replace function public.decline_proof_lab_deal(p_deal_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.proof_lab_request_status;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select status into v_status from public.proof_lab_deal_requests
    where id = p_deal_id and seller_user_id = v_uid;
  if not found then raise exception 'deal request not found'; end if;
  if v_status not in ('pending', 'accepted') then
    raise exception 'this request can no longer be declined';
  end if;

  update public.proof_lab_deal_requests
    set status = 'declined', declined_at = now()
    where id = p_deal_id;
end;
$$;

-- Buyer cancels their own pending or accepted request.
create or replace function public.cancel_proof_lab_deal(p_deal_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.proof_lab_request_status;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select status into v_status from public.proof_lab_deal_requests
    where id = p_deal_id and requester_user_id = v_uid;
  if not found then raise exception 'deal request not found'; end if;
  if v_status not in ('pending', 'accepted') then
    raise exception 'this request can no longer be cancelled';
  end if;

  update public.proof_lab_deal_requests
    set status = 'cancelled', cancelled_at = now()
    where id = p_deal_id;
end;
$$;

-- Seller marks an accepted deal fulfilled (deliverables done). This opens the
-- confirmation window handled in 6b.2.
create or replace function public.mark_proof_lab_deal_fulfilled(p_deal_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.proof_lab_request_status;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select status into v_status from public.proof_lab_deal_requests
    where id = p_deal_id and seller_user_id = v_uid;
  if not found then raise exception 'deal request not found'; end if;
  if v_status <> 'accepted' then raise exception 'only an accepted deal can be marked fulfilled'; end if;

  update public.proof_lab_deal_requests
    set status = 'fulfilled', fulfilled_at = now()
    where id = p_deal_id;
end;
$$;

revoke all on function public.accept_proof_lab_deal(uuid) from public;
revoke all on function public.decline_proof_lab_deal(uuid) from public;
revoke all on function public.cancel_proof_lab_deal(uuid) from public;
revoke all on function public.mark_proof_lab_deal_fulfilled(uuid) from public;
grant execute on function public.accept_proof_lab_deal(uuid) to authenticated;
grant execute on function public.decline_proof_lab_deal(uuid) to authenticated;
grant execute on function public.cancel_proof_lab_deal(uuid) to authenticated;
grant execute on function public.mark_proof_lab_deal_fulfilled(uuid) to authenticated;
