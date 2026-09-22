# Continuation Prompt — Phase 16: moderation outcome emails

First chunk of the 2026-09-13 "remaining planned items" run (order locked with
the user: notifications → feedback status pipeline → AI Asset Builder). Scope
locked to **emails only** — the appeals workflow stays deferred; the email
footer invites a reply, which lands wherever noreply@bendersaas.ai replies
route today.

Closes the Phase-7 follow-up "Email/notification of moderation outcomes — the
notify-seller route pattern exists to build on later."

## No migration

App-side only. `resolve_flag` and its audit trail are untouched.

## App changes

- **`src/lib/fivestarz/moderation-email.js`** (new, server-only):
  - `composeModerationEmail({ action, contentType })` — pure copy table:
    warn_user / suspend_user / reinstate_user / remove_content /
    restore_content each get a subject + heading + body (remove/restore name
    the content type via member-facing labels for the six 7a content types);
    `dismiss` and unknown actions return **null** — the member never learns a
    dismissed report existed. **Moderator notes are deliberately excluded** —
    they are an internal audit trail, not member-facing copy.
  - `renderModerationEmailHtml` — the notify-seller branded-card style.
  - `sendModerationOutcomeEmail({ flagId, action })` — best-effort, never
    throws: skips quietly when the action is non-notifiable, env
    (RESEND_API_KEY / service key) is missing, the flag or its owner can't be
    resolved, or the send fails. Resolves the member's auth email
    service-side (same as notify-seller, never exposed to the browser).
- **`src/app/admin/actions.js`** — after a successful `resolveFlag`, calls
  `sendModerationOutcomeEmail({ flagId, action })`. Email failure can never
  block or fail the moderation action.

## Verify

`node verify-phase16.mjs` (no DB, no dev server): per-action composition,
content-type labeling, dismiss/unknown → null, notes excluded, fail-open with
missing RESEND_API_KEY, and source-level wiring (notify runs after resolve).
Actual delivery is a production manual check — RESEND_API_KEY is not in
`.env.local` (production-only, same as notify-seller).

## Out of scope

- Appeals workflow (reply-driven for now; a structured appeal RPC + admin
  queue section is the future shape if wanted).
- In-app notification center.
- Emails for auto-flags (`record_auto_flag`) — only moderator resolutions
  notify.
