// Live verification for Phase 19 — review solicitation retired.
//
// Asserts: the three solicitation RPCs are gone, review_post_requests is now
// external_review_reports, a match with both feedbacks in lands on 'completed'
// rather than 'awaiting_post', a member can report an external review in
// either direction, the other participant reporting the same thing confirms
// it with no admin action, outsiders cannot report, and the reporter can
// retract. Plus the source-level wiring.
//
//   node verify-phase19.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const tempUserIds = [];

async function mkUser(tag, plan = 'bloom') {
  const email = `verify19-${tag}-${rand}@example.com`;
  const password = 'Verify19!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  tempUserIds.push(id);
  await admin.from('user_profiles').update({ plan_code: plan }).eq('user_id', id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn(${tag}): ${sErr.message}`);
  return { id, client };
}

async function mkAsset(user, name, channel) {
  const { data, error } = await user.client.rpc('create_asset', {
    p_name: name,
    p_public_url: `https://example.com/${name.toLowerCase().replace(/\W+/g, '-')}`,
    p_asset_type: 'digital_product_saas',
    p_description: 'Verification fixture.',
    p_channels: [channel],
    p_feedback_formats: ['written'],
  });
  if (error) throw new Error(`create_asset(${name}): ${error.message}`);
  return data;
}

const reportRow = async (matchId) =>
  (await admin.from('external_review_reports').select('*').eq('match_id', matchId).maybeSingle()).data;

try {
  console.log('\n[schema — the ask is gone, the record remains]');
  {
    const { error: tblOld } = await admin.from('review_post_requests').select('id').limit(1);
    expect('review_post_requests no longer exists', !!tblOld, 'table still queryable');

    const { error: tblNew } = await admin.from('external_review_reports').select('id').limit(1);
    expect('external_review_reports exists', !tblNew, tblNew?.message ?? '');

    for (const fn of ['request_review_post', 'respond_review_post_request', 'mark_review_posted']) {
      const { error } = await admin.rpc(fn, {});
      expect(`${fn} is dropped`, !!error, 'still callable');
    }

    // Calling with the real signature and a bogus match proves the function
    // exists and ran: a missing function fails in PostgREST, not in plpgsql.
    const { error: newFn } = await admin.rpc('report_external_review', {
      p_match_id: '00000000-0000-0000-0000-000000000000', p_channel_name: 'Google',
      p_i_am_the_author: true, p_posted_url: null,
    });
    expect('report_external_review exists and runs', !!newFn && /match not found|authentication required/i.test(newFn.message),
      newFn?.message ?? 'no error');
  }

  console.log('\n[lifecycle — a finished match is completed, not awaiting a post]');
  const a = await mkUser('a');
  const b = await mkUser('b');
  const assetA = await mkAsset(a, `A-${rand}`, 'Google');
  const assetB = await mkAsset(b, `B-${rand}`, 'Google');

  const { data: matchId, error: mErr } = await a.client.rpc('create_match', {
    p_other_user_id: b.id, p_my_asset_id: assetA, p_their_asset_id: assetB, p_source: 'browse',
  });
  if (mErr) throw new Error(`create_match: ${mErr.message}`);

  {
    const { error: fa } = await a.client.rpc('submit_feedback', { p_match_id: matchId, p_written_feedback: 'Clear positioning, weak pricing page.' });
    const { error: fb } = await b.client.rpc('submit_feedback', { p_match_id: matchId, p_written_feedback: 'Strong demo, the hero copy buries the offer.' });
    expect('both members can submit feedback', !fa && !fb, fa?.message || fb?.message || '');

    const { data: m } = await admin.from('matches').select('status').eq('id', matchId).single();
    expect("match lands on 'completed'", m.status === 'completed', `status = ${m.status}`);
  }

  console.log('\n[reporting — either direction, corroboration confirms]');
  {
    const { error } = await a.client.rpc('report_external_review', {
      p_match_id: matchId, p_channel_name: 'Google', p_i_am_the_author: true, p_posted_url: 'https://example.com/r/1',
    });
    expect('author can report their own outside review', !error, error?.message ?? '');

    const row = await reportRow(matchId);
    expect('row records author, subject and reporter',
      row?.author_user_id === a.id && row?.subject_user_id === b.id && row?.reported_by_user_id === a.id,
      JSON.stringify(row));
    expect("single report sits at 'reported'", row?.status === 'reported', row?.status);
    expect('posted_url captured', row?.posted_url === 'https://example.com/r/1', row?.posted_url);
  }

  {
    const { error } = await b.client.rpc('report_external_review', {
      p_match_id: matchId, p_channel_name: 'Google', p_i_am_the_author: false, p_posted_url: null,
    });
    expect('the subject can report the same review', !error, error?.message ?? '');

    const row = await reportRow(matchId);
    expect("corroborated report auto-confirms", row?.status === 'confirmed', row?.status);
    expect('corroborator recorded', row?.corroborated_by_user_id === b.id, String(row?.corroborated_by_user_id));
    expect('confirmed_at set', !!row?.confirmed_at, String(row?.confirmed_at));
    expect('no duplicate row created', (await admin.from('external_review_reports').select('id').eq('match_id', matchId)).data.length === 1);
  }

  console.log('\n[guards]');
  {
    const c = await mkUser('c');
    const { error } = await c.client.rpc('report_external_review', {
      p_match_id: matchId, p_channel_name: 'Google', p_i_am_the_author: true, p_posted_url: null,
    });
    expect('a non-participant cannot report', !!error && /only match participants/i.test(error.message), error?.message ?? 'succeeded');

    const row = await reportRow(matchId);
    const { error: rErr } = await b.client.rpc('retract_external_review_report', { p_report_id: row.id });
    expect('the non-reporter cannot retract', !!rErr, 'succeeded');

    const { error: rOk } = await a.client.rpc('retract_external_review_report', { p_report_id: row.id });
    expect('the reporter can retract', !rOk, rOk?.message ?? '');
    expect("retracted status persists", (await reportRow(matchId))?.status === 'retracted');
  }

  console.log('\n[wiring]');
  {
    const data = readFileSync(new URL('./src/lib/fivestarz/data.js', import.meta.url), 'utf8');
    expect('data.js drops requestReviewPost', !data.includes('requestReviewPost'));
    expect('data.js exports reportExternalReview', data.includes('export async function reportExternalReview'));
    expect('data.js reads external_review_reports', data.includes('external_review_reports') && !data.includes('review_post_requests'));

    const dash = readFileSync(new URL('./src/components/fivestarz/DashboardPage.jsx', import.meta.url), 'utf8');
    expect('dashboard no longer offers "Request Post"', !dash.includes('Request Post'));
    expect('dashboard offers recording an outside review', dash.includes('Record an outside review'));

    const pipe = readFileSync(new URL('./src/lib/fivestarz/match-pipeline.js', import.meta.url), 'utf8');
    expect('pipeline drops the post stages', !pipe.includes('post_requested') && !pipe.includes('"posted"'));

    const seed = readFileSync(new URL('./seed-demo.mjs', import.meta.url), 'utf8');
    expect('seed script uses the reporting RPC', seed.includes('report_external_review') && !seed.includes('request_review_post'));
  }
} catch (err) {
  bad('harness', err.message);
} finally {
  for (const id of tempUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
