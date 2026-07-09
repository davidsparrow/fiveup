// Live verification for Phase 11a — brand_visibility enforcement on /a/[slug].
//
// Asserts: while an asset is 'hidden_until_feedback_complete' AND the owner has
// the paid feature, the public asset page hides the owner's identity (name,
// handle, link) and marks owner_hidden; owner reveal (-> visible) restores it;
// losing the paid feature stops the hiding. Also that the settings page shows
// the per-asset control.
//
//   BASE_URL=http://localhost:3210 node verify-phase11a.mjs

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
  const email = `verify11a-${tag}-${rand}@example.com`;
  const password = 'Verify11a!' + rand;
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
const assetRpc = (slug) => anon.rpc('get_public_asset', { p_slug: slug }).then((r) => r.data?.[0] ?? null);

const HANDLE = `brandowner${rand}`.replace(/[^a-z0-9]/g, '').slice(0, 28);
const NAME = 'Brand Owner';

try {
  await waitForServer();

  const owner = await mkUser('owner', { plan: 'bloom' }); // bloom has brand_visibility_enabled
  await owner.client.rpc('update_my_profile', { p_display_name: NAME, p_bio: 'x' });
  await owner.client.rpc('claim_public_username', { p_username: HANDLE });
  await owner.client.rpc('update_publishing_settings', { p_profile_public_enabled: true });
  const { data: assetId } = await owner.client.rpc('create_asset', { p_name: 'Brand Asset', p_public_url: `https://ex.com/b-${rand}`, p_asset_type: 'digital_product_saas' });
  await owner.client.rpc('set_asset_visibility', { p_asset_id: assetId, p_visibility: 'public' });
  const { data: row } = await admin.from('assets').select('public_slug').eq('id', assetId).single();
  const SLUG = row.public_slug;
  const ck = cookie(owner.session);

  console.log('\n[identity visible by default]');
  {
    const a = await assetRpc(SLUG);
    expect('owner name shown', a && a.owner_display_name === NAME, JSON.stringify(a));
    expect('owner_hidden false', a && a.owner_hidden === false);
    const html = await (await get(`/a/${SLUG}`)).text();
    expect('page shows owner name', html.includes(NAME));
  }

  console.log('\n[hidden_until_feedback_complete -> identity hidden]');
  {
    await owner.client.rpc('set_asset_brand_visibility', { p_asset_id: assetId, p_value: 'hidden_until_feedback_complete' });
    const a = await assetRpc(SLUG);
    expect('owner name null when hidden', a && a.owner_display_name === null, JSON.stringify(a));
    expect('owner_username null when hidden', a && a.owner_username === null);
    expect('owner_hidden true', a && a.owner_hidden === true);
    const html = await (await get(`/a/${SLUG}`)).text();
    expect('page no longer shows owner name', !html.includes(NAME));
    expect('page shows "Shared anonymously"', html.includes('Shared anonymously'));
    expect('page still renders the asset (200)', html.includes('Brand Asset'));
  }

  console.log('\n[owner reveal -> identity returns]');
  {
    await owner.client.rpc('set_asset_brand_visibility', { p_asset_id: assetId, p_value: 'visible' });
    const a = await assetRpc(SLUG);
    expect('owner name shown again after reveal', a && a.owner_display_name === NAME);
    expect('owner_hidden false again', a && a.owner_hidden === false);
  }

  console.log('\n[paid re-check: downgrade stops the hiding]');
  {
    await owner.client.rpc('set_asset_brand_visibility', { p_asset_id: assetId, p_value: 'hidden_until_feedback_complete' });
    expect('hidden while paid', (await assetRpc(SLUG)).owner_hidden === true);
    await admin.from('user_profiles').update({ plan_code: 'sprout' }).eq('user_id', owner.id); // no brand_visibility_enabled
    const a = await assetRpc(SLUG);
    expect('identity shows after downgrade (feature lost)', a.owner_hidden === false && a.owner_display_name === NAME, JSON.stringify(a));
    await admin.from('user_profiles').update({ plan_code: 'bloom' }).eq('user_id', owner.id);
  }

  console.log('\n[settings page shows the per-asset control]');
  {
    const html = await (await get('/account/public', { cookie: ck })).text();
    expect('renders the brand-visibility control', html.includes('Hide my identity until I reveal it'));
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
