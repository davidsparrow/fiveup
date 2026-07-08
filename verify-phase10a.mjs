// Live verification for Phase 10a — /account/public profile publishing UI.
//
// Drives the settings page as an authenticated member (forged @supabase/ssr
// cookie, as in 8e) and asserts:
//   - anon (no cookie) is redirected to /login (route is member-only)
//   - authed page renders current state server-side (claim form pre-handle;
//     @handle + master toggle ON after publishing)
//   - the exact RPCs the UI issues (claim_public_username /
//     update_publishing_settings) are reflected in the anon public projection
//     (get_public_profile): publish on -> visible + stats + searchable; off -> gone
//
//   BASE_URL=http://localhost:3210 node verify-phase10a.mjs
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
  const email = `verify10a-${tag}-${rand}@example.com`;
  const password = 'Verify10a!' + rand;
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
const prof = (u) => anon.rpc('get_public_profile', { p_username: u }).then((r) => r.data ?? []);

const HANDLE = `settings${rand}`.replace(/[^a-z0-9]/g, '').slice(0, 28);

try {
  await waitForServer();

  const owner = await mkUser('owner', { plan: 'bloom' }); // paid: searchable available
  await owner.client.rpc('update_my_profile', { p_display_name: 'Settings Owner', p_bio: 'x' });
  await admin.from('user_profiles').update({ feedback_rating_avg: 4.6, feedback_rating_count: 3 }).eq('user_id', owner.id);
  const ck = cookie(owner.session);

  console.log('\n[route protection]');
  {
    const r = await get('/account/public'); // no cookie
    expect('anon is redirected (not 200)', r.status >= 300 && r.status < 400, `status=${r.status}`);
    expect('redirect targets /login', (r.headers.get('location') || '').includes('/login'), r.headers.get('location') || '');
  }

  console.log('\n[authed page renders current state — before handle]');
  {
    const html = await (await get('/account/public', { cookie: ck })).text();
    expect('renders the settings page', html.includes('Publishing settings'));
    expect('shows the claim-handle form (no handle yet)', html.includes('Claim handle'));
  }

  console.log('\n[UI RPCs -> public projection]');
  {
    // what the claim form does:
    const { error: cErr } = await owner.client.rpc('claim_public_username', { p_username: HANDLE });
    expect('claim_public_username succeeds', !cErr, cErr && cErr.message);
    // still private until published
    expect('profile not public before publishing', (await prof(HANDLE)).length === 0);

    // what the toggles do:
    await owner.client.rpc('update_publishing_settings', { p_profile_public_enabled: true, p_show_stats: true, p_searchable_public_profile: true });
    const rows = await prof(HANDLE);
    expect('publishing on -> profile visible to anon', rows.length === 1, `rows=${rows.length}`);
    expect('show_stats on -> stats exposed', rows[0] && Number(rows[0].feedback_rating_avg) === 4.6, JSON.stringify(rows[0]?.feedback_rating_avg));
    expect('searchable on (paid) -> searchable true', rows[0] && rows[0].searchable === true, `searchable=${rows[0]?.searchable}`);
  }

  console.log('\n[authed page reflects published state]');
  {
    const html = await (await get('/account/public', { cookie: ck })).text();
    // React splits `@{handle}` with a comment marker, so match the handle itself
    // + confirm the claim form is gone (the "has handle" branch is rendering).
    expect('shows the claimed handle (claim form replaced)', html.includes(HANDLE) && !html.includes('Claim handle'));
    expect('master toggle rendered ON (aria-checked=true)', /aria-checked="true"/.test(html), 'no on-toggle found');
    expect('links to the public profile', html.includes(`/u/${HANDLE}`));
  }

  console.log('\n[toggling publish off hides it again]');
  {
    await owner.client.rpc('update_publishing_settings', { p_profile_public_enabled: false });
    expect('publishing off -> profile hidden from anon', (await prof(HANDLE)).length === 0);
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
