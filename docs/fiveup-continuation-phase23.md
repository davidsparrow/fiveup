# Continuation Prompt — Phase 23: profile cards shipped; migration awaits applying

Phase 23 rebuilt the public member profile at `/u/<handle>` as a **profile
card**: one phone viewport, no page scroll, four tab layers (Card · Reviews ·
About · Links), a member-styled photo, a tagline, an optional pinned
"headline" review, and **stars everywhere**. It is for every plan, free
included. The code is on branch `claude/profsignals-member-profiles-3x2mbs`
(this phase did not use the `claude-phase-NN` name — the branch was fixed by
the session that built it).

**The migration has not been applied and the verify script has not been run
against the live database.** The build session had no `.env.local`, no
`SUPABASE_SERVICE_ROLE_KEY` and no `SUPABASE_PERSONAL_ACCESS_TOKEN`, and the
container could not reach the Supabase host at all. So the first job of the
next session is in "Start here".

## Start here

1. Apply `supabase/migrations/20261027120000_phase23_profile_card.sql` via
   the Management API (one request; it adds no enum values). Expect `[]`.
2. `node verify-phase23.mjs` — must be green. It fabricates a free owner, a
   reviewer and a buyer, and covers the gate flip, the style whitelist, the
   headline-review ownership rules, the avatar bucket, and the static
   JS↔SQL drift check.
3. Re-run `verify-phase8b`, `verify-phase8c`, `verify-phase7a`,
   `verify-phase21b`, `verify-phase20`, `verify-phaseA`. 8b/8c drive
   `get_public_profile` and `update_my_profile`, whose signatures changed.
4. Open `/u/demo-maya` on a phone. Then `/account/profile` as a member,
   upload a photo, pick a frame, save, reload the card.

Until step 1 runs, the deployed card still works: `get_public_profile` simply
returns no `profile_style`/`tagline`/headline columns, the renderer
normalizes `undefined` to the default style, and the editor's save fails with
"function update_profile_card does not exist".

## What shipped

| Piece | Where |
| --- | --- |
| Style contract (closed whitelist, `normalizeStyle`, `isValidStyle`, `resolveStyle`) | `src/components/fivestarz/profile-card/cardStyle.js` — pure, no imports |
| The card | `profile-card/ProfileCard.jsx`, `TabStrip.jsx`, `FramedPhoto.jsx`, `StarRating.jsx`, `useSwipe.js`, `layers/{Card,Reviews,About,Links}Layer.jsx`; `src/hooks/useReducedMotion.js` |
| Route | `src/app/u/[username]/page.jsx` renders the card inside `<PageShell footer={false}>`; `PublicProfilePage.jsx` is deleted |
| Editor | `src/app/account/profile/page.jsx` → `profile-card/ProfileCardEditor.jsx` (live phone-frame preview, one atomic **Save card**) |
| Photo upload | `src/lib/fivestarz/avatar-upload.js` — 512px square, PNG kept when the source has alpha, else JPEG; `avatars/<uid>/avatar.<ext>` upserted; URL carries `?v=` |
| Share image | `src/app/u/[username]/opengraph-image.jsx` draws the framed photo, background and star average from `resolveStyle` |
| Links in | `/account` ("Design your profile card →"), `/account/public` beside the handle, the Dashboard's "Edit Profile" button |
| Shell | `PageShell` gained `footer` (default `true`); `NAV_HEIGHT = 64` now lives in `theme.js` and is read by `SiteNav`, `DemoBanner` and the card |
| Migration | `20261027120000_phase23_profile_card.sql` |
| Verification | `verify-phase23.mjs` |

### The migration, in order

1. `profile_style_is_valid(jsonb)` — immutable validator, the SQL twin of
   `cardStyle.js`. Object only, ≤ 1500 chars, only the 14 known keys, every
   value a JSON string from that key's list.
2. `user_profiles` gains `profile_style jsonb not null default '{}'` (CHECK
   on the validator), `tagline text` (≤ 80 chars, no newlines),
   `headline_feedback_source_type public.public_feedback_source` +
   `headline_feedback_source_id uuid` — paired (both null or both set) and a
   **composite FK to `public_feedback_permissions (source_type, source_id)`**
   with `on delete set null`, which that table's existing `unique` makes
   legal. `user_profiles` has no append-only trigger, so the Phase-21
   `FOR EACH STATEMENT` trap does not apply.
3. `update_profile_card(p_tagline, p_clear_tagline, p_profile_style,
   p_headline_source_type, p_headline_source_id, p_clear_headline)` — the
   only member writer for the three new fields. Style is validated and
   replaced whole; tagline is trimmed/collapsed, blocklist-scanned
   (`profile_bio` content type reused, no enum change); the headline must
   be a `public_feedback_permissions` row with `owner_user_id = auth.uid()
   and approved`.
4. `update_my_profile` — **dropped and recreated** with the same four
   parameter names plus `p_clear_avatar_url boolean default false`;
   `p_avatar_url` must be `https://` and ≤ 1024 chars. A `create or replace`
   with a new signature would have left an ambiguous overload for PostgREST.
   `seed-demo.mjs` and every older verify script keep working.
5. `get_public_profile` — dropped and recreated. The twelve original columns
   are unchanged and first; then `tagline, profile_style, headline_stars,
   headline_body, headline_source, headline_product_name`. The headline is a
   `left join lateral` under **exactly** the gates `get_public_feedback`
   applies (approved, owner match, `moderation_status = 'ok'`, non-blank,
   `show_feedback_excerpts`, the plan gate, brand-visibility on the product
   name), so un-approving the pinned review hides it at read time.
6. `plan_feature_gates`: `('sprout','public_feedback_excerpts_enabled')` →
   `true`. Clips (`public_video_enabled`) and indexing stay paid.
7. Bucket `avatars`: public, 2 MB, png/jpeg/webp; policies `avatars_owner_insert/update/delete` on the
   **first path segment = auth.uid()** (not `owner = auth.uid()`), plus
   `avatars_public_read`.

## Decisions made this phase — do not relitigate

| Thing | Call |
| --- | --- |
| Who gets the card | Every plan. Free members can now publish approved written review excerpts |
| Stars | **Shown.** Star icons on every review, a fractional star average on Card and About, five stars on the share image. This supersedes the "avoid five stars" line in `docs/ProofSignals-Specs/02-public-private-profile-architecture.md` (a dated note sits under it) and the Master PRD's "avoid over-reliance on stars" for the public card only |
| No-scroll contract | The card is `calc(100dvh - 64px)` under the sticky nav, `overflow: hidden`. Only three regions may scroll: an expanded quote, an expanded bio, the Links list. Every other text block is line-clamped. Short phones (`max-height: 600px` / `640px`) drop the headline and the swipe hint via media queries rather than clipping |
| Swipe rule | On Card, About and Links a horizontal swipe changes tab; inside Reviews it pages reviews and tabs change only via the strip |
| Deep links | `#reviews`, `#about`, `#links` open that layer; the hash is the source of truth on the live page (`useSyncExternalStore`), a tap writes it with `replaceState` |
| Style storage | One `profile_style` jsonb, not discrete columns. Keys only, mapped to CSS in `cardStyle.js`; a member never supplies a colour or a length. **The validator may only ever widen** — a CHECK is not re-evaluated on existing rows |
| Editor saves | Style + tagline + headline go in one `update_profile_card` call behind a Save button (atomic, readable server errors); name/bio/location save on blur through `update_my_profile` as before |
| Photo files | Fixed path `avatars/<uid>/avatar.<ext>`, upserted. Nothing to garbage-collect |
| Pricing lander | `public_plan_caps()` publishes the excerpts key, so the free card on `/pricing` now shows "Publish feedback excerpts" as included. Intended; `verify-phase21b`'s "≤ 2 dashes" assertion still holds |
| House rule | Unchanged. The Reviews empty state says "No approved reviews yet." and nothing on the card asks for, suggests or rewards a review |

## The style contract

`profile_style` keys and values (`cardStyle.js` `ALLOWED` = SQL validator;
`verify-phase23` diffs them):

| Key | Values | Default |
| --- | --- | --- |
| `shape` | circle, rounded, squircle, arch, none | circle |
| `ring` | solid, gradient, none | solid |
| `ringWidth` | thin, regular, bold | regular |
| `ringColor`, `ringColor2` | orange, orangeL, gold, goldL, brown, brownM, teal, tealL, cream, purple, green, slate, white | orange, gold |
| `photoBg` | transparent, white | white |
| `shadow` | none, soft, strong | soft |
| `photoPos` | top-left, top-center, top-right, bottom-left, bottom-center, bottom-right | top-center |
| `textSide` | auto, top, bottom | auto |
| `textAlign` | auto, left, center, right | auto |
| `bgKind` | solid, gradient, preset | preset |
| `bgColor`, `bgColor2` | palette keys as above | brown, brownM |
| `bgPreset` | ember, tide, dusk, cream | ember |

Text colour is derived from the background (`onDark`), never stored. A
cut-out (`photoBg: transparent` or `shape: none`) gets a `drop-shadow` that
follows the PNG's alpha; a filled frame gets a `box-shadow`.

## What was verified, and how

- `npm run lint`: 0 errors (the pre-existing warnings in `DashboardPage`,
  `HowPage` and older verify scripts remain).
- `npm run build`: clean; `/account/profile`, `/u/[username]` and its
  `opengraph-image` all build.
- Playwright (the container's Chromium at `/opt/pw-browsers/chromium`,
  against a temporary fixture route that was deleted before commit) at
  390×844, 375×667, 320×568 and 1280×800, across four style variants:
  `scrollHeight <= innerHeight` on every layer, all four tabs render, next
  button pages reviews, `#about` deep link opens About, a touch swipe on the
  Card layer opens Reviews, the editor renders with its preview, and no
  script or hydration errors. Screenshots were reviewed by eye.
- **Not verified:** anything that needs the database. See "Start here".

## Things learned the hard way

- **`useId` hydrated unevenly** inside the card (the SVG gradient ids in
  `StarRating` mismatched between server and client on some layouts).
  Gradient ids are now derived from the value and colours, so equal ratings
  share equal gradients and nothing depends on tree position.
- **A percentage `max-height` on a grid item resolves against its own,
  content-sized track**, which clipped the name. The Card layer now uses
  `minmax(120px, 1fr) auto` (or the reverse) and lets `FramedPhoto fit` take
  the leftover height instead.
- **A native `<img>` drag cancels pointer events**, which ate swipes that
  began on the photo. `draggable={false}` and `pointer-events: none` on the
  image.
- Next's app router treats a leading-underscore folder as private — a
  `src/app/_something` route 404s.
- The `react-hooks/set-state-in-effect` rule is an error in this repo's
  config: sync hash state with `useSyncExternalStore`, reset carousel state
  by keying the component, not with effects.

## Still open

- **Apply + verify** (above).
- **Seed the demo cast** with taglines and a style each in `seed-demo.mjs`
  so `/u/demo-*` shows the card off. Demo personas have no photo (initials
  only, by design).
- **HEIC uploads** from iOS are refused by the file input's `accept`; most
  iPhones hand over JPEG anyway. Convert server-side if it bites.
- **Fonts in the share image** — the OG route uses `sans-serif`; loading
  Fraunces into Satori is a nice-to-have.
- **Review text length** — the Reviews layer clamps at 7 lines and offers
  "Read more"; if members write essays, consider a hard cap at submit time.
- Phase 22 / D2 (groups and caps) is still the next product step and is
  untouched by this phase; its handoff in
  `docs/fiveup-continuation-phase22.md` remains current for that work.
