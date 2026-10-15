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
const mk = (over = {}) => ({ status: 'matched', myFeedback: null, theirFeedback: null, ...over });

console.log('\n[derivation — lifecycle scenarios]');
{
  // Phase 19 removed the "Post requested" and "Posted" stages: the platform
  // does not tell members a match is unfinished until a public review exists.
  expect('4 stages defined', PIPELINE_STAGES.length === 4, String(PIPELINE_STAGES.length));
  expect('no post stages remain', !PIPELINE_STAGES.some((s) => /post/i.test(s.key)),
    PIPELINE_STAGES.map((s) => s.key).join(','));

  expect('fresh match: matched done, your feedback current',
    states(mk()) === 'done,current,pending,pending', states(mk()));

  expect('my feedback sent: their feedback current',
    states(mk({ myFeedback: FB })) === 'done,done,current,pending', states(mk({ myFeedback: FB })));

  expect('their feedback first still shows my side current',
    states(mk({ theirFeedback: FB })) === 'done,current,done,pending', states(mk({ theirFeedback: FB })));

  const both = mk({ myFeedback: FB, theirFeedback: FB });
  expect('both submitted: the pipeline is complete',
    states(both) === 'done,done,done,done', states(both));
  expect('final stage is Complete', labels(both).endsWith('Complete'), labels(both));

  expect('queued match has no pipeline', matchPipelineStages(mk({ status: 'queued_next_month' })) === null);
  expect('cancelled-before-progress has no pipeline', matchPipelineStages(mk({ status: 'cancelled' })) === null);

  const cancelledMid = mk({ status: 'cancelled', myFeedback: FB });
  expect('cancelled mid-flight keeps progress, blocks the rest',
    states(cancelledMid) === 'done,done,blocked,blocked', states(cancelledMid));
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
