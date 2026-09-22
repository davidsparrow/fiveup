# Continuation Prompt — Phase 15: match preferences + launch-readiness

Pre-launch cut chosen 2026-09-10: build the member-facing match-preferences
controls the site has promised since day one, and settle the Pricing CTA.
**Deliberately kept**: demo content on anonymous surfaces (teaser counts,
public demo profiles) — the user wants demo users visible for a while yet;
nothing upstream forces the exclusion. Also still deferred: AI Asset Builder,
Mux video feedback, the billing decision itself, moderation notifications /
appeals, verify-script dedup.

## Migration — `20260910140000_phase15_match_preferences.sql` (applied live)

The preference columns (`degrees_of_separation`,
`allow_semi_duplicate_matches`, `allow_semi_duplicate_with_free`), their
enforcement in `create_match`, and the plan gates
(`degrees_of_separation_control` with `limit_int`, `semi_duplicate_matching`
with `can_disable` / `allow_paid_free_toggle` config) all existed since the
initial schema — but no RPC could change the values, and the July hardening
revoked direct `user_profiles` writes, so members literally could not adjust
them. Added:

1. **`plan_feature_config(plan, key) → jsonb`** — config reader alongside the
   existing `plan_feature_enabled` / `plan_feature_limit` helpers.
2. **`update_match_preferences(p_degrees_of_separation, p_allow_semi_duplicate,
   p_allow_semi_duplicate_with_free)`** — coalesce-style partial update
   (`update_my_profile` pattern), `assert_active_caller`, gated per field:
   degrees requires `degrees_of_separation_control` enabled and `1..limit_int`;
   the semi-dup toggles require the gate config's `can_disable` /
   `allow_paid_free_toggle` respectively (sprout has neither).

## App changes

- **`/account/preferences`** (`src/app/account/preferences/page.jsx` +
  `src/components/fivestarz/MatchPreferencesPage.jsx`) — same pattern as
  `/account/public`: server route reads state + gates under RLS, client
  component mutates optimistically via the RPC. Degrees picker (1°/2°/3°
  with per-degree trade-off explainers, options beyond the plan limit
  disabled), semi-dup toggle, with-free toggle; locked rows show the Paid
  pill + upgrade hint (PublicSettingsPage style). Linked from `/account`.
- **PricingPage** — the mock-Stripe alert is gone: every plan CTA opens the
  beta modal (`openBeta`), per user decision 2026-09-10. The billing question
  itself stays open. The "Semi-duplicate match settings" feature row is
  restored (it is now true).
- **HowPage** — paid card and rule 4 now point at Account → Matching
  preferences; roadmap: "Semi-duplicate prefs for Paid members" and "Degrees
  of separation settings" moved to Live in Beta (In Development keeps
  Free↔Free auto-rematching and the feedback status pipeline).
- **mock-data** — Bloom card claims "Control semi-duplicate match settings"
  again (now true).
- **verify-phase14.mjs** — the "no semi-duplicate pricing row" check flipped
  to presence (Phase 15 made the row honest).

## Launch checklist note

`NEXT_PUBLIC_SITE_URL=https://proofsignals.net` is set in `.env.local` and
matches `getSiteUrl()`'s fallback — **confirm the production host env also
sets it** before launch (canonicals / sitemap / OG URLs).

## Verify

`node verify-phase15.mjs` (16 checks; HTTP part needs the dev server on
:3210): sprout locked out of all three fields with values untouched; bloom
sets 1–3° (4° rejected), flips both toggles, partial updates leave the rest
alone; suspended caller blocked; anon `/account/preferences` redirects to
login; `/pricing` has no Stripe-coming-soon copy and re-lists semi-duplicate
settings; HowPage source points at Matching preferences. Regressions:
verify-phase13 / verify-phase14 / verify-review-fixes all PASS; lint 0
errors; build clean.

## Out of scope

- Billing / Stripe (decision open; CTA honestly routes to the beta modal).
- Full feedback status pipeline; Free↔Free automated re-matching engine.
- Demo exclusion from anonymous surfaces (kept intentionally, revisit later).
- AI Asset Builder, Mux video feedback, moderation notifications/appeals,
  verify-script boilerplate dedup.
