// Live verification for Phase 12a — demo world seeding.
//
// Asserts against the CURRENTLY SEEDED demo world (run `node seed-demo.mjs`
// first): all 5 demo profiles exist and render publicly with noindex, approved
// feedback excerpts show on profile and asset pages under the pinned demo
// slugs, Priya's marketplace offers and engaged review are visible, the Proof
// Lab teaser reflects the demo listings, nothing demo leaks into sitemap.xml,
// and the anon key still cannot write.
//
//   BASE_URL=http://localhost:3210 node verify-phase12a.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { DEMO_HANDLES, DEMO_ASSET_SLUGS } from './src/lib/fivestarz/demo.js';

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

async function waitForServer(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/`, { redirect: 'manual' }); if (r.status > 0) return true; } catch {}
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`dev server never became reachable at ${BASE}`);
}
const get = (path) => fetch(`${BASE}${path}`, { redirect: 'manual' });
const isNoindex = (html) => /name="robots"[^>]*content="[^"]*noindex/i.test(html);

try {
  await waitForServer();

  console.log('\n[demo world exists]');
  {
    const { data, error } = await admin
      .from('user_profiles').select('user_id, plan_code, searchable_public_profile')
      .in('public_username', DEMO_HANDLES);
    expect(`exactly ${DEMO_HANDLES.length} demo profiles`, !error && data?.length === DEMO_HANDLES.length,
      error ? error.message : `found ${data?.length}`);
    expect('all demo profiles are on paid plans', (data ?? []).every((r) => r.plan_code !== 'sprout'));
    expect('no demo profile is searchable', (data ?? []).every((r) => !r.searchable_public_profile));
  }

  console.log('\n[public profile pages]');
  for (const [handle, name] of [
    ['demo-maya', 'Maya Chen'], ['demo-diego', 'Diego Ramos'], ['demo-priya', 'Priya Shah'],
    ['demo-sam', 'Sam Okafor'], ['demo-noor', 'Noor Haddad'],
  ]) {
    const res = await get(`/u/${handle}`);
    const html = await res.text();
    expect(`/u/${handle} renders (200 + name + noindex)`,
      res.status === 200 && html.includes(name) && isNoindex(html),
      `status=${res.status} name=${html.includes(name)} noindex=${isNoindex(html)}`);
  }
  {
    const html = await (await get('/u/demo-maya')).text();
    expect('profile shows an approved feedback excerpt', html.includes('welcome-sequence teardown'));
    const priya = await (await get('/u/demo-priya')).text();
    expect('priya profile shows marketplace offer', priya.includes('Positioning &amp; Messaging Audit') || priya.includes('Positioning & Messaging Audit'));
  }

  console.log('\n[public asset pages under pinned slugs]');
  for (const slug of Object.values(DEMO_ASSET_SLUGS)) {
    const res = await get(`/a/${slug}`);
    const html = await res.text();
    expect(`/a/${slug} renders (200 + noindex)`, res.status === 200 && isNoindex(html),
      `status=${res.status} noindex=${isNoindex(html)}`);
  }
  {
    const html = await (await get(`/a/${DEMO_ASSET_SLUGS.mayaCourse}`)).text();
    expect('asset page shows approved commentary', html.includes('welcome-sequence teardown'));
  }

  console.log('\n[engaged review + teaser]');
  {
    const { data } = await anon.rpc('get_public_feedback', { p_username: 'demo-priya' });
    expect('priya public feedback includes the Proof Lab engaged review',
      (data ?? []).some((f) => f.source === 'engaged_review' || /Proof Lab/i.test(f.body ?? '')),
      JSON.stringify(data?.map((f) => f.source)));
    const { data: teaser } = await anon.rpc('list_public_proof_lab_teaser');
    const copy = (teaser ?? []).find((c) => c.category === 'Copywriting');
    expect('proof lab teaser counts the copywriting listing', (copy?.active_listing_count ?? 0) >= 1, JSON.stringify(teaser?.slice(0, 3)));
  }

  console.log('\n[no search-engine leakage]');
  {
    const xml = await (await get('/sitemap.xml')).text();
    const leaks = [...DEMO_HANDLES.map((h) => `/u/${h}`), ...Object.values(DEMO_ASSET_SLUGS).map((s) => `/a/${s}`)]
      .filter((p) => xml.includes(p));
    expect('sitemap contains no demo profiles or assets', leaks.length === 0, `leaked: ${leaks.join(', ')}`);
  }

  console.log('\n[anon still cannot write]');
  {
    const { error } = await anon.rpc('update_my_profile', { p_display_name: 'hacked' });
    expect('anon writer RPC is rejected', !!error, 'update_my_profile succeeded for anon');
  }
} catch (e) {
  bad('harness', e.stack || e.message);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
