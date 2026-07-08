// Live verification for Phase 9c — SEO rollout.
//
// Asserts, over real HTTP against the dev server:
//   - /robots.txt allows crawling but disallows member/app routes + links sitemap
//   - /sitemap.xml lists a SEARCHABLE public profile and OMITS a non-searchable
//     one (and includes a public marketing route)
//   - list_searchable_profiles (anon RPC) gates the same way
//   - a searchable profile page is indexable + carries canonical, OG/Twitter
//     tags, and Person JSON-LD; a non-searchable one is noindex
//   - dynamic OG image routes return image/png
//   - the public asset page stays noindex but still ships canonical + OG
//
//   BASE_URL=http://localhost:3210 node verify-phase9c.mjs
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
  const email = `verify9c-${tag}-${rand}@example.com`;
  const password = 'Verify9c!' + rand;
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

async function waitForServer(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/`, { redirect: 'manual' }); if (r.status > 0) return true; } catch {}
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`dev server never became reachable at ${BASE}`);
}
const get = (path) => fetch(`${BASE}${path}`, { redirect: 'manual' });

const HS = `seosearch${rand}`.replace(/[^a-z0-9]/g, '').slice(0, 28);
const HN = `seononsearch${rand}`.replace(/[^a-z0-9]/g, '').slice(0, 28);

try {
  await waitForServer();

  // Searchable profile (paid indexing + toggle) + a public asset.
  const s = await mkUser('search', { plan: 'bloom' });
  await s.client.rpc('update_my_profile', { p_display_name: 'Searchable Sam', p_bio: 'Indexable founder profile.' });
  await s.client.rpc('claim_public_username', { p_username: HS });
  await s.client.rpc('update_publishing_settings', { p_profile_public_enabled: true, p_searchable_public_profile: true });
  const { data: assetId } = await s.client.rpc('create_asset', { p_name: 'Indexed Case Study', p_public_url: `https://ex.com/cs-${rand}`, p_asset_type: 'digital_product_saas' });
  await s.client.rpc('set_asset_visibility', { p_asset_id: assetId, p_visibility: 'public' });
  const { data: assetRow } = await admin.from('assets').select('public_slug').eq('id', assetId).single();
  const SLUG = assetRow.public_slug;

  // Public but NON-searchable profile.
  const n = await mkUser('nonsearch');
  await n.client.rpc('update_my_profile', { p_display_name: 'Private Pat', p_bio: 'y' });
  await n.client.rpc('claim_public_username', { p_username: HN });
  await n.client.rpc('update_publishing_settings', { p_profile_public_enabled: true }); // searchable stays false

  console.log('\n[list_searchable_profiles — anon RPC gating]');
  {
    const { data } = await anon.rpc('list_searchable_profiles');
    const handles = (data ?? []).map((r) => r.public_username);
    expect('searchable profile is listed', handles.includes(HS), `not found in ${handles.length} rows`);
    expect('non-searchable profile is NOT listed', !handles.includes(HN));
  }

  console.log('\n[robots.txt]');
  {
    const r = await get('/robots.txt');
    const txt = await r.text();
    expect('robots.txt returns 200', r.status === 200, `status=${r.status}`);
    expect('disallows member/app routes', /Disallow: \/dashboard/.test(txt) && /Disallow: \/account/.test(txt), txt.slice(0, 200));
    expect('links the sitemap', /Sitemap:\s*https?:\/\/\S+\/sitemap\.xml/.test(txt), txt.slice(0, 300));
  }

  console.log('\n[sitemap.xml]');
  {
    const r = await get('/sitemap.xml');
    const xml = await r.text();
    expect('sitemap.xml returns 200', r.status === 200, `status=${r.status}`);
    expect('includes a public marketing route', xml.includes('/pricing'));
    expect('includes the searchable profile', xml.includes(`/u/${HS}`), 'HS missing from sitemap');
    expect('OMITS the non-searchable profile', !xml.includes(`/u/${HN}`), 'HN leaked into sitemap');
    expect('OMITS asset pages (noindex)', !xml.includes(`/a/${SLUG}`), 'asset leaked into sitemap');
  }

  console.log('\n[searchable profile page — indexable + SEO tags]');
  {
    const html = await (await get(`/u/${HS}`)).text();
    expect('searchable profile is indexable (not noindex)', !/name="robots"[^>]*content="[^"]*noindex/i.test(html));
    expect('has canonical link to /u/HS', new RegExp(`rel="canonical"[^>]*href="[^"]*/u/${HS}"`).test(html), 'canonical missing');
    expect('has og:title', /property="og:title"/.test(html));
    expect('has og:image', /property="og:image"/.test(html) && /\/u\/[^"']*opengraph-image/.test(html), 'og:image missing');
    expect('has twitter card', /name="twitter:card"/.test(html));
    expect('has Person JSON-LD', /application\/ld\+json/.test(html) && /"@type":"Person"/.test(html), 'json-ld missing');
  }

  console.log('\n[non-searchable profile page — noindex]');
  {
    const html = await (await get(`/u/${HN}`)).text();
    expect('non-searchable profile is noindex', /name="robots"[^>]*content="[^"]*noindex/i.test(html));
  }

  console.log('\n[dynamic OG images render as PNG]');
  {
    const pr = await get(`/u/${HS}/opengraph-image`);
    expect('profile OG image 200 image/png', pr.status === 200 && (pr.headers.get('content-type') || '').includes('image/png'), `status=${pr.status} ct=${pr.headers.get('content-type')}`);
    const ar = await get(`/a/${SLUG}/opengraph-image`);
    expect('asset OG image 200 image/png', ar.status === 200 && (ar.headers.get('content-type') || '').includes('image/png'), `status=${ar.status} ct=${ar.headers.get('content-type')}`);
  }

  console.log('\n[public asset page — noindex but shareable]');
  {
    const html = await (await get(`/a/${SLUG}`)).text();
    expect('asset page stays noindex', /name="robots"[^>]*content="[^"]*noindex/i.test(html));
    expect('asset has canonical', new RegExp(`rel="canonical"[^>]*href="[^"]*/a/${SLUG}"`).test(html), 'canonical missing');
    expect('asset has og:image', /property="og:image"/.test(html) && /\/a\/[^"']*opengraph-image/.test(html));
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
