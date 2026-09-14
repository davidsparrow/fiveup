// Verification for Phase 16 — moderation outcome emails.
//
// The send path is best-effort and gated on RESEND_API_KEY (production-only),
// so this verifies the composition logic, the fail-open behavior without the
// key, and that the admin action is wired to the helper. Actual delivery is a
// manual check in production (resolve a flag, watch the inbox).
//
//   node verify-phase16.mjs

import { readFileSync } from 'node:fs';
import {
  composeModerationEmail,
  renderModerationEmailHtml,
  sendModerationOutcomeEmail,
} from './src/lib/fivestarz/moderation-email.js';

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

console.log('\n[composition — one email per notifiable action]');
{
  for (const action of ['warn_user', 'suspend_user', 'reinstate_user']) {
    const e = composeModerationEmail({ action, contentType: null });
    expect(`${action} composes subject + heading + body`, !!e?.subject && !!e?.heading && !!e?.body, JSON.stringify(e));
  }
  const rm = composeModerationEmail({ action: 'remove_content', contentType: 'proof_lab_listing' });
  expect('remove_content names the content type', /Proof Lab listing/.test(rm?.subject ?? ''), rm?.subject);
  const rs = composeModerationEmail({ action: 'restore_content', contentType: 'feedback' });
  expect('restore_content names the content type', /feedback submission/.test(rs?.subject ?? ''), rs?.subject);
  const unknownType = composeModerationEmail({ action: 'remove_content', contentType: 'something_new' });
  expect('unknown content type falls back gracefully', !!unknownType?.subject, JSON.stringify(unknownType));
  expect('dismiss produces NO member email', composeModerationEmail({ action: 'dismiss', contentType: 'asset' }) === null);
  expect('unknown action produces NO member email', composeModerationEmail({ action: 'made_up', contentType: 'asset' }) === null);
  expect('moderator notes are not part of the template', !JSON.stringify(rm).toLowerCase().includes('note'));
}

console.log('\n[rendering]');
{
  const html = renderModerationEmailHtml({ heading: 'H<eading>', body: 'Body text.' });
  expect('renders heading and body into branded card', html.includes('H<eading>') && html.includes('Body text.') && html.includes('starz'));
  expect('includes the reply-for-questions footer', /Reply to this email/i.test(html));
}

console.log('\n[fail-open — email must never block moderation]');
{
  const r1 = await sendModerationOutcomeEmail({ flagId: '00000000-0000-0000-0000-000000000000', action: 'dismiss' });
  expect('dismiss short-circuits (false, no throw)', r1 === false);
  const saved = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const r2 = await sendModerationOutcomeEmail({ flagId: '00000000-0000-0000-0000-000000000000', action: 'suspend_user' });
  expect('missing RESEND_API_KEY skips quietly (false, no throw)', r2 === false);
  if (saved !== undefined) process.env.RESEND_API_KEY = saved;
}

console.log('\n[wiring — admin action notifies after resolve]');
{
  const src = readFileSync(new URL('./src/app/admin/actions.js', import.meta.url), 'utf8');
  expect('actions.js imports the helper', src.includes('sendModerationOutcomeEmail'));
  const resolveIdx = src.indexOf('await resolveFlag(');
  const notifyIdx = src.indexOf('await sendModerationOutcomeEmail(');
  expect('notification runs after resolveFlag succeeds', resolveIdx !== -1 && notifyIdx > resolveIdx, `resolve@${resolveIdx} notify@${notifyIdx}`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
