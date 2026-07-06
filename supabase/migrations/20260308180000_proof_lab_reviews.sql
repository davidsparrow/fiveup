-- Phase 6b.4: Proof Lab engaged-reviewer reviews (the moat).
-- A review can only exist for a dual-confirmed *completed* deal, written by the
-- buyer about the seller. No completed engagement → no review; bots and
-- drive-by ratings are structurally impossible. Feeds a Proof-Lab-specific
-- seller reputation kept separate from the match-based feedback rating.
-- Idempotent / re-runnable.

create table if not exists public.proof_lab_reviews (
  id uuid primary key default gen_random_uuid(),
  deal_request_id uuid not null unique references public.proof_lab_deal_requests(id) on delete cascade,
  listing_id uuid not null references public.proof_lab_listings(id) on delete cascade,
  reviewer_user_id uuid not null references public.user_profiles(user_id) on delete cascade, -- buyer
  reviewee_user_id uuid not null references public.user_profiles(user_id) on delete cascade, -- seller
  stars smallint not null check (stars between 1 and 5),
  written_review text,
  created_at timestamptz not null default now()
);
create index if not exists idx_proof_lab_reviews_reviewee on public.proof_lab_reviews (reviewee_user_id);
create index if not exists idx_proof_lab_reviews_listing on public.proof_lab_reviews (listing_id);

-- Proof-Lab-specific seller reputation (separate from feedback_rating_avg).
alter table public.user_profiles
  add column if not exists proof_lab_rating_avg numeric(3,2) not null default 0,
  add column if not exists proof_lab_rating_count integer not null default 0;

-- ── RLS: reviews are reputation — readable by all members; RPC-only writes ─
alter table public.proof_lab_reviews enable row level security;
drop policy if exists "proof_lab_reviews_select_all" on public.proof_lab_reviews;
create policy "proof_lab_reviews_select_all"
on public.proof_lab_reviews for select to authenticated using (true);

-- Buyer leaves one review on a completed deal; recomputes seller reputation.
create or replace function public.create_proof_lab_review(
  p_deal_id uuid,
  p_stars smallint,
  p_written text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_buyer uuid;
  v_listing uuid;
  v_status public.proof_lab_request_status;
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then raise exception 'stars must be between 1 and 5'; end if;

  select seller_user_id, requester_user_id, listing_id, status
    into v_seller, v_buyer, v_listing, v_status
    from public.proof_lab_deal_requests where id = p_deal_id;
  if not found then raise exception 'deal request not found'; end if;
  if v_uid <> v_buyer then raise exception 'only the buyer can review this deal'; end if;
  if v_status <> 'completed' then raise exception 'you can review a deal once it is completed'; end if;

  begin
    insert into public.proof_lab_reviews (deal_request_id, listing_id, reviewer_user_id, reviewee_user_id, stars, written_review)
    values (p_deal_id, v_listing, v_buyer, v_seller, p_stars, nullif(btrim(coalesce(p_written, '')), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'you have already reviewed this deal';
  end;

  update public.user_profiles up set
    proof_lab_rating_count = (select count(*) from public.proof_lab_reviews where reviewee_user_id = v_seller),
    proof_lab_rating_avg = coalesce((select round(avg(stars), 2) from public.proof_lab_reviews where reviewee_user_id = v_seller), 0)
  where up.user_id = v_seller;

  return v_id;
end;
$$;

revoke all on function public.create_proof_lab_review(uuid, smallint, text) from public;
grant execute on function public.create_proof_lab_review(uuid, smallint, text) to authenticated;
