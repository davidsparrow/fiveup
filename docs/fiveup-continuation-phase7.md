# Continuation Prompt — Phase 7: Trust & Safety Moderation

## Why now

Phase 8 opens FiveStarz to the public (public profile / proof pages, anon-role RLS, a public Proof Lab teaser). **Do not ship public surfaces before there is a way to keep bad content off them.** Phase 7 builds the moderation layer so Phase 8 has something to lean on. It's protective groundwork, not a growth feature — scope it tight and correct rather than broad.

The product's whole pitch is *trust* (see the engaged-reviewer moat in `docs/fiveup-continuation-phase6b.md`). Moderation is the other half of that promise: engaged-only reviews keep bots out; moderation keeps abuse out.

## What already exists (build on it, don't rebuild)

- **Admin identity:** `public.user_roles` (`user_id`, `role public.app_role`), the `app_role` enum (currently only `'admin'`), and `public.is_admin(check_user_id default auth.uid())`. Admin-guarded RPCs already use this pattern (e.g. `proof_lab_deals_awaiting_confirmation` from 6b.2 — an admin-only, security-definer, returns-a-table RPC that is the template for every admin query below).
- **Security-definer + RLS conventions:** every prior phase's migrations. Reuse verbatim — RPC-only writes, `revoke all from public` + `grant execute to authenticated`, idempotent migrations (DO-block enum guards, `if not exists`, `drop policy if exists`).
- **Live-verification harness:** the `verify-phaseX.mjs` service-role scripts (temp users, exercise, delete). Every sub-phase below ships with one.

## Free-text surfaces moderation must cover (audited)

Every place a member can put words that another member (or, post-Phase-8, the public) will read:

| Surface | Column / RPC |
|---|---|
| Profile bio | `user_profiles.bio` |
| Match feedback | `feedback_submissions.written_feedback`, `structured_feedback` (jsonb) |
| Asset | `assets.name`, `assets.description` |
| Proof Lab listing | `proof_lab_listings.title`, `description` |
| Deal request note | `proof_lab_deal_requests.note` |
| Engaged-reviewer review | `proof_lab_reviews.written_review` |

A single polymorphic moderation model (`content_type` + `content_id`) covers all of these rather than six bespoke systems.

## Sub-phases (each independently shippable + verifiable)

### 7a — Blocklist + automated flagging on write

**Goal:** a curated phrase list that, at write time, either **rejects** the write (egregious terms) or **allows-but-flags** it (softer terms) for human review.

Draft schema:
```sql
create type public.moderation_severity as enum ('block', 'flag'); -- block = reject write, flag = allow + queue

create table public.blocked_phrases (
  id uuid primary key default gen_random_uuid(),
  phrase text not null unique,
  severity public.moderation_severity not null default 'flag',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Returns the worst severity matched (null = clean). Case-insensitive substring
-- match to start; upgrade to word-boundary/regex later if false positives bite.
create or replace function public.scan_text_for_blocked_phrases(p_text text)
returns public.moderation_severity ...  -- 'block' > 'flag' > null
```

Wire `scan_text_for_blocked_phrases` into the write RPCs (`submit_feedback`, `create_proof_lab_review`, `request_proof_lab_deal`, `create_asset`, `create/update_proof_lab_listing`, and a profile-bio update RPC — **note:** bio is currently a direct table update, so a `update_my_profile` RPC likely needs creating). On `'block'` → `raise exception`; on `'flag'` → allow the write **and** insert a `moderation_flags` row (see 7b) with `reporter_user_id = null` (system).

**Decision to resolve:** substring vs. word-boundary matching (substring is simplest but "scunthorpe"-style false positives); starting phrase list + per-phrase severity.

### 7b — Reporting + moderation queue

Draft schema:
```sql
create type public.moderation_content_type as enum
  ('profile_bio','feedback','asset','proof_lab_listing','deal_note','proof_lab_review');
create type public.moderation_flag_status as enum ('pending','reviewing','resolved','dismissed');

create table public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  content_type public.moderation_content_type not null,
  content_id uuid not null,               -- the row's id (profile: user_id)
  content_owner_user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  reporter_user_id uuid references public.user_profiles(user_id) on delete set null, -- null = system/auto
  reason text,
  auto_severity public.moderation_severity,  -- set when system-flagged
  status public.moderation_flag_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
RPCs:
- `report_content(p_content_type, p_content_id, p_reason)` — any member reports content; resolves `content_owner_user_id` server-side; dedupes repeat reports by the same reporter on the same content.
- `list_moderation_queue(p_status default 'pending')` — **admin-only**, returns flags joined to a rendered snippet of the offending text (so admins triage without six client queries).
- RLS on `moderation_flags`: **admin-only select**; no direct writes (reports go through `report_content`, which is security-definer).

**Decision to resolve:** can a member see the status of their own report? (Recommend: no member-facing view in 7b — keep the queue admin-only; revisit if needed.)

### 7c — Actions + enforcement

Draft schema:
```sql
create type public.moderation_action_type as enum ('dismiss','remove_content','warn_user','suspend_user','reinstate_user');

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid references public.moderation_flags(id) on delete set null,
  admin_user_id uuid not null references public.user_profiles(user_id),
  action public.moderation_action_type not null,
  target_user_id uuid references public.user_profiles(user_id) on delete cascade,
  notes text,
  created_at timestamptz not null default now()
);

-- account standing
alter table public.user_profiles
  add column account_status text not null default 'active'
    check (account_status in ('active','warned','suspended'));
```
RPCs (all **admin-only**, and each writes a `moderation_actions` audit row + updates the flag status):
- `resolve_flag(p_flag_id, p_action, p_notes)` — dispatches dismiss / remove-content / warn / suspend.
- **remove_content** flips a `moderation_status` on the target row (add `moderation_status text default 'ok' check in ('ok','removed')` to each content table, OR a `hidden` boolean) so RLS/read paths exclude it. Update the listing/review/asset SELECT policies + data-layer reads to hide `removed` content.
- **suspend_user** sets `account_status='suspended'`; then **every write RPC gains a standing check** (`if (select account_status from user_profiles where user_id = auth.uid()) = 'suspended' then raise exception`). Consider a shared `assert_active_caller()` helper called at the top of each write RPC.

**Decision to resolve:** suspension = block writes only (can still read) vs. full lockout (also block login via a middleware/route check). Recommend **block-writes-first** (DB-enforced, simplest, reversible); full lockout is a later hardening.

### 7d — Admin moderation console

There is **no admin UI in the app today.** Add an `/admin` route (server component, `redirect` unless `is_admin`), with a moderation queue view: list pending flags, view the offending snippet, and action buttons (dismiss / remove / warn / suspend) wired to the 7c RPCs. Also surface the existing `proof_lab_deals_awaiting_confirmation` ops flag here (it's been waiting for a home since 6b.2). Keep it functional, not fancy.

**Decision to resolve:** does `app_role` need a `'moderator'` value distinct from `'admin'`? (Recommend: add `'moderator'` now and have `is_admin`-style checks accept either for moderation actions, reserving `'admin'` for higher-risk ops — cheap to add, annoying to retrofit.)

## Verification (per sub-phase, live service-role script)

- **7a:** blocked term rejected at each write RPC; flagged term written *and* a system `moderation_flags` row created; clean text passes; severity precedence (`block` beats `flag`).
- **7b:** member report creates a pending flag; duplicate report deduped; non-admin cannot read the queue; admin can; queue returns the right snippet.
- **7c:** each action writes an audit row + updates flag status; removed content disappears from member reads (RLS); suspended user's write RPCs all reject while reads still work; reinstate restores; every action is admin-only.
- **7d:** drive the `/admin` flow end-to-end against seeded flags.

## Out of scope (record so it isn't assumed)

- **ML / automated toxicity scoring** — 7a is a curated phrase list, not a classifier. A model-based scorer (or a moderation API) is a later upgrade the schema already accommodates (`auto_severity`).
- **Appeals workflow** for warned/suspended users — model the actions now; the member-facing appeal flow is later.
- **Rate-limiting / anti-spam throughput controls** — related but separate; not this phase.
- **Email/notification of moderation outcomes** — the `notify-seller` route pattern exists to build on later; not wired here.
- **Public-surface exposure** — Phase 8. Phase 7 only makes the *authenticated* surfaces safe; extending `removed`-content hiding to `anon` RLS happens when anon RLS is introduced.

## Decisions to lock before building (summary)

1. Phrase matching: substring vs. word-boundary. *(Rec: word-boundary to cut false positives; ship a small curated list.)*
2. `app_role`: add `'moderator'` now? *(Rec: yes.)*
3. Suspension scope: block-writes vs. full lockout. *(Rec: block-writes first.)*
4. Member visibility into their own reports. *(Rec: none in 7b.)*
5. Content-removal representation: per-table `moderation_status` column vs. a central hidden-content table. *(Rec: per-table column — simplest for RLS to consult.)*

*(When ready to build 7a, confirm these — same "make it solid" Q&A pass used for Phase 6 — then proceed sub-phase by sub-phase, applying each migration and running its verification before the next.)*
