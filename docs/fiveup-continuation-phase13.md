# Continuation Prompt — Phase 13: demo/matching hardening

Fixes the three pre-existing bugs surfaced by the Phase 12 demo seeding, plus
the deferred `is_demo` follow-up. Locked decisions (via Q&A): graph-test
fixture users **deleted** from the live DB (the seed SQL can recreate them for
tests); demo members excluded from **member surfaces only** — anonymous
marketing surfaces (public pages, Proof Lab teaser) intentionally keep demo
content during the beta so pre-signup surfaces don't look dead. Flip to full
exclusion at public launch if desired.

## Migration — `20260311120000_phase13_demo_and_match_fixes.sql` (applied live)

1. **`user_profiles.is_demo boolean not null default false`** — set by
   `seed-demo.mjs` for the demo cast (and by `capture-demo-shots.mjs` for its
   temp browse visitor, which needs to see the cast).
2. **`create_match` recreated** (from the 20260308113000 body) with two changes:
   - **4°-separation crash fixed**: the stored `separation_degree_used` is now
     `least(actual_degree, 3)` — previously the RPC stored the actual shortest
     path (up to 4, legitimately found within the preference search window)
     while the column check allows 1–3, so any pair at exactly 4° crashed.
     The demo web's sam↔noor pair (a 5-cycle closure at 4°) now seeds through
     the real RPC; the seeder's service-role fallback was removed.
   - **Demo/real matching wall**: raises `demo accounts can only match with
     other demo accounts` when `caller.is_demo <> other.is_demo`.
3. **`eligible_match_candidates` recreated** with
   `and (up.is_demo = false or v_caller_profile.is_demo)` — demo members are
   invisible in real members' /browse; demo callers (and the screenshot
   tooling) still see them.

## App changes

- **`listProofLabListings` (`src/lib/fivestarz/data.js`)**: resolves the
  viewer's own `is_demo`, joins seller with `!inner`, and filters
  `seller.is_demo = false` for real viewers. Demo listings stay visible to
  demo viewers (screenshot capture) and in the anon teaser (security-definer
  RPCs, unchanged).
- **Asset wizard scroll (`AssetPage.jsx`)**: `useEffect` on `step` resets
  `document.body.scrollTop` (the body is the scroll container — a plain
  `window.scrollTo` is a no-op in this layout) so steps 2–4 open at the top.
- **`seed-demo.mjs`**: sets `is_demo: true` on the cast; 4°-fallback removed.
- **`capture-demo-shots.mjs`**: temp browse visitor now `is_demo: true`.

## One-off live-DB cleanup (done, not in a migration)

Deleted the nine graph-test fixture users
(`00000000-0000-0000-0000-0000000001{01..09}`, `*.seed+graph@fiveup.test`,
"… Seed" display names) from the live DB via the Management API and ran
`refresh_all_member_match_edges()`. They had been seeded by
`supabase/tests/graph_matching_seed.sql` and were visible in real members'
/browse. The seed SQL remains for future graph smoke tests (re-seed +
re-delete around test runs).

## Verify — `verify-phase13.mjs` (12 checks, all passing)

is_demo on the whole cast; the 4° match exists via RPC with stored degree 3;
real→demo `create_match` blocked; real member sees zero demo candidates and
zero fixtures, demo caller still sees the cast; real member marketplace hides
demo listings while a demo viewer sees ≥3; anon teaser still counts demo
listings and `/u/demo-maya` still renders; zero "* Seed" profiles remain.
Wizard scroll verified via Playwright (step 2 opens with `scrollTop = 0`,
wizard hero visible). Full regression: verify-phase12{a,b,c} + 13 = 62/62.

## Out of scope / notes

- Full demo exclusion from anonymous surfaces (teaser counts, public pages) —
  revisit at public launch; it's one WHERE clause per teaser RPC plus turning
  off the demo profiles' publishing toggles.
- `eligible_match_candidates` still doesn't filter suspended/moderated users
  (pre-existing Phase-7 gap, noticed while editing — worth a look later).
