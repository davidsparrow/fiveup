# Archived: the web matching surface

Archived in Phase A of the Discord refactor (Sep 2026). Nothing here was
deleted; it was moved out of the routing tree and put behind one switch.

## What was archived

| Piece | Where it lives now | What still calls it |
| --- | --- | --- |
| `BrowsePage.jsx` (the /browse member browser + match request modal) | `src/archive/web-matching/BrowsePage.jsx` (moved unchanged) | `src/app/browse/page.jsx`, only when the gate is `web` |
| `MatchPreferencesPage.jsx` (degrees of separation, semi-duplicate toggles) | `src/archive/web-matching/MatchPreferencesPage.jsx` (moved unchanged) | `src/app/account/preferences/page.jsx`, only when the gate is `web` |
| Dashboard "+ Browse Members" entry point and its empty-state copy | `src/archive/web-matching/MatchActions.jsx` (extracted) | `src/app/dashboard/page.jsx`, passed into `DashboardPage` as a prop only when the gate is `web` |
| `getBrowseQuota`, `getEligibleCandidates`, `requestMatch` | still in `src/lib/fivestarz/data.js`, marked `// ARCHIVED` | the archived components above |
| `create_match`, `eligible_match_candidates` RPCs | still in the database, same bodies | anyone whose plan's gate is `web`, the service role, or an admin |
| "Browse Members" links in `SiteNav.jsx` and `Footer.jsx` | still in the link tables, flagged `webMatchingOnly` | rendered only when the gate is `web` |

The dashboard's read-only match history, the feedback modal, star ratings
and post requests were **not** archived. Matches created from Discord
(Phase C/D, `matches.source = 'discord'`) flow through exactly that UI, so
it has to stay live on every surface.

## Why

Matching moves to Discord (Squads, Missions, `/assist`). The web flow is
kept whole so that the day Discord changes its rules, or the community
outgrows it, the product is one row update away from being back.

## The switch

One `plan_feature_gates` row per plan:

```
feature_key = 'match_surface'
config      = {"surface":"discord"}   -- or {"surface":"web"}
```

Read by `public.match_surface()` (security definer, stable):

- returns the caller's plan's `config.surface`;
- anonymous callers read the `sprout` row (so nav hides "Browse Members"
  consistently before login);
- a missing row, a null `config.surface`, or any value other than
  `web` / `discord` returns `web`, so a missing seed can never lock members
  out.

`create_match` and `eligible_match_candidates` start with:

```sql
if not (public.match_surface() = 'web' or auth.role() = 'service_role' or public.is_admin()) then
  raise exception 'matching is handled in Discord';
end if;
```

The routes read the same RPC through `resolveMatchSurface()` in
`src/lib/fivestarz/match-surface.js` and redirect to
`NEXT_PUBLIC_DISCORD_INVITE_URL` (fallback `/dashboard`) when the surface is
Discord. The client shell (`PageShell.jsx`) reads it once per page for the
nav and footer.

## Restore procedure

Update the config on the gate rows. Nothing else.

```sql
update public.plan_feature_gates
set config = '{"surface":"web"}'::jsonb, updated_at = now()
where feature_key = 'match_surface';
-- or per plan: ... and plan_code = 'bloom'
```

Effects, immediately and without a deploy:

- `/browse` renders `BrowsePage` for signed-in members again;
- `/account/preferences` renders `MatchPreferencesPage` again;
- the dashboard Matches tab shows "+ Browse Members" and the web empty state;
- "Browse Members" reappears in the nav drawer and footer;
- `create_match` / `eligible_match_candidates` accept member calls again.

To go back to Discord, set the config to `{"surface":"discord"}` the same way.

Re-running the Phase A migration never touches an existing row (it seeds
with `on conflict do nothing`), so a flip survives migration replays.

## Restore test

Record the result of flipping the gate to `web` on a Vercel preview here,
and in the Phase A PR.

- [ ] Not yet run. The Phase A build environment had no Supabase project or
      Vercel access; `node verify-phaseA.mjs` and `next build` pass, and the
      gate logic is exercised at the source level only. Run the flip on the
      preview deploy before merging.
