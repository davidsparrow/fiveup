// Live verification for Phase 10b — asset visibility section of /account/public.
//
// Authed member drives the per-asset visibility control; asserts the page
// renders the asset list + control, that set_asset_visibility is reflected in
// the anon asset projection, and that a moderation-removed asset can't be made
// public.
//
//   BASE_URL=http://localhost:3210 node verify-phase10b.mjs

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
  const email = `verify10b-${tag}-${rand}@example.com`;
  const password = 'Verify10b!' + rand;
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
const slugOf = async (id) => (await admin.from('assets').select('public_slug').eq('id', id).single()).data.public_slug;
const publicAsset = (slug) => anon.rpc('get_public_asset', { p_slug: slug }).then((r) => r.data ?? []);

try {
  await waitForServer();

  const owner = await mkUser('owner', { plan: 'bloom' });
  await owner.client.rpc('update_my_profile', { p_display_name: 'Asset Owner', p_bio: 'x' });
  const ck = cookie(owner.session);

  const A1 = `Visible Asset ${rand}`;
  const A2 = `Removed Asset ${rand}`;
  const { data: id1 } = await owner.client.rpc('create_asset', { p_name: A1, p_public_url: `https://ex.com/a1-${rand}`, p_asset_type: 'digital_product_saas' });
  const { data: id2 } = await owner.client.rpc('create_asset', { p_name: A2, p_public_url: `https://ex.com/a2-${rand}`, p_asset_type: 'digital_product_saas' });
  await admin.from('assets').update({ moderation_status: 'removed' }).eq('id', id2);

  console.log('\n[authed page renders asset list + control]');
  {
    const html = await (await get('/account/public', { cookie: ck })).text();
    expect('renders the assets section', html.includes('Your assets'));
    expect('lists asset A1', html.includes(A1));
    expect('lists (removed) asset A2 with Removed badge', html.includes(A2) && html.includes('Removed'));
    expect('renders a visibility <select>', /<select/.test(html) && html.includes('Members only'));
  }

  console.log('\n[set_asset_visibility -> anon asset projection]');
  {
    expect('A1 not public initially (member_only)', (await publicAsset(await slugOf(id1))).length === 0);

    await owner.client.rpc('set_asset_visibility', { p_asset_id: id1, p_visibility: 'public' });
    const slug1 = await slugOf(id1);
    expect('publishing A1 -> visible to anon at /a/slug', (await publicAsset(slug1)).length === 1, `slug=${slug1}`);

    await owner.client.rpc('set_asset_visibility', { p_asset_id: id1, p_visibility: 'private' });
    expect('setting A1 private -> hidden from anon', (await publicAsset(slug1)).length === 0);
  }

  console.log('\n[moderation-removed asset cannot be made public]');
  {
    const { error } = await owner.client.rpc('set_asset_visibility', { p_asset_id: id2, p_visibility: 'public' });
    expect('set_asset_visibility(public) rejected for removed asset', !!error, 'expected an error');
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
