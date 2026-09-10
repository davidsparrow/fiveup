# Continuation Prompt — Phase 14: outstanding follow-ups (safety, honest copy, asset JSON-LD, cleanup)

Closes the planned-but-unfinished work carried forward across phases: the
Phase-7 gap where suspended members remained matchable (logged in the Phase-13
doc), the Phase-7 documented follow-up that reputation aggregates ignored
moderation removals, the July-review deep fix for the separation-degree cap,
overstated marketing copy on /how-it-works and /pricing, the Phase-11-deferred
CreativeWork JSON-LD (unblocked by 11b's asset indexing), and two code-quality
items from the July review. Big features (AI Asset Builder, Mux video
feedback, Stripe/billing decision) were explicitly deferred to future phases.

## Migration — `20260826120000_phase14_safety_and_reputation_fixes.sql`

Every recreated function was copied from its LATEST prior body (per the house
rule): `create_match`, `eligible_match_candidates`, `get_public_asset`, the
listings policy and leaderboard from `20260715120000_review_fixes_hardening`;
`resolve_flag` and `create_proof_lab_review` from `20260309140000` (7c);
`refresh_profile_feedback_rating` from `20260307123000` (initial schema).

1. **`moderation_action_type` + `'restore_content'`** — reverses
   `remove_content` (per-table `moderation_status` back to `'ok'`) with the
   same audit row and aggregate recompute.
2. **`matches.separation_degree_used` check widened to 1–4** (constraint name
   looked up dynamically, re-added as `matches_separation_degree_used_range`).
   `create_match` now stores `least(actual, 4)` — the search window's true
   ceiling — instead of capping at 3. Existing rows stay at 3 (the actual
   degree at creation time is unrecoverable).
3. **`create_match`**: rejects a suspended target (`this member is not
   currently available for matching`) and requires `moderation_status = 'ok'`
   on both selected assets.
4. **`eligible_match_candidates`**: `candidate_base` now filters
   `up.account_status <> 'suspended'` and joins only moderation-ok assets.
   `'warned'` stays eligible (write RPCs gate only on suspension), and
   `up.moderation_status` is deliberately NOT checked — on `user_profiles` it
   means "bio removed", not a hidden account.
5. **`user_is_suspended(uuid)`** helper (mirrors `user_is_demo`); the
   `proof_lab_listings_select_visible` policy's member branch adds
   `not user_is_suspended(seller_user_id)` — suspended sellers' listings
   vanish from member browse (sellers and moderators still see them).
   `proof_lab_fundraiser_leaderboard` also excludes suspended sellers.
6. **Reputation recompute on moderation** (the 7c documented follow-up):
   - `refresh_profile_feedback_rating` only counts ratings whose underlying
     `feedback_submissions` row is `moderation_status = 'ok'` (single-row
     aggregate subquery keeps the zero-out semantics).
   - New `refresh_profile_proof_lab_rating(uuid)` (SECURITY DEFINER, no
     client grant) recomputes from moderation-ok `proof_lab_reviews`;
     `create_proof_lab_review` now calls it instead of its inline update.
   - `resolve_flag` recomputes the affected user's aggregate on
     `remove_content` / `restore_content` for `feedback` (via the rating row,
     guarded — a rating may not exist) and `proof_lab_review` content.
   - One-time backfill recomputes for users already affected by removed rows.
7. **`get_public_asset`** (drop + recreate, signature change): appends
   `updated_at` for CreativeWork `dateModified`. Grants re-issued to
   anon + authenticated.

## App changes

- **Admin console** (`src/app/admin/actions.js`, `page.jsx`): `restore_content`
  added to `VALID_ACTIONS`; the resolved tab now renders a "Restore content"
  button (pending/reviewing keep the original button row).
- **Honest marketing copy**:
  - `HowPage.jsx` — paid-members card no longer claims in-app semi-duplicate
    or separation preference toggles (enforcement is real; the settings UI is
    not); rule card 4 reworded to "system-enforced defaults, controls in
    development"; roadmap: "Match history & network graph" (zero backend)
    moved to Under Consideration, the Free↔Free semi-dup item no longer
    claims automation, and the stale "Planned (Q3 2025)" bucket is dateless.
  - `PricingPage.jsx` — "Semi-duplicate match settings" feature row deleted.
    (The mock-Stripe TODO is untouched — billing decision deferred.)
  - `mock-data.js` — Bloom plan card: "Control semi-duplicate match settings"
    → "Semi-duplicate re-matching with channel blocking".
- **CreativeWork JSON-LD** (`src/app/a/[slug]/page.jsx`): mirrors the /u
  Person pattern; emitted only when `asset.indexable` (same flag as the
  robots meta), `creator` Person only when not brand-hidden, profile URL only
  when a public username exists.
- **Cleanup** (July-review items):
  - New `src/lib/fivestarz/format.js` exports canonical `initials()`
    (null-safe, `"?"` fallback) and `colorForUser()`; the five per-page
    copies (BrowsePage, ProofLabPage, DashboardPage, DemoTourPage,
    PublicProfilePage) deleted. Accepted deltas: Dashboard `""` → `"?"`;
    DemoTour gains null-safety.
  - `PublicSettingsPage.jsx`: one generic `updateAssetField()` optimistic
    helper (set → RPC → revert-on-error, with an `onSuccess` hook for the
    visibility slug refetch); the three per-field helpers are thin wrappers.
- **`verify-phase13.mjs`** degree assertion accepts 3 (pre-Phase-14 rows) or
  4; `seed-demo.mjs` comment updated. On the next demo reseed sam↔noor
  stores 4.

## Verify

`node verify-phase14.mjs` (service role; HTTP checks auto-skip without a dev
server on :3210): degree 4 storable / 5 rejected; suspended candidates hidden
+ create_match rejects suspended targets + 'warned' stays eligible +
removed-asset candidates hidden; Proof Lab and feedback aggregates go
5/1 → 0/0 → 5/1 through remove_content/restore_content with audit rows;
suspended sellers off member listings (owner still sees) and the leaderboard;
get_public_asset returns updated_at; CreativeWork JSON-LD present only when
indexable; stale copy strings gone from /how-it-works and /pricing.
Regressions: `npm run lint` + `npm run build` clean; re-run
`verify-phase12{a,b,c}.mjs`, `verify-phase13.mjs`, `verify-review-fixes.mjs`.

## Out of scope / notes

- **Stripe / billing decision** — PricingPage's mock-Stripe TODO still
  contradicts the Phase-6b "no payment processing" stance; needs a product
  decision, deliberately untouched here.
- **AI Asset Builder** and **video feedback (Mux)** — deferred as their own
  phases (see the Phase-6 roadmap).
- **Full demo exclusion from anonymous surfaces** (teaser counts, demo
  profiles unpublished) — still deferred to public launch (Phase-13 note).
- **Verify-script boilerplate dedup** across the ~24 root .mjs files —
  explicitly out of scope.
- The listings-policy suspension filter is behavior-visible: any member
  currently browsing a suspended seller's listing loses it (intended).
