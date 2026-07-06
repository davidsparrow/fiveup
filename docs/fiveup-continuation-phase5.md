# Continuation Prompt — Phase 5: Close Out Matching/Feedback Wiring Gaps

## Context

`docs/fiveup-project-status-7-4-26.txt` is a gap analysis written *before* Phases 1-4 were implemented, so it's now stale in one important way: asset creation, browse/matching, feedback submission, and rating/post-requests are no longer disconnected mock UI — they're wired to the real Supabase backend (`src/lib/fivestarz/data.js` calls the real tables and RPCs in `supabase/migrations/`). This was verified end-to-end against two live test accounts on the real project (14/14 checks passed, including the DB correctly rejecting a free-plan browse attempt).

Three gaps were explicitly deferred at that point rather than fixed, because they needed new schema/design decisions rather than just wiring existing RPCs. This phase closes them out:

1. **No `create_asset` RPC** — asset creation is a raw client-side insert (`createAsset()` in `data.js`) with zero plan-quota enforcement. `plan_feature_gates` already defines `max_assets`, `max_channels_per_asset`, `advisory_assets_enabled`, `client_assets_enabled`, and `require_specific_feedback_types` per plan — none of them are checked today.
2. **No semi-duplicate re-match flow** — `BrowsePage.jsx` disables "Request Match" entirely whenever `prior_match_count > 0`, even though the schema (`create_match`'s `p_previous_match_id`/`p_my_blocked_channels`/`p_their_blocked_channels` params, plus `user_profiles.allow_semi_duplicate_matches`/`allow_semi_duplicate_with_free`) fully supports a controlled re-match on different channels.
3. **No screenshot upload** — `AssetPage.jsx` only keeps a local `FileReader` preview; nothing is ever written to Supabase Storage, and no Storage bucket has ever been created for this project despite `asset_screenshots.storage_path` existing in the schema.

Everything else from the 7-4-26 gap analysis (AI Asset Builder, Trust & Safety moderation, Marketplace/Proof Lab backend + billing, video feedback, public profile pages) is still fully unimplemented and deliberately **out of scope here** — see the bottom of this doc.

---

## Phase 5a — `create_asset` RPC with real plan-quota enforcement

**Goal:** mirror `create_match`'s pattern — move asset creation from client-side inserts into a `security definer` Postgres function that enforces the gates already seeded in `plan_feature_gates`.

**New migration** (`supabase/migrations/<timestamp>_create_asset_rpc.sql`) — first draft, verify against current schema before applying:

```sql
create or replace function public.create_asset(
  p_name text,
  p_public_url text,
  p_asset_type public.asset_type,
  p_description text default null,
  p_is_client_asset boolean default false,
  p_client_name text default null,
  p_require_star_rating boolean default false,
  p_require_star_plus_one_other boolean default false,
  p_channels text[] default '{}'::text[],
  p_feedback_formats public.feedback_format[] default '{}'::public.feedback_format[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_user_id uuid := auth.uid();
  v_plan public.plan_code;
  v_max_assets integer;
  v_max_channels integer;
  v_current_asset_count integer;
  v_asset_id uuid;
begin
  if v_caller_user_id is null then
    raise exception 'authentication required';
  end if;

  select plan_code into v_plan from public.user_profiles where user_id = v_caller_user_id;

  if p_is_client_asset and not public.plan_feature_enabled(v_plan, 'client_assets_enabled') then
    raise exception 'your plan does not support client assets';
  end if;

  if p_asset_type = 'advisory_skills' and not public.plan_feature_enabled(v_plan, 'advisory_assets_enabled') then
    raise exception 'your plan does not support advisory skill assets';
  end if;

  if (p_require_star_rating or p_require_star_plus_one_other)
     and not public.plan_feature_enabled(v_plan, 'require_specific_feedback_types') then
    raise exception 'your plan does not allow requiring specific feedback types';
  end if;

  select count(*) into v_current_asset_count
  from public.assets
  where owner_user_id = v_caller_user_id and status <> 'archived';

  v_max_assets := public.plan_feature_limit(v_plan, 'max_assets');
  if v_max_assets is not null and v_current_asset_count >= v_max_assets then
    raise exception 'you have reached your plan''s asset limit (%)', v_max_assets;
  end if;

  v_max_channels := public.plan_feature_limit(v_plan, 'max_channels_per_asset');
  if v_max_channels is not null and coalesce(array_length(p_channels, 1), 0) > v_max_channels then
    raise exception 'your plan allows at most % channel(s) per asset', v_max_channels;
  end if;

  insert into public.assets (
    owner_user_id, name, public_url, asset_type, description,
    is_client_asset, client_name, status, require_star_rating, require_star_plus_one_other
  ) values (
    v_caller_user_id, p_name, p_public_url, p_asset_type, p_description,
    p_is_client_asset, p_client_name, 'active', p_require_star_rating, p_require_star_plus_one_other
  )
  returning id into v_asset_id;

  insert into public.asset_channels (asset_id, channel_name)
  select v_asset_id, unnest(p_channels) where coalesce(array_length(p_channels, 1), 0) > 0;

  insert into public.asset_feedback_formats (asset_id, format)
  select v_asset_id, unnest(p_feedback_formats) where coalesce(array_length(p_feedback_formats, 1), 0) > 0;

  return v_asset_id;
end;
$$;

revoke all on function public.create_asset(text, text, public.asset_type, text, boolean, text, boolean, boolean, text[], public.feedback_format[]) from public;
grant execute on function public.create_asset(text, text, public.asset_type, text, boolean, text, boolean, boolean, text[], public.feedback_format[]) to authenticated;
```

Note: per the seed data, `limit_int = null` means "unlimited" for `flourish`'s `max_assets` and for `bloom`/`flourish`'s `max_channels_per_asset` — this RPC's `is not null` checks already treat that correctly, but re-verify against the live `plan_feature_gates` rows before shipping.

**Files to change:**
- New migration as above.
- [src/lib/fivestarz/data.js](src/lib/fivestarz/data.js) — replace `createAsset()`'s multi-insert body with a single `supabase.rpc('create_asset', {...})` call, passing the enum-mapped `asset_type` and a `feedback_format[]` array (not label strings) plus the channels array directly.
- [src/components/fivestarz/AssetPage.jsx](src/components/fivestarz/AssetPage.jsx) — surface the RPC's plan-limit exceptions (e.g. "you have reached your plan's asset limit (1)") inline in the confirm step, same pattern as the existing `saveError` state.

**Done:** a sprout-plan user can create exactly 1 active asset; a 2nd attempt fails with a clear inline error from the RPC. A bloom-plan user can create up to 5. Advisory-skills/client-asset attempts on sprout are rejected with a plan-specific message instead of silently succeeding.

---

## Phase 5b — Semi-duplicate re-match wiring

**Goal:** when `eligible_match_candidates` returns `prior_match_count > 0` and `has_active_match = false`, let the user request a re-match instead of just disabling the button (current behavior in `BrowsePage.jsx`).

**Design questions to resolve before coding:**
- Where do "already used channels" come from? Proposal: look up the most recent past match's two `feedback_submissions`, then their `review_post_requests.requested_channel_name` — those are the channels that should be blocked this round via `create_match`'s `p_my_blocked_channels`/`p_their_blocked_channels`.
- If the previous match's feedback was never posted anywhere (no `review_post_requests` row), fall back to blocking nothing extra for that side — `create_match` doesn't require non-empty blocked-channel arrays.

**Files to change:**
- `src/lib/fivestarz/data.js` — add `getPreviousMatch(supabase, userId, otherUserId)` (most recent `matches` row between the two, any status) and `getUsedChannelsForMatch(supabase, matchId)` (join `feedback_submissions` → `review_post_requests` for that match).
- `src/components/fivestarz/BrowsePage.jsx` — when `hasPrev && !blocked`, re-enable the card's button ("⚡ Request Re-Match"), and have `RequestMatchModal` fetch the previous match + used channels on open, pass `previousMatchId`/`myBlockedChannels`/`theirBlockedChannels` into `requestMatch()`, and show the blocked channels struck through (restores the original mock UI's "Re-match eligible" treatment, now backed by real data).
- `requestMatch()` in `data.js` — add optional `previousMatchId`, `myBlockedChannels`, `theirBlockedChannels` params, passed through to the `create_match` RPC (it already accepts them).

**Done:** two users who completed a full feedback cycle on one asset pair can request a second match; `create_match` succeeds with `is_semi_duplicate = true`; reusing a previously-posted channel is rejected by the RPC (verify via `match_blocked_channels` rows after the request).

---

## Phase 5c — Screenshot upload to Supabase Storage

**Goal:** screenshots selected in `AssetPage.jsx` actually persist, instead of existing only as a local blob URL that disappears on refresh.

**Prerequisite:** no Storage bucket exists yet. First-draft migration (verify exact `storage.objects` RLS shape against current Supabase Storage docs before applying):

```sql
insert into storage.buckets (id, name, public)
values ('asset-screenshots', 'asset-screenshots', false)
on conflict (id) do nothing;

create policy "asset_screenshots_storage_owner_write"
on storage.objects for all
to authenticated
using (bucket_id = 'asset-screenshots' and owner = auth.uid())
with check (bucket_id = 'asset-screenshots' and owner = auth.uid());

create policy "asset_screenshots_storage_read_if_asset_visible"
on storage.objects for select
to authenticated
using (
  bucket_id = 'asset-screenshots'
  and exists (
    select 1 from public.asset_screenshots ascr
    join public.assets a on a.id = ascr.asset_id
    where ascr.storage_path = storage.objects.name
      and (a.owner_user_id = auth.uid() or a.status = 'active')
  )
);
```

**Files to change:**
- `data.js` — add `uploadAssetScreenshot(supabase, assetId, file)` using `supabase.storage.from('asset-screenshots').upload(...)`, then insert the returned path into `asset_screenshots`.
- `AssetPage.jsx` — after `create_asset` succeeds, loop over the selected screenshots and upload each real `File` object. Note: `handleFiles` currently only keeps a `FileReader` data-URL preview and discards the original `File` — it needs to retain the raw `File` in state so it can be uploaded after asset creation.

**Done:** uploading 2 screenshots during asset creation results in 2 rows in `asset_screenshots` with real `storage_path` values, visible in the Supabase Storage dashboard under `asset-screenshots/<asset-id>/`.

---

## Verification

Same approach as Phases 1-4: a Node script using the service-role key creates temporary confirmed test users, exercises `create_asset` quota limits / re-match / screenshot upload against the real project, then deletes the test users. Ask before running — it touches the live database with elevated credentials, same as last time.

## Out of scope for Phase 5 (tracked separately, still fully unimplemented)

AI Asset Builder, Trust & Safety moderation (phrase blocking/flagging), Marketplace (Proof Lab) real backend + Stripe billing, video feedback/Mux integration, public profile pages (`/u/[username]`, `/a/[slug]`) — all as described in `docs/fiveup-project-status-7-4-26.txt`.
