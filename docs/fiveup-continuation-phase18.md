# Continuation Prompt — Phase 18: AI Asset Builder

Third chunk of the 2026-09 planned-items run (notifications → pipeline →
**AI**). Closes the Phase-6 roadmap's "AI Asset Builder — onboarding assist
that drafts asset name/description/channels/feedback-format suggestions from
a URL; lowest structural risk, no schema dependencies; feeds create_asset."

## No migration

App-side only. Requires `ANTHROPIC_API_KEY` in the environment (set in
`.env.local`; **add it to the production host env before launch** — without
it the route returns 503 and the wizard quietly hides the assist).

## App changes

- **`src/lib/fivestarz/asset-wizard-options.js`** (new) — the wizard's three
  option lists (types / channels / feedback formats), now shared between the
  wizard UI and the AI route so the model's suggestions are constrained to
  exactly the labels the wizard renders. `AI_SUGGESTIBLE_ASSET_TYPES`
  excludes "Client Asset" and "Free Session / Consultation" (ownership and
  free-session offers are the member's call, not derivable from a webpage).
- **`src/app/api/asset-builder/route.js`** (new) — POST `{url}`:
  1. Members only: cookie session, or `Authorization: Bearer <access_token>`
     (validated via the service-role client) for tooling.
  2. URL validation with a private/internal-host guard (localhost, loopback,
     RFC-1918 ranges, link-local, `.local`/`.internal`, dotless hosts) —
     beta-grade SSRF hygiene, plus a 10s fetch timeout and 600KB read cap.
  3. HTML → text (title + meta description + stripped body, 12K char cap).
  4. One `claude-opus-5` call via the official SDK's structured-output
     helper (`client.messages.parse` + `zodOutputFormat`): schema enums are
     the wizard lists, so an out-of-vocabulary suggestion cannot parse. The
     system prompt frames page text as untrusted content to describe, never
     instructions to follow. A refusal/parse failure returns a friendly 502.
  5. Deliberately no server-side refusal fallbacks (the beta `fallbacks`
     param doesn't pair with `messages.parse`; refusal risk on marketing
     pages is negligible and the 502 path covers it).
- **`AssetPage.jsx`** — "✨ Draft with AI from your URL" panel under the URL
  field in step 1. **Non-clobbering**: fills only fields the member hasn't
  set (name/type/description; channels + feedback formats pre-select in the
  later steps only when none were chosen). 503 from the route hides the
  panel. The wizard's inline option lists were replaced by the shared module.
- **`HowPage.jsx`** — "AI asset drafting" added to ✅ Live in Beta.

## Cost

One drafting call ≈ 3–4K input + a few hundred output tokens on
`claude-opus-5` — roughly $0.02–0.04 per draft.

## Verify

`BASE_URL=http://localhost:3210 node verify-phase18.mjs` (needs the dev
server; makes ONE real drafting call against example.com when
`ANTHROPIC_API_KEY` is set, skipped otherwise): 15 checks — 401 without
auth, 400 on missing/garbage/private-host URLs, 422 on unreachable hosts,
real-call suggestion shape (name/description non-empty, every enum value ⊆
the wizard lists), and wizard/HowPage wiring. Lint 0 errors, build clean;
verify-phase16/17 regressions green.

## Out of scope

- Drafting from screenshots or PDFs (page text only).
- Auto-creating the asset — the member always reviews and submits the wizard.
- Refusal fallbacks (see above).
