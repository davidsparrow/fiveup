# Continuation Prompt — Phase 10: Member publishing settings UI

## Why now

Phases 8–9 built the entire public-profile **backend** (visibility model, anon read layer, public pages, per-asset commentary, external links, SEO) but shipped **no member-facing UI** to drive it (flagged in [[fiveup-publishing-settings-ui-followup]] / `docs/fiveup-continuation-phase9.md` › Follow-up). Members can't currently publish a profile, choose which assets are public, or approve feedback for public display — the RPCs exist and are verified, but are unreachable from the app.

Phase 10 fills that gap with a settings page. **Pure UI over existing RPCs — no new backend.**

## Locked scope (Q&A)

- **Location:** a new route **`/account/public`** on `PageShell` + the fivestarz component system (the current `/account` is a bare-bones inline-styled page; link to the new one from it). Route is already auth-protected — `/account` is in the middleware `protectedRoutes`.
- **Pattern:** the **server route reads current state** (authed `createClient()`, RLS as the member) and passes it as initial props to a **client component** (`PublicSettingsPage`) that performs mutations via the browser client. No loading flicker; server-rendered state is HTTP-verifiable.
- **Controls (this phase):** profile publishing, asset visibility, feedback approval. **External-links management UI is deferred** (9b RPCs exist; not surfaced yet).

## Data access (confirmed)

Owner (authed) can read everything the UI needs directly under RLS:
- `user_profiles` own row (`profiles_select_authenticated using(true)`) — all `public_username` / `profile_public_enabled` / `searchable_public_profile` / `show_*` columns + `plan_code`.
- `plan_feature_gates` (`feature_gates_select_authenticated using(true)`) — build a feature map to label/disable paid toggles.
- own `assets` (owner select) — id/name/visibility/moderation_status.
- received `feedback_submissions` (reviewee + moderation_status='ok') and `proof_lab_reviews` (engaged reviews); `public_feedback_permissions` (`pfp_select_own_or_mod`) for current approval state.

RPCs the UI calls (all exist, security-definer, `assert_active_caller`): `claim_public_username`, `update_publishing_settings` (all-nullable partial update), `set_asset_visibility`, `approve_public_feedback`.

## Sub-phases

### 10a — Route + profile publishing
`/account/public/page.jsx` (server: auth, read profile row + feature map) → `PublicSettingsPage.jsx` (client). Section 1: claim `public_username` (once) → `claim_public_username`; master `profile_public_enabled`; `searchable` (disabled unless `public_profile_indexing_enabled`); `show_*` toggles (logo/location/stats free; feedback-excerpts/videos/offers paid — labeled, effect gated at read) → `update_publishing_settings`. "View public profile" link to `/u/[username]` when enabled.

### 10b — Asset visibility
List own assets with a per-asset private/member_only/public control → `set_asset_visibility`. "Public" disabled when `moderation_status <> 'ok'` (RPC rejects). Link each public asset to `/a/[slug]`.

### 10c — Feedback approval
List received match feedback + engaged reviews with an approve-for-public toggle reflecting `public_feedback_permissions.approved` → `approve_public_feedback(source_type, source_id, approved)`. Show only moderation-clean items with written content/media.

## Verification (per slice, live)

Build + an authed HTTP fetch (forged `@supabase/ssr` cookie, as in 8e) asserting the settings page renders the member's **current state** server-side (not a login redirect), plus a node harness that performs the same RPC sequence the UI issues and confirms the change is reflected in the **anon public projection** (e.g. toggle a field on → it appears via `get_public_profile`/`get_public_assets`/`get_public_feedback`; off → it disappears). `npm run build` for compile.

## Out of scope

- External-links management UI (9b RPCs shipped; deferred here).
- `set_asset_brand_visibility` UI (brand_visibility stays dormant).
- Redesign of the existing `/account` page beyond linking to the new settings route.
