// Live verification for Phase 12b — /demo tour page, slideshow assets, and
// the demo banner on demo public pages.
//
// Requires the demo world seeded (node seed-demo.mjs) and the dev server up.
//
//   BASE_URL=http://localhost:3210 node verify-phase12b.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { DEMO_ASSET_SLUGS } from './src/lib/fivestarz/demo.js';

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

async function waitForServer(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/`, { redirect: 'manual' }); if (r.status > 0) return true; } catch {}
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`dev server never became reachable at ${BASE}`);
}
const get = (path) => fetch(`${BASE}${path}`, { redirect: 'manual' });
const isNoindex = (html) => /name="robots"[^>]*content="[^"]*noindex/i.test(html);

const BANNER_TEXT = 'viewing a demo profile with sample data';
const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const tempUserIds = [];

try {
  await waitForServer();

  console.log('\n[/demo tour page]');
  {
    const res = await get('/demo');
    const html = await res.text();
    expect('/demo renders 200', res.status === 200, `status=${res.status}`);
    expect('/demo is indexable (no noindex)', !isNoindex(html));
    for (const heading of ['Meet the cast', 'Get matched with a peer', 'Exchange honest, human feedback', 'The proof is live', 'Proof Lab']) {
      expect(`contains stop: "${heading}"`, html.includes(heading));
    }
    expect('links to a live demo profile', html.includes('/u/demo-maya'));
    expect('links to a live demo asset page', html.includes(`/a/${DEMO_ASSET_SLUGS.mayaCourse}`));
    expect('ends with the beta CTA', html.includes('Request Beta Access'));
  }

  console.log('\n[slideshow screenshots]');
  for (const deck of ['create-asset-01', 'matching-01', 'feedback-01', 'rate-01', 'prooflab-01']) {
    const res = await get(`/demo/${deck}.jpg`);
    expect(`/demo/${deck}.jpg serves 200`, res.status === 200, `status=${res.status}`);
  }

  console.log('\n[demo banner on demo pages]');
  {
    const profile = await (await get('/u/demo-maya')).text();
    expect('/u/demo-maya shows the demo banner', profile.includes(BANNER_TEXT));
    expect('banner links back to /demo', profile.includes('href="/demo"'));
    const asset = await (await get(`/a/${DEMO_ASSET_SLUGS.priyaAudit}`)).text();
    expect('/a/<demo-slug> shows the demo banner', asset.includes(BANNER_TEXT));
  }

  console.log('\n[no banner on non-demo public pages]');
  {
    // Fresh non-demo member with a public profile — banner must NOT render.
    const email = `verify12b-${rand}@example.com`;
    const password = 'Verify12b!' + rand;
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    tempUserIds.push(created.user.id);
    const client = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error: sErr } = await client.auth.signInWithPassword({ email, password });
    if (sErr) throw new Error(`signIn: ${sErr.message}`);
    const handle = `real-member-${rand}`.slice(0, 30).replace(/[^a-z0-9-]/g, '');
    await client.rpc('update_my_profile', { p_display_name: 'Real Member', p_bio: 'x' });
    await client.rpc('claim_public_username', { p_username: handle });
    await client.rpc('update_publishing_settings', { p_profile_public_enabled: true });
    const html = await (await get(`/u/${handle}`)).text();
    expect('non-demo public profile renders', html.includes('Real Member'));
    expect('non-demo public profile has NO demo banner', !html.includes(BANNER_TEXT));
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of tempUserIds) await admin.auth.admin.deleteUser(id);
  if (tempUserIds.length) console.log(`\ncleaned up ${tempUserIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
