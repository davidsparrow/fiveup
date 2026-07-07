// Live verification for Phase 8d — public asset page /a/[slug].
//
// Seeds public assets then drives REAL ANONYMOUS HTTP fetches against the dev
// server, asserting:
//   - public + clean asset -> 200 with asset projection, noindex
//   - owner identity ALWAYS shown; /u/[handle] link appears ONLY when the
//     owner's own profile is public (asset visibility is independent of it)
//   - private / member_only / moderation-removed / suspended-owner / bad slug
//     -> 404, and the 404 renders the ErrorShell
//   - no owner internals (email / plan_code / user_id) leak into the HTML
//
//   BASE_URL=http://localhost:3210 node verify-phase8d.mjs
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

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const userIds = [];

async function mkUser(tag, { plan } = {}) {
  const email = `verify8d-${tag}-${rand}@example.com`;
  const password = 'Verify8d!' + rand;
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

async function mkPublicAsset(owner, { name, description }) {
  const { data: id, error } = await owner.client.rpc('create_asset', { p_name: name, p_public_url: `https://ex.com/${encodeURIComponent(name)}-${rand}`, p_asset_type: 'digital_product_saas' });
  if (error) throw new Error(`create_asset: ${error.message}`);
  if (description) await admin.from('assets').update({ description }).eq('id', id);
  await owner.client.rpc('set_asset_visibility', { p_asset_id: id, p_visibility: 'public' });
  const { data: row } = await admin.from('assets').select('public_slug').eq('id', id).single();
  return { id, slug: row.public_slug };
}

async function waitForServer(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/`, { redirect: 'manual' }); if (r.status > 0) return true; } catch {}
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`dev server never became reachable at ${BASE}`);
}
const get = (path) => fetch(`${BASE}${path}`, { redirect: 'manual' });

try {
  await waitForServer();

  // Owner A: PUBLIC profile + public asset -> identity links to /u/[handle]
  const HANDLE = `assetowner${rand}`.replace(/[^a-z0-9]/g, '').slice(0, 28);
  const pubOwner = await mkUser('pubowner', { plan: 'bloom' });
  await pubOwner.client.rpc('update_my_profile', { p_display_name: 'Dana Public', p_bio: 'x' });
  await pubOwner.client.rpc('claim_public_username', { p_username: HANDLE });
  await pubOwner.client.rpc('update_publishing_settings', { p_profile_public_enabled: true });
  const pubAsset = await mkPublicAsset(pubOwner, { name: 'Public Case Study', description: 'A deep dive into our launch strategy and what we learned.' });

  // Owner B: PRIVATE profile + public asset -> identity shows WITHOUT a link
  const privOwner = await mkUser('privowner');
  await privOwner.client.rpc('update_my_profile', { p_display_name: 'Riley Private', p_bio: 'y' });
  const privAsset = await mkPublicAsset(privOwner, { name: 'Solo Public Asset', description: 'Public asset under a private profile.' });

  console.log('\n[public asset under a PUBLIC profile — 200 + linked identity]');
  {
    const r = await get(`/a/${pubAsset.slug}`);
    const html = await r.text();
    expect('public asset returns 200', r.status === 200, `status=${r.status}`);
    expect('renders asset name', html.includes('Public Case Study'));
    expect('renders description', html.includes('what we learned'));
    expect('renders owner display name', html.includes('Dana Public'));
    expect('owner name links to /u/[handle]', html.includes(`/u/${HANDLE}`), 'profile link missing');
    expect('asset page is noindex', /name="robots"[^>]*content="[^"]*noindex/i.test(html), 'noindex absent');
    expect('does NOT leak owner email', !html.includes(pubOwner.email));
    expect('does NOT leak plan_code', !/plan_code/.test(html) && !html.includes('bloom'));
    expect('does NOT leak user_id', !html.includes(pubOwner.id));
  }

  console.log('\n[public asset under a PRIVATE profile — 200 + unlinked identity]');
  {
    const r = await get(`/a/${privAsset.slug}`);
    const html = await r.text();
    expect('asset public even though profile is private -> 200', r.status === 200, `status=${r.status}`);
    expect('renders asset name', html.includes('Solo Public Asset'));
    expect('renders owner display name (unlinked)', html.includes('Riley Private'));
    expect('NO /u/ profile link for private-profile owner', !/href="\/u\//.test(html), 'unexpected profile link');
  }

  console.log('\n[non-public / suppressed assets — 404]');
  {
    expect('unknown slug -> 404', (await get(`/a/nosuch-${rand}`)).status === 404);

    await admin.from('assets').update({ visibility: 'member_only' }).eq('id', pubAsset.id);
    expect('member_only asset -> 404', (await get(`/a/${pubAsset.slug}`)).status === 404);
    await admin.from('assets').update({ visibility: 'private' }).eq('id', pubAsset.id);
    expect('private asset -> 404', (await get(`/a/${pubAsset.slug}`)).status === 404);
    await admin.from('assets').update({ visibility: 'public', moderation_status: 'removed' }).eq('id', pubAsset.id);
    expect('moderation-removed asset -> 404', (await get(`/a/${pubAsset.slug}`)).status === 404);
    await admin.from('assets').update({ moderation_status: 'ok' }).eq('id', pubAsset.id);

    await admin.from('user_profiles').update({ account_status: 'suspended' }).eq('user_id', pubOwner.id);
    expect('suspended owner hides their public asset -> 404', (await get(`/a/${pubAsset.slug}`)).status === 404);
    await admin.from('user_profiles').update({ account_status: 'active', moderation_status: 'removed' }).eq('user_id', pubOwner.id);
    expect('moderation-removed owner hides their public asset -> 404', (await get(`/a/${pubAsset.slug}`)).status === 404);
    await admin.from('user_profiles').update({ moderation_status: 'ok' }).eq('user_id', pubOwner.id);
    expect('restored owner + asset -> 200 again', (await get(`/a/${pubAsset.slug}`)).status === 200);
  }

  console.log('\n[404 renders the ErrorShell]');
  {
    const html = await (await get(`/a/nosuch-${rand}`)).text();
    expect('404 body renders ErrorShell copy', /couldn't find that page|couldn’t find that page/i.test(html));
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
