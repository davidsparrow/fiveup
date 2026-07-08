// Live verification for Phase 10c — feedback approval section of /account/public.
//
// Authed member drives the per-item approve toggle; asserts the page lists
// received feedback (match + engaged review) and that approve_public_feedback
// is reflected in the anon get_public_feedback projection.
//
//   BASE_URL=http://localhost:3210 node verify-phase10c.mjs

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
const BASE = process.env.BASE_URL || 'http://localhost:3210';
const REF = URL_.replace('https://', '').split('.')[0];

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const userIds = [];

async function mkUser(tag, { plan } = {}) {
  const email = `verify10c-${tag}-${rand}@example.com`;
  const password = 'Verify10c!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  userIds.push(id);
  if (plan) await admin.from('user_profiles').update({ plan_code: plan }).eq('user_id', id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn(${tag}): ${sErr.message}`);
  const { data: { session } } = await client.auth.getSession();
  return { id, email, client, session };
}

function cookie(session) {
  const key = `sb-${REF}-auth-token`;
  const value = 'base64-' + Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  const SIZE = 3180;
  if (value.length <= SIZE) return `${key}=${value}`;
  const parts = [];
  for (let i = 0, rest = value; rest.length; i++) { parts.push(`${key}.${i}=${rest.slice(0, SIZE)}`); rest = rest.slice(SIZE); }
  return parts.join('; ');
}

async function waitForServer(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/`, { redirect: 'manual' }); if (r.status > 0) return true; } catch {}
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`dev server never became reachable at ${BASE}`);
}
const get = (path, headers = {}) => fetch(`${BASE}${path}`, { redirect: 'manual', headers });
const feed = (u) => anon.rpc('get_public_feedback', { p_username: u }).then((r) => r.data ?? []);
const mkAsset = async (uid) => (await admin.from('assets').insert({ owner_user_id: uid, name: 'x', public_url: `https://ex.com/x-${uid}-${rand}`, asset_type: 'digital_product_saas', status: 'archived' }).select('id').single()).data.id;

const HANDLE = `fbowner${rand}`.replace(/[^a-z0-9]/g, '').slice(0, 28);
const MATCH_TEXT = `MATCH-fb-${rand}`;
const ENGAGED_TEXT = `ENGAGED-fb-${rand}`;

try {
  await waitForServer();

  const owner = await mkUser('owner', { plan: 'bloom' }); // paid: feedback excerpts enabled
  const reviewer = await mkUser('reviewer');
  const buyer = await mkUser('buyer');
  await owner.client.rpc('update_my_profile', { p_display_name: 'Feedback Owner', p_bio: 'x' });
  await owner.client.rpc('claim_public_username', { p_username: HANDLE });
  await owner.client.rpc('update_publishing_settings', { p_profile_public_enabled: true, p_show_feedback_excerpts: true });
  const ck = cookie(owner.session);

  // match feedback about the owner
  const { data: match } = await admin.from('matches').insert({
    member_a_user_id: reviewer.id, member_b_user_id: owner.id,
    member_a_asset_id: await mkAsset(reviewer.id), member_b_asset_id: await mkAsset(owner.id),
    source: 'browse', status: 'matched',
  }).select('id').single();
  const { data: fsId } = await reviewer.client.rpc('submit_feedback', { p_match_id: match.id, p_stars: 5, p_written_feedback: MATCH_TEXT });

  // engaged review about the owner
  const { data: listing } = await owner.client.rpc('create_proof_lab_listing', { p_title: `L-${rand}`, p_description: 'd', p_category_slug: 'automation' });
  const { data: deal } = await admin.from('proof_lab_deal_requests').insert({ listing_id: listing, requester_user_id: buyer.id, seller_user_id: owner.id, requester_email: 'b@ex.com', status: 'completed' }).select('id').single();
  const { data: reviewId } = await buyer.client.rpc('create_proof_lab_review', { p_deal_id: deal.id, p_stars: 5, p_written: ENGAGED_TEXT });

  console.log('\n[authed page lists received feedback]');
  {
    const html = await (await get('/account/public', { cookie: ck })).text();
    expect('renders the Public feedback section', html.includes('Public feedback'));
    expect('lists the match feedback body', html.includes(MATCH_TEXT));
    expect('lists the engaged review body', html.includes(ENGAGED_TEXT));
  }

  console.log('\n[approve match feedback -> public projection]');
  {
    expect('nothing public before approval', (await feed(HANDLE)).length === 0);
    await owner.client.rpc('approve_public_feedback', { p_source_type: 'match_feedback', p_source_id: fsId, p_approved: true });
    expect('approved match feedback appears publicly', (await feed(HANDLE)).some((r) => r.body === MATCH_TEXT && r.source === 'match'));
    await owner.client.rpc('approve_public_feedback', { p_source_type: 'match_feedback', p_source_id: fsId, p_approved: false });
    expect('un-approving hides it again', !(await feed(HANDLE)).some((r) => r.body === MATCH_TEXT));
  }

  console.log('\n[approve engaged review -> public projection]');
  {
    await owner.client.rpc('approve_public_feedback', { p_source_type: 'engaged_review', p_source_id: reviewId, p_approved: true });
    expect('approved engaged review appears publicly', (await feed(HANDLE)).some((r) => r.body === ENGAGED_TEXT && r.source === 'engaged_review'));
  }

  console.log('\n[authed page reflects approval state]');
  {
    const html = await (await get('/account/public', { cookie: ck })).text();
    // engaged review is approved now -> at least one "Public" label present
    expect('page shows a Public (approved) state', html.includes('Public') && /aria-checked="true"/.test(html));
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  await admin.from('proof_lab_deal_requests').delete().in('seller_user_id', userIds);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
