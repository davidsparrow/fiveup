# Continuation Prompt — Phase 17: feedback status pipeline

Second chunk of the 2026-09 planned-items run (notifications → **pipeline** →
AI Asset Builder). Closes the roadmap's "Full feedback status pipeline"
promise: every dashboard match card now shows where the exchange stands.

## No migration

Entirely derived — no new state. `listMyMatches` already returned everything
needed (match status, both `feedback_submissions`, the `review_post_requests`
row on their feedback).

## Design note

The roadmap copy said "matched → experienced → feedback → post requested →
posted", but no "experienced" event exists anywhere in the schema. The honest
mapping shows both feedback directions instead:
**Matched → Your feedback → Their feedback → Post requested → Posted.**
The HowPage roadmap entry was reworded to match and moved to Live in Beta.

## App changes

- **`src/lib/fivestarz/match-pipeline.js`** (new, pure — node-testable):
  `matchPipelineStages(match)` returns the five stages with states
  `done | current | pending | blocked`. Rules: queued matches and matches
  cancelled before any progress return `null` (the status pill says it all);
  a declined post request or mid-flight cancellation marks the remaining tail
  `blocked`; an accepted post request relabels stage 4 "Post accepted";
  a declined one relabels it "Post declined".
- **`src/components/fivestarz/MatchPipeline.jsx`** (new): horizontal stepper —
  teal ✓ done, orange ring current, gray pending, ✕ blocked; connectors fill
  as stages complete; horizontally scrollable on mobile.
- **`DashboardPage.jsx`**: renders `<MatchPipeline match={m} />` at the bottom
  of every match card.
- **`HowPage.jsx`**: "Feedback status pipeline" moved to ✅ Live in Beta;
  🔨 In Development now holds only Free↔Free auto re-matching.

## Verify

`node verify-phase17.mjs` (no DB / server): 15 checks — the full lifecycle
table (fresh, one-sided feedback both ways, both submitted, requested,
accepted, posted, declined, queued, cancelled before/after progress) plus
dashboard + HowPage wiring. Lint 0 errors, build clean.

**Manual visual check**: sign in and open /dashboard → Matches (the demo cast
via `seed-demo.mjs --password` works too — sam↔noor and friends carry
matches in several states).

## Out of scope

- Free↔Free automated re-matching engine (last In-Development roadmap item).
- Any new lifecycle events (e.g. a real "experienced" checkpoint) — would
  need schema + RPC and member behavior to report it.
