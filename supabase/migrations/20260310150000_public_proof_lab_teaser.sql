-- Phase 8e: Public surfaces — the public Proof Lab teaser read layer.
--
-- Marketplace Phase 1→2: an anon-visible landing that *describes* the market
-- in aggregate. Individual listings stay member-gated — these RPCs return ONLY
-- counts/sums, never a listing row. Same security model as 8b/8d:
-- security-definer, granted `anon`, no raw table exposure, and Phase-7
-- suppression (listings from suspended/removed owners, or moderation-removed
-- listings, are excluded from the aggregates).
--
-- Idempotent / safely re-runnable.

-- Active listing counts per category (categories with zero active listings are
-- omitted). Ordered by volume, then the category's own sort order.
create or replace function public.list_public_proof_lab_teaser()
returns table (category text, active_listing_count integer)
language sql stable security definer set search_path = public
as $$
  select c.label, count(l.id)::integer
  from public.proof_lab_categories c
  join public.proof_lab_listings l
    on l.category_slug = c.slug
   and l.status = 'active'
   and l.moderation_status = 'ok'
  join public.user_profiles up
    on up.user_id = l.seller_user_id
   and up.account_status <> 'suspended'
   and up.moderation_status = 'ok'
  group by c.label, c.sort_order
  order by count(l.id) desc, c.sort_order;
$$;

-- Headline totals for the teaser hero: total active listings and total pledged
-- to charity (a single SUM across completed deals — never the per-seller
-- fundraiser leaderboard, which carries display names).
create or replace function public.get_public_proof_lab_stats()
returns table (total_active_listings integer, total_pledged_cents bigint)
language sql stable security definer set search_path = public
as $$
  select
    (select count(*)::integer
       from public.proof_lab_listings l
       join public.user_profiles up on up.user_id = l.seller_user_id
      where l.status = 'active' and l.moderation_status = 'ok'
        and up.account_status <> 'suspended' and up.moderation_status = 'ok'),
    (select coalesce(sum((d.deal_value_cents::bigint * d.donation_percent) / 100), 0)::bigint
       from public.proof_lab_deal_requests d
      where d.status = 'completed'
        and d.donation_percent is not null
        and d.deal_value_cents is not null);
$$;

revoke all on function public.list_public_proof_lab_teaser() from public;
revoke all on function public.get_public_proof_lab_stats() from public;
grant execute on function public.list_public_proof_lab_teaser() to anon, authenticated;
grant execute on function public.get_public_proof_lab_stats() to anon, authenticated;
