# Continuation Prompt — Phase 11: brand_visibility reveal + asset indexing

The two remaining deferred threads from Phases 8–9. Both extend the public asset
page `/a/[slug]` and its settings controls. Same rhythm: lock decisions (done
via Q&A), build sub-phase by sub-phase, apply each migration live, verify with a
real anon HTTP fetch.

## 11a — brand_visibility enforcement (owner-controlled reveal)

`brand_visibility` (`visible | hidden_until_feedback_complete`, per-asset, paid
`brand_visibility_enabled`) was modeled in 8a and kept dormant through 8d/9a.
Enforce it now with an **owner-controlled** reveal (locked): identity stays
hidden while the asset is `hidden_until_feedback_complete`, and the owner reveals
by switching it back to `visible`. No new column — the existing
`set_asset_brand_visibility` RPC is the reveal control.

- **`get_public_asset` (drop + recreate):** when `brand_visibility =
  'hidden_until_feedback_complete'` AND the owner has `brand_visibility_enabled`
  (paid re-check against current plan), return `owner_display_name = null`,
  `owner_username = null`, and a new `owner_hidden = true`. Otherwise unchanged.
- **`PublicAssetPage`:** when identity is hidden, show no attribution (a subtle
  "Shared anonymously" note); the OG image already derives `by …` from the same
  projection, so it hides too.
- **Settings UI (`/account/public` asset section):** a per-asset "Hide my
  identity until I reveal it" control → `set_asset_brand_visibility`, disabled +
  labeled when the plan lacks `brand_visibility_enabled`.

**Verify:** anon `/a/<slug>` with brand hidden → 200, asset renders, **no owner
name/handle/link**, `owner_hidden` set; owner reveals → identity returns; paid
downgrade → hiding stops applying (identity shows).

## 11b — asset-page indexing (per-asset opt-in, paid-gated)

Make public asset pages search-discoverable (locked: per-asset opt-in, gated by
the owner's profile-indexing paid feature). Asset/profile visibility stay
independent (8d) — the gate reuses the paid **feature**, not the profile's own
searchable state.

- **Migration:** `assets.searchable_public boolean not null default false`; RPC
  `set_asset_searchable(p_asset_id, p_value)` (owner-only, `assert_active_caller`,
  blocks `true` when the plan lacks `public_profile_indexing_enabled`).
- **`get_public_asset` (recreate again):** add `indexable = searchable_public
  AND plan_feature_enabled(owner plan, 'public_profile_indexing_enabled')`.
- **Route `generateMetadata`:** `robots.index = asset.indexable` (was always
  false); canonical unchanged.
- **Sitemap:** new anon RPC `list_searchable_assets()` → `(public_slug,
  updated_at)` for public + clean + owner-ok + `searchable_public` + owner paid;
  add these to `app/sitemap.js`.
- **Settings UI:** per-asset "Searchable" toggle (public assets only), gated by
  `public_profile_indexing_enabled`.

**Verify:** opted-in asset under a paid owner → `/a/<slug>` indexable (no
noindex) + present in `/sitemap.xml`; non-opted-in or free-plan owner → still
noindex + absent from sitemap; toggling off removes it.

## Out of scope

- Auto-reveal-by-threshold for brand_visibility (owner-controlled chosen).
- Indexing assets whose owner lacks the paid feature (gate reuse chosen).
- JSON-LD `CreativeWork` on assets — can follow once assets are indexable.
