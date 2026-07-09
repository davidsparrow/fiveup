// Live verification for Phase 10d — external-links editor on /account/public.
//
// Authed member drives add / remove / reorder + the show-links toggle; asserts
// the page renders the editor and that the RPCs are reflected in the anon
// get_public_links projection (gated by show_external_links).
//
//   BASE_URL=http://localhost:3210 node verify-phase10d.mjs

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
  const email = `verify10d-${tag}-${rand}@example.com`;
  const password = 'Verify10d!' + rand;
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
const pubLinks = (u) => anon.rpc('get_public_links', { p_username: u }).then((r) => r.data ?? []);

const HANDLE = `linkeditor${rand}`.replace(/[^a-z0-9]/g, '').slice(0, 28);
const U1 = `https://one-${rand}.example.com`;
const U2 = `https://two-${rand}.example.com`;

try {
  await waitForServer();

  const owner = await mkUser('owner');
  await owner.client.rpc('update_my_profile', { p_display_name: 'Link Editor', p_bio: 'x' });
  await owner.client.rpc('claim_public_username', { p_username: HANDLE });
  await owner.client.rpc('update_publishing_settings', { p_profile_public_enabled: true });
  // seed one existing link so the editor renders a row
  await owner.client.rpc('add_external_link', { p_url: U1, p_label: 'One' });
  const ck = cookie(owner.session);

  console.log('\n[authed page renders the links editor]');
  {
    const html = await (await get('/account/public', { cookie: ck })).text();
    expect('renders the External links section', html.includes('External links'));
    expect('shows the existing link', html.includes(U1) || html.includes('One'));
    expect('renders the add-link form', html.includes('https://your-site.com'));
    expect('renders the show-links toggle', html.includes('Show links on my public profile'));
  }

  console.log('\n[add + show toggle -> anon get_public_links]');
  {
    expect('links hidden while show_external_links off', (await pubLinks(HANDLE)).length === 0);
    await owner.client.rpc('update_publishing_settings', { p_show_external_links: true });
    const shown = await pubLinks(HANDLE);
    expect('seeded link now public', shown.some((l) => l.url === U1), JSON.stringify(shown));

    const { data: id2, error: addErr } = await owner.client.rpc('add_external_link', { p_url: U2, p_label: 'Two' });
    expect('add_external_link succeeds', !addErr && !!id2, addErr && addErr.message);
    expect('added link appears publicly', (await pubLinks(HANDLE)).some((l) => l.url === U2));

    // reorder: U2 before U1
    const current = await pubLinks(HANDLE);
    expect('two links public', current.length === 2, `count=${current.length}`);
  }

  console.log('\n[remove -> disappears]');
  {
    const { data: rows } = await admin.from('profile_external_links').select('id, url').eq('user_id', owner.id);
    const one = rows.find((r) => r.url === U1);
    await owner.client.rpc('remove_external_link', { p_id: one.id });
    expect('removed link no longer public', !(await pubLinks(HANDLE)).some((l) => l.url === U1));
  }

  console.log('\n[reorder RPC (as the up/down buttons call it)]');
  {
    const { data: rows } = await admin.from('profile_external_links').select('id, url, sort_order').eq('user_id', owner.id).order('sort_order');
    const ids = rows.map((r) => r.id).reverse();
    const { error: rErr } = await owner.client.rpc('reorder_external_links', { p_ids: ids });
    expect('reorder_external_links succeeds', !rErr, rErr && rErr.message);
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
