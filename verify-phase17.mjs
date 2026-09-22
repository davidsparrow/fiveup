// Verification for Phase 17 — feedback status pipeline.
//
// The pipeline is derived (no new state), so this verifies the derivation
// table against every lifecycle scenario, plus the dashboard wiring. The
// dashboard itself is auth-gated; visual check is manual.
//
//   node verify-phase17.mjs

import { readFileSync } from 'node:fs';
import { matchPipelineStages, PIPELINE_STAGES } from './src/lib/fivestarz/match-pipeline.js';

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const states = (m) => matchPipelineStages(m)?.map((s) => s.state).join(',');
const labels = (m) => matchPipelineStages(m)?.map((s) => s.label).join(',');

const FB = { id: 'x' };
const mk = (over = {}) => ({ status: 'matched', myFeedback: null, theirFeedback: null, theirFeedbackPostRequest: null, ...over });

console.log('\n[derivation — lifecycle scenarios]');
{
  expect('5 stages defined', PIPELINE_STAGES.length === 5);

  expect('fresh match: matched done, your feedback current',
    states(mk()) === 'done,current,pending,pending,pending', states(mk()));

  expect('my feedback sent: their feedback current',
    states(mk({ myFeedback: FB })) === 'done,done,current,pending,pending', states(mk({ myFeedback: FB })));

  expect('their feedback first still shows my side current',
    states(mk({ theirFeedback: FB })) === 'done,current,done,pending,pending', states(mk({ theirFeedback: FB })));

  const both = mk({ myFeedback: FB, theirFeedback: FB });
  expect('both submitted: post requested current',
    states(both) === 'done,done,done,current,pending', states(both));

  const requested = mk({ myFeedback: FB, theirFeedback: FB, theirFeedbackPostRequest: { status: 'pending' } });
  expect('post requested: posted current',
    states(requested) === 'done,done,done,done,current', states(requested));

  const accepted = mk({ myFeedback: FB, theirFeedback: FB, theirFeedbackPostRequest: { status: 'accepted' } });
  expect('accepted request relabels stage 4', labels(accepted).includes('Post accepted'), labels(accepted));

  const posted = mk({ status: 'posted', myFeedback: FB, theirFeedback: FB, theirFeedbackPostRequest: { status: 'posted' } });
  expect('posted: all five done', states(posted) === 'done,done,done,done,done', states(posted));

  const declined = mk({ myFeedback: FB, theirFeedback: FB, theirFeedbackPostRequest: { status: 'declined' } });
  expect('declined request blocks the tail', states(declined) === 'done,done,done,blocked,blocked', states(declined));
  expect('declined request is labeled', labels(declined).includes('Post declined'), labels(declined));

  expect('queued match has no pipeline', matchPipelineStages(mk({ status: 'queued_next_month' })) === null);
  expect('cancelled-before-progress has no pipeline', matchPipelineStages(mk({ status: 'cancelled' })) === null);

  const cancelledMid = mk({ status: 'cancelled', myFeedback: FB });
  expect('cancelled mid-flight keeps progress, blocks the rest',
    states(cancelledMid) === 'done,done,blocked,blocked,blocked', states(cancelledMid));
}

console.log('\n[wiring]');
{
  const dash = readFileSync(new URL('./src/components/fivestarz/DashboardPage.jsx', import.meta.url), 'utf8');
  expect('DashboardPage renders <MatchPipeline> inside each match card', dash.includes('<MatchPipeline match={m}'));
  const how = readFileSync(new URL('./src/components/fivestarz/HowPage.jsx', import.meta.url), 'utf8');
  expect('HowPage roadmap: pipeline moved to Live in Beta', how.includes('Feedback status pipeline') && !how.includes('Full feedback status pipeline'));
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
