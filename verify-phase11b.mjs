// Live verification for Phase 11b — asset-page indexing (per-asset opt-in).
//
// Asserts: an opted-in public asset under a paid owner is indexable (no noindex
// on /a/<slug>) and appears in /sitemap.xml; a non-opted-in asset stays
// noindex + absent; the write RPC blocks opt-in without the paid feature;
// downgrade stops indexing; settings page renders the control.
//
//   BASE_URL=http://localhost:3210 node verify-phase11b.mjs

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
  const email = `verify11b-${tag}-${rand}@example.com`;
  const password = 'Verify11b!' + rand;
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
const isNoindex = (html) => /name="robots"[^>]*content="[^"]*noindex/i.test(html);
const slugOf = async (id) => (await admin.from('assets').select('public_slug').eq('id', id).single()).data.public_slug;

async function mkPublicAsset(owner, name) {
  const { data: id } = await owner.client.rpc('create_asset', { p_name: name, p_public_url: `https://ex.com/${encodeURIComponent(name)}-${rand}`, p_asset_type: 'digital_product_saas' });
  await owner.client.rpc('set_asset_visibility', { p_asset_id: id, p_visibility: 'public' });
  return id;
}

try {
  await waitForServer();

  const paid = await mkUser('paid', { plan: 'bloom' }); // has public_profile_indexing_enabled
  const free = await mkUser('free'); // sprout: no indexing feature
  await paid.client.rpc('update_my_profile', { p_display_name: 'Paid Owner', p_bio: 'x' });
  await free.client.rpc('update_my_profile', { p_display_name: 'Free Owner', p_bio: 'y' });

  const idIn = await mkPublicAsset(paid, 'Indexed Asset');   // will opt in
  const idOut = await mkPublicAsset(paid, 'Unlisted Asset'); // stays opted out
  const idFree = await mkPublicAsset(free, 'Free Asset');    // free plan

  const slugIn = await slugOf(idIn);
  const slugOut = await slugOf(idOut);
  const slugFree = await slugOf(idFree);

  console.log('\n[opt-in write gating]');
  {
    const { error: freeErr } = await free.client.rpc('set_asset_searchable', { p_asset_id: idFree, p_value: true });
    expect('free plan cannot opt in (RPC blocks)', !!freeErr && /paid/i.test(freeErr.message), `err=${freeErr && freeErr.message}`);
    const { error: paidErr } = await paid.client.rpc('set_asset_searchable', { p_asset_id: idIn, p_value: true });
    expect('paid plan can opt in', !paidErr, paidErr && paidErr.message);
  }

  console.log('\n[indexable flag + robots meta]');
  {
    const inHtml = await (await get(`/a/${slugIn}`)).text();
    expect('opted-in paid asset is indexable (no noindex)', !isNoindex(inHtml), 'unexpected noindex');
    const outHtml = await (await get(`/a/${slugOut}`)).text();
    expect('non-opted-in asset stays noindex', isNoindex(outHtml));
    const freeHtml = await (await get(`/a/${slugFree}`)).text();
    expect('free asset stays noindex', isNoindex(freeHtml));
  }

  console.log('\n[sitemap.xml]');
  {
    const xml = await (await get('/sitemap.xml')).text();
    expect('sitemap includes the opted-in asset', xml.includes(`/a/${slugIn}`), 'indexed asset missing');
    expect('sitemap omits the non-opted-in asset', !xml.includes(`/a/${slugOut}`));
    expect('sitemap omits the free-plan asset', !xml.includes(`/a/${slugFree}`));
  }

  console.log('\n[paid downgrade stops indexing]');
  {
    await admin.from('user_profiles').update({ plan_code: 'sprout' }).eq('user_id', paid.id);
    const inHtml = await (await get(`/a/${slugIn}`)).text();
    expect('downgraded owner asset -> noindex again', isNoindex(inHtml));
    const xml = await (await get('/sitemap.xml')).text();
    expect('downgraded asset drops from sitemap', !xml.includes(`/a/${slugIn}`));
    await admin.from('user_profiles').update({ plan_code: 'bloom' }).eq('user_id', paid.id);
  }

  console.log('\n[settings page renders the searchable control]');
  {
    const html = await (await get('/account/public', { cookie: cookie(paid.session) })).text();
    expect('renders the "Allow search-engine indexing" control', html.includes('Allow search-engine indexing'));
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
