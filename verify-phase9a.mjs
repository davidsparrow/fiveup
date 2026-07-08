// Live verification for Phase 9a — per-asset commentary on /a/[slug].
//
// Seeds approved / unapproved / removed / other-asset feedback then drives
// anon RPC + REAL ANONYMOUS HTTP fetches, asserting:
//   - only APPROVED, clean feedback for THIS asset appears
//   - unapproved, moderation-removed, and other-asset feedback never appear
//   - reviewer identity is never exposed (coarse "Verified member" label only)
//   - suspended/removed owner -> commentary empty (and the page 404s)
//
//   BASE_URL=http://localhost:3210 node verify-phase9a.mjs
//   (start `PORT=3210 npm run dev` first)

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

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const userIds = [];

async function mkUser(tag, { plan } = {}) {
  const email = `verify9a-${tag}-${rand}@example.com`;
  const password = 'Verify9a!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  userIds.push(id);
  if (plan) await admin.from('user_profiles').update({ plan_code: plan }).eq('user_id', id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn(${tag}): ${sErr.message}`);
  return { id, email, client };
}

const mkThrowawayAsset = async (uid) =>
  (await admin.from('assets').insert({ owner_user_id: uid, name: 'r', public_url: `https://ex.com/r-${uid}-${rand}`, asset_type: 'digital_product_saas', status: 'archived' }).select('id').single()).data.id;

async function mkPublicAsset(owner, name) {
  const { data: id, error: cErr } = await owner.client.rpc('create_asset', { p_name: name, p_public_url: `https://ex.com/${name}-${rand}`, p_asset_type: 'digital_product_saas' });
  if (cErr) throw new Error(`create_asset(${name}): ${cErr.message}`);
  const { error: vErr } = await owner.client.rpc('set_asset_visibility', { p_asset_id: id, p_visibility: 'public' });
  if (vErr) throw new Error(`set_asset_visibility(${name}): ${vErr.message}`);
  const { data: row } = await admin.from('assets').select('public_slug').eq('id', id).single();
  return { id, slug: row.public_slug };
}

// A reviewer leaves feedback about owner's asset via a seeded match, returns fsId.
async function leaveFeedback(reviewer, owner, assetId, { stars, text }) {
  const { data: match } = await admin.from('matches').insert({
    member_a_user_id: reviewer.id, member_b_user_id: owner.id,
    member_a_asset_id: await mkThrowawayAsset(reviewer.id), member_b_asset_id: assetId,
    source: 'browse', status: 'matched',
  }).select('id').single();
  const { data: fsId, error } = await reviewer.client.rpc('submit_feedback', { p_match_id: match.id, p_stars: stars, p_written_feedback: text });
  if (error) throw new Error(`submit_feedback: ${error.message}`);
  return fsId;
}

async function waitForServer(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/`, { redirect: 'manual' }); if (r.status > 0) return true; } catch {}
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`dev server never became reachable at ${BASE}`);
}
const get = (path) => fetch(`${BASE}${path}`, { redirect: 'manual' });
const commentary = (slug) => anon.rpc('get_public_asset_feedback', { p_slug: slug }).then((r) => r.data ?? []);

try {
  await waitForServer();

  const owner = await mkUser('owner', { plan: 'bloom' }); // paid: allows >1 asset
  const rv1 = await mkUser('rv1');
  const rv2 = await mkUser('rv2');
  const rv3 = await mkUser('rv3');
  await owner.client.rpc('update_my_profile', { p_display_name: 'Asset Owner', p_bio: 'x' });

  const PA = await mkPublicAsset(owner, 'Main Asset');
  const PA2 = await mkPublicAsset(owner, 'Other Asset');

  const APPROVED = `APPROVED-commentary-${rand}`;
  const UNAPPROVED = `UNAPPROVED-commentary-${rand}`;
  const OTHER = `OTHERASSET-commentary-${rand}`;

  const fsApproved = await leaveFeedback(rv1, owner, PA.id, { stars: 5, text: APPROVED });
  await owner.client.rpc('approve_public_feedback', { p_source_type: 'match_feedback', p_source_id: fsApproved, p_approved: true });

  const fsUnapproved = await leaveFeedback(rv2, owner, PA.id, { stars: 4, text: UNAPPROVED }); // never approved

  const fsOther = await leaveFeedback(rv3, owner, PA2.id, { stars: 5, text: OTHER });
  await owner.client.rpc('approve_public_feedback', { p_source_type: 'match_feedback', p_source_id: fsOther, p_approved: true });

  console.log('\n[anon RPC — only approved, clean, this-asset feedback]');
  {
    const rows = await commentary(PA.slug);
    expect('approved feedback for this asset appears', rows.some((r) => r.body === APPROVED && r.stars === 5), JSON.stringify(rows));
    expect('unapproved feedback does NOT appear', !rows.some((r) => r.body === UNAPPROVED));
    expect('other-asset feedback does NOT appear here', !rows.some((r) => r.body === OTHER));
    expect('rows carry only body/stars/created_at (no reviewer field)', rows.every((r) => Object.keys(r).sort().join() === 'body,created_at,stars'), JSON.stringify(rows?.[0]));
    const other = await commentary(PA2.slug);
    expect('other asset shows its own approved feedback', other.some((r) => r.body === OTHER));
  }

  console.log('\n[anon HTTP GET /a/<slug> — renders commentary safely]');
  {
    const html = await (await get(`/a/${PA.slug}`)).text();
    expect('page renders the approved quote', html.includes(APPROVED));
    expect('page shows the coarse "Verified member" label', html.includes('Verified member'));
    expect('page does NOT render the unapproved quote', !html.includes(UNAPPROVED));
    expect('page does NOT render other-asset quote', !html.includes(OTHER));
    expect('page does NOT leak reviewer email', !html.includes(rv1.email));
    expect('page does NOT leak reviewer user_id', !html.includes(rv1.id));
  }

  console.log('\n[moderation + owner suppression]');
  {
    await admin.from('feedback_submissions').update({ moderation_status: 'removed' }).eq('id', fsApproved);
    expect('moderation-removed feedback disappears', !(await commentary(PA.slug)).some((r) => r.body === APPROVED));
    await admin.from('feedback_submissions').update({ moderation_status: 'ok' }).eq('id', fsApproved);
    expect('restored feedback reappears', (await commentary(PA.slug)).some((r) => r.body === APPROVED));

    await admin.from('user_profiles').update({ account_status: 'suspended' }).eq('user_id', owner.id);
    expect('suspended owner -> commentary empty', (await commentary(PA.slug)).length === 0);
    expect('suspended owner -> asset page 404', (await get(`/a/${PA.slug}`)).status === 404);
    await admin.from('user_profiles').update({ account_status: 'active' }).eq('user_id', owner.id);
    expect('reactivated owner -> commentary returns', (await commentary(PA.slug)).some((r) => r.body === APPROVED));
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
