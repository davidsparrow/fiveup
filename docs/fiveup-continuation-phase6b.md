# Continuation Prompt — Phase 6b-lite: Deal Lifecycle, Dual Confirmation, Charity Pledges & Engaged-Reviewer Reviews (payment-free)

## North star

The Proof Lab is not AppSumo. AppSumo is a high-volume, one-to-many coupon firehose. We are the **opposite**: a small-scale, one-to-one, members-only deal network whose entire value is **trust**. The moat is a rule nobody else can copy cheaply:

> **A review can only be left by a member who provably engaged with the seller (or their direct team) AND their software/service — through a completed Proof Lab deal.** No bots, no drive-by ratings, no "verified purchaser" theater. If there's no completed, dual-confirmed deal between two real members, there's no review. Full stop.

That is the headline this phase delivers. Everything else (lifecycle, charity pledges, leaderboards) exists to make that engaged-reviewer signal richer and more fun.

## Stance: we are the matchmaker, not the middleman (locked)

FiveStarz **never touches the money**. Deals and payments are arranged **directly between buyer and seller, off-platform**. We take **no cut**, hold **no escrow**, run **no Stripe Connect**, and carry **no KYC / refund / dispute liability**. The Proof Lab is monetized entirely through **subscription tiers** (`proof_lab_listings_enabled` is already gated to Bloom/Flourish) — it's a paid-plan perk, not a transaction-fee business.

This supersedes the old "Phase 6b — Stripe payments" section in `docs/fiveup-continuation-phase6.md`. Stripe/Connect/escrow are **dropped**, not deferred.

## Decisions locked (resolved before starting)

- **Charity source → curated list we maintain.** A `charities` table (name + verified URL + logo) that we seed and vet; sellers pick from approved orgs; new orgs added on request. No free-text charity entry (avoids dead links / fake "charities" earning a trust badge).
- **Deal value → the listing's member price.** A completed deal's nominal value = `member_price_cents` (snapshotted at fulfillment). Donation and leaderboard math use that. We never capture real transaction amounts.
- **Donation pledge → per-listing.** The seller sets "I donate X% of this listing's deals to [charity]" on the listing, so the badge shows to **buyers before they request** — that's the marketing hook. Snapshotted onto each deal at fulfillment so history is immutable.
- **Engaged-reviewer reviews → built in this phase.** A dual-confirmed completed deal unlocks a buyer→seller on-platform review (stars + written), feeding a Proof-Lab-specific seller reputation, separate from the match-based `feedback_rating_avg`.

## Deal lifecycle (the spine everything hangs off)

```
pending ──accept──▶ accepted ──mark-fulfilled──▶ fulfilled ──both confirm──▶ completed ──▶ (review unlocked)
   │                   │                             │
 cancel(buyer)     cancel(buyer)              (confirmation window)
 decline(seller)  decline(seller)
   ▼                   ▼
cancelled          declined
```

- **`fulfilled`** = seller declares "deliverables done." It opens the confirmation window.
- **Dual confirmation** is symmetric and decoupled from fulfillment: **both** buyer and seller independently answer "did this deal complete successfully?" (`buyer_confirmed_at`, `seller_confirmed_at`). Both set → status `completed`.
- **Single-confirm flag:** a `fulfilled` deal where the confirmation window has elapsed (proposal: 14 days after `fulfilled_at`) with **exactly one** side confirmed is surfaced for **ops follow-up** ("what went wrong, can we help?"). This phase models the data so the flag is a trivial query; a dedicated admin UI is a later item (there is no admin surface in the app yet).
- Only a `completed` deal unlocks the buyer→seller review.

## Schema — new migration (`supabase/migrations/<ts>_proof_lab_lifecycle_reviews.sql`)

Write it **idempotent / re-runnable** (DO-block enum guards, `if not exists`, `drop policy if exists`, `create or replace`), same as the 6a migration. Draft — verify against live schema before applying:

```sql
-- 'completed' terminal state (safe: only referenced as a literal inside function
-- bodies here, never used in a data statement in this same transaction).
alter type public.proof_lab_request_status add value if not exists 'completed';

-- Curated charities.
create table if not exists public.charities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  logo_emoji text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Per-listing donation pledge (both null = no pledge).
alter table public.proof_lab_listings
  add column if not exists donation_percent smallint
    check (donation_percent is null or (donation_percent between 1 and 100)),
  add column if not exists charity_id uuid references public.charities(id);
-- enforce "percent set ⇔ charity set"
alter table public.proof_lab_listings
  drop constraint if exists proof_lab_listings_donation_pair_ck;
alter table public.proof_lab_listings
  add constraint proof_lab_listings_donation_pair_ck
  check ((donation_percent is null and charity_id is null)
      or (donation_percent is not null and charity_id is not null));

-- Deal lifecycle timestamps + immutable snapshots taken at fulfillment.
alter table public.proof_lab_deal_requests
  add column if not exists accepted_at        timestamptz,
  add column if not exists declined_at        timestamptz,
  add column if not exists fulfilled_at       timestamptz,
  add column if not exists cancelled_at       timestamptz,
  add column if not exists completed_at       timestamptz,
  add column if not exists buyer_confirmed_at timestamptz,
  add column if not exists seller_confirmed_at timestamptz,
  add column if not exists deal_value_cents   integer,     -- snapshot of listing member price
  add column if not exists donation_percent   smallint,    -- snapshot of listing pledge
  add column if not exists charity_id         uuid references public.charities(id);

-- Engaged-reviewer reviews: exactly one buyer→seller review per completed deal.
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

-- Proof-Lab-specific seller reputation, kept separate from match-based ratings.
alter table public.user_profiles
  add column if not exists proof_lab_rating_avg numeric(3,2) not null default 0,
  add column if not exists proof_lab_rating_count integer not null default 0;
```

**Seed** a starter charities list (curate real ones with verified links — e.g. Charity: Water, Room to Read, Girls Who Code, GiveDirectly). `on conflict do nothing`.

## RPCs (all `security definer`, RPC-only write path, grants to `authenticated`)

Extend `create_proof_lab_listing` / `update_proof_lab_listing` with `p_donation_percent smallint`, `p_charity_id uuid`; validate the charity exists and is active, percent 1–100, and the pair rule.

New lifecycle RPCs (each validates caller role + legal state transition):

- `accept_proof_lab_deal(p_deal_id)` — seller only; `pending → accepted`.
- `decline_proof_lab_deal(p_deal_id)` — seller only; `pending|accepted → declined`.
- `cancel_proof_lab_deal(p_deal_id)` — buyer only; `pending|accepted → cancelled`.
- `mark_proof_lab_deal_fulfilled(p_deal_id)` — seller only; `accepted → fulfilled`; snapshots `deal_value_cents = listing.member_price_cents`, `donation_percent`, `charity_id` from the listing onto the deal.
- `confirm_proof_lab_deal(p_deal_id)` — **either participant**; sets the caller's `*_confirmed_at`. When both are set → `status='completed'`, `completed_at=now()`. Requires status `fulfilled` (or already partially confirmed).
- `create_proof_lab_review(p_deal_id, p_stars, p_written)` — **buyer only**; requires `status='completed'`; one row per deal (unique constraint backstops it); inserts the review and recomputes the seller's `proof_lab_rating_avg/count`.
- `proof_lab_fundraiser_leaderboard(p_since timestamptz default null)` — aggregates `completed` deals with a pledge into per-seller **and** per-charity pledged totals (`Σ deal_value_cents * donation_percent/100`). Security-definer so it can aggregate across members while returning **only totals**, never private deal rows.

## RLS

- `charities` — `select` to `authenticated` (and later `anon` in Phase 8); admin-managed writes only.
- `proof_lab_reviews` — `select` to `authenticated` using `true` (reviews are reputation — visible to all members; they surface on listings/seller profiles). **No write policy** — inserts only via `create_proof_lab_review`.
- `proof_lab_deal_requests` — keep the existing participant-only select; the new columns ride along. Still **no direct write policy** (all transitions via RPCs).

## Frontend wiring

- **`data.js`** — add: `getCharities`, `listOutgoingDealRequests(userId)`, the six lifecycle/review RPC wrappers, `getProofLabReviewsForSeller`/`...ForListing`, `getFundraiserLeaderboard`. Extend `createProofLabListing`/`updateProofLabListing` payloads with `donationPercent`/`charityId`.
- **`ProofLabPage.jsx`** —
  - Listing card: render a **💚 X% to [charity]** badge when pledged; show the seller's Proof-Lab rating (avg stars + count) and an "Engaged Buyer ✓" treatment on reviews.
  - Request modal: add the **disclaimer** — *"FiveStarz introduces members; deals and payment are arranged directly between you and the seller."*
  - Optional: a listing detail/reviews view showing completed-deal reviews.
- **`DashboardPage.jsx` (listings tab)** —
  - Listing create/edit modal: add a **"Donate % to charity"** control (percent + charity `<select>` from `getCharities`).
  - **Incoming requests (seller):** Accept / Decline while pending; **Mark Fulfilled** when accepted; **Confirm Completed** in the confirmation window; show buyer's confirm state.
  - **New — Outgoing requests (buyer):** a "My Deal Requests" list showing status; **Cancel** while pending/accepted; **Confirm Completed** after fulfillment; **Leave Review** once completed (stars + written).
  - Surface the seller's **pledged-donation total** and a link to the fundraiser leaderboard.
- **Fundraiser leaderboard** — a simple read-only view/section (e.g. `/proof-lab/fundraiser` or a dashboard panel) ranking sellers/charities by pledged total. Awarding competition prizes (lifetime access, etc.) is a **manual ops** action — we provide the data, not automated prize logic.

## Verification (live, service-role script, temp users — same as prior phases)

Cover: charity-pledge validation (pair rule, percent bounds, inactive charity rejected); full lifecycle happy path (`pending→accepted→fulfilled→both confirm→completed`); every illegal transition + wrong-role attempt rejected (buyer can't accept, seller can't cancel, decline after completed rejected, etc.); snapshot immutability (edit listing price after fulfillment → deal's `deal_value_cents` unchanged); single-confirm flag query returns the right deals; **review gating** (review blocked until `completed`, only the buyer can write it, one-per-deal enforced, seller aggregate updates); leaderboard totals math; and RLS (reviews readable by all members, deal rows still participant-only, direct writes to new tables blocked). Delete temp users after.

## Explicitly out of scope (record so it isn't silently assumed)

- **Any payment processing** — no Stripe, Connect, escrow, or fee capture. Ever, under this stance.
- **Automated public-review requests** (Capterra/G2/Google etc.) — deliberately **none**. If both parties want to post a public review, they arrange it **off-platform** themselves; we build **no** automated prompt or workflow around it (at most a passive, non-triggering line of copy).
- **Actual donation collection/verification** — pledges are honor-system and displayed as intent; we don't collect, remit, or audit funds.
- **Admin follow-up UI** for single-confirm flagged deals — the data/flag is modeled here; the ops surface to action it comes with the broader admin/moderation work (Phase 7).
- **Running the fundraiser competitions** (prize awarding, rules, seasons) — leaderboard data only; the promotion itself is manual/marketing.

## Suggested sub-phase order (each independently shippable + verifiable)

1. **6b.1 — Lifecycle:** accept/decline/cancel/mark-fulfilled RPCs + seller/buyer dashboard controls + buyer's outgoing-requests view. (Makes deal requests real instead of email-only.)
2. **6b.2 — Dual confirmation + flag:** `confirm_proof_lab_deal`, `completed` state, single-confirm flag query, disclaimer copy.
3. **6b.3 — Charity pledges:** `charities` table + seed, listing pledge fields, badge, snapshots, leaderboard RPC + view.
4. **6b.4 — Engaged-reviewer reviews:** `proof_lab_reviews`, review RPC, seller Proof-Lab reputation, review display + "Engaged Buyer ✓" badge. *(The moat — worth landing last so the lifecycle it depends on is proven first.)*
