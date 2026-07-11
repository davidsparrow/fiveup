# Continuation Prompt — Phase 12: Anonymous demo experience ("See it in action")

Give anonymous visitors something real to touch before the Beta modal: a `/demo`
guided tour narrated through five seeded demo members, walking through live
public pages (`/u/`, `/a/`) plus in-theme slideshows (screenshots + overlays)
for the auth-gated inner app. Locked decisions (via Q&A): hybrid live-pages +
HTML slideshow (no video yet), a 5-persona cast with cross-feedback, Beta CTA
stays primary with "See it in action" secondary, demo journey ends on the Beta
CTA. No schema changes, no migrations — the Phase 8–11 anon read layer already
does all the access control.

## The demo cast (all real Supabase users, paid plans, publishing on)

| Handle | Persona | Plan | Public assets (pinned slug) | Proof Lab |
|---|---|---|---|---|
| `demo-maya` | Maya Chen — course creator (the tour's protagonist) | bloom | `demo-inbox-engine-course` | — |
| `demo-diego` | Diego Ramos — SaaS founder | bloom | `demo-launchboard-landing`, `demo-investor-pitch-deck` | — |
| `demo-priya` | Priya Shah — marketing consultant | flourish | `demo-positioning-audit` | 2 listings |
| `demo-sam` | Sam Okafor — founder coach | bloom | `demo-founder-clarity-coaching` | 1 listing |
| `demo-noor` | Noor Haddad — e-com shop owner | bloom | `demo-saffron-and-salt` | buyer of Priya's audit |

- Cross-feedback web (reciprocal match + feedback both ways, rated, approved
  via `approve_public_feedback`): maya↔diego, maya↔priya, diego↔sam,
  priya↔noor, sam↔noor. maya↔diego also exercises `request_review_post` →
  accept. One completed Proof Lab deal (noor → priya) + engaged review,
  approved for Priya's profile.
- `searchable_public_profile` stays **false** everywhere → all demo pages are
  noindex and absent from the sitemap automatically (verified).
- Constants live in `src/lib/fivestarz/demo.js` (`DEMO_HANDLES`,
  `isDemoHandle`, `DEMO_ASSET_SLUGS`) — shared by seeder, banner, and tour so
  they can never drift. Slugs are **pinned by the seeder** (service-role
  update) because `set_asset_visibility` appends a random id fragment.

## 12a — seed script + demo world (`seed-demo.mjs`)

verify-phase11b pattern: `.env.local` parse, service-role admin client, one
signed-in anon client per persona. Writer RPCs wherever they exist (exercises
the real gate chain); service-role only for `plan_code`, slug pinning,
`created_at` backdating, and the one match the RPC cannot create (below).

- Re-runnable: normal run = teardown (delete auth users by handle + by fixed
  `demo-*@proofsignals.net` email; FK cascades) then recreate.
- `--teardown` removes everything; `--password <pw>` / `DEMO_SEED_PASSWORD`
  seeds with a known password for screenshot capture (random otherwise).
- **Verify (`verify-phase12a.mjs`, 21 checks):** 5 profiles exist
  (paid, not searchable); all `/u/demo-*` 200 + name + noindex; all six
  `/a/<pinned-slug>` 200 + noindex; approved excerpts render on profile and
  asset pages; Priya's engaged review + offers visible; teaser counts the
  listings; sitemap leak-free; anon writer RPC still rejected.

## 12b — /demo tour + slideshow + banner

- `src/app/demo/page.jsx` — indexable route, `PageShell`-wrapped.
- `src/components/fivestarz/DemoTourPage.jsx` — hero ("sample people, real
  pages") → 7 numbered stops: cast cards (→ live `/u/demo-*`) → add-asset
  slideshow → matching slideshow → feedback slideshow + a real seeded quote →
  rate/request/publish slideshow → live proof links (`/u/demo-maya`,
  `/a/demo-inbox-engine-course`, `/a/demo-launchboard-landing`) → Proof Lab
  slideshow + teaser link → closing Beta CTA (gold `openBeta`).
- `src/components/fivestarz/DemoSlideshow.jsx` — slides
  `{src, alt, title, caption, notes?}`, arrows/dots/counter, ←/→ keys, touch
  swipe, optional `autoPlayMs` (off by default), browser-chrome frame, side
  text panel on desktop / stacked on mobile, `aria-live` slide announcement.
- `src/lib/fivestarz/demo-slides.js` — 5 decks, 12 slides, copy included.
- `src/components/fivestarz/DemoBanner.jsx` — sticky gold strip "You're
  viewing a demo profile with sample data · ← Back to the tour", rendered on
  `/u/[username]` when `isDemoHandle(profile.public_username)` and on
  `/a/[slug]` when `isDemoHandle(asset.owner_username)` (why demo assets never
  use brand hiding). One mechanism = honesty + wayfinding.
- **Verify (`verify-phase12b.mjs`, 20 checks):** /demo 200 + indexable + stops +
  live links + beta CTA; screenshots serve 200; banner on demo profile/asset
  pages; a freshly-created non-demo public profile has NO banner.

### Screenshot recapture (when inner-app UI changes)

`capture-demo-shots.mjs` (repo root, needs devDependency `playwright`):

1. `node seed-demo.mjs --password 'YourShotPw1!'`
2. `npm run dev` (port 3210)
3. `DEMO_SEED_PASSWORD='YourShotPw1!' node capture-demo-shots.mjs`
4. `node seed-demo.mjs` — restore the pristine world

It stages temp state via service role (an in-flight maya↔sam match so
"Leave Feedback"/rate/request-post render, plus a temp browse visitor so the
cast shows as candidates), shoots 12 jpgs (1800px, q82) into `public/demo/`,
and cleans up. Gotcha it encodes: PageShell makes `<body>` the scroll
container, so `window.scrollTo` is a no-op — reset `document.body.scrollTop`.

## 12c — marketing entry points

- `HomePage.jsx`: hero CTA row (primary Beta + ghost "See it in action →");
  mock match card renamed to Maya/Diego, wrapped in a keyboard-accessible
  click-through to `/demo`, dead Accept/Profile buttons → "Take the tour →" /
  "View a profile" (`/u/demo-maya`); closing CTA gains "or take the 3-minute
  tour →".
- `SiteNav.jsx` + `Footer.jsx`: "Live Demo" → `/demo`.
- `sitemap.js`: `/demo` added to static routes (robots.js needed no change).
- **Verify (`verify-phase12c.mjs`, 9 checks):** all of the above over HTTP.

## Bugs found while seeding (pre-existing — all three FIXED in Phase 13)

1. **`create_match` 4°-separation crash:** the RPC stores the actual shortest
   path degree, but `matches.separation_degree_used` has `check (between 1 and
   3)` — any real pair at exactly 4° separation (passes the preference check,
   which requires > 2) makes the insert crash. The demo web is a 5-cycle, so
   its last pair hit this; the seeder falls back to a service-role insert with
   `source='auto'`. Fix candidate: `least(v_shortest_path_degree, 3)` in the
   insert.
2. **Graph-test fixtures visible in member browse:** users from
   `supabase/tests/graph_matching_seed.sql` ("… Seed — Seeded graph test
   member") appear in `/browse` for real members. Consider cleaning them from
   the live DB or excluding them.
3. **Asset wizard scroll:** on step change the page keeps the body scrolled
   (body is the scroll container); step 2+ can open mid-page for real users.

## Out of scope / deferred

- `is_demo` column + RPC-level exclusion of demo users from member browse,
  matching candidates, and Proof Lab. During invite-only beta, demo members
  filling those surfaces is acceptable and `demo-*` handles self-identify —
  revisit before public launch.
- Produced video walkthrough — the seeded world + tour copy double as its
  storyboard.
- Demo persona avatars (initials only — honest, no fake faces).
