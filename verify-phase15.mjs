// Live verification for Phase 15 — match preferences.
//
// Asserts: update_match_preferences gates per plan (sprout locked out of
// degrees + semi-dup toggles; bloom can set 1–3°, not 4, and flip both
// toggles), values persist, suspended callers are blocked. With the dev
// server up: /account/preferences redirects anon to login, the pricing page
// no longer mentions Stripe checkout and re-lists semi-duplicate settings,
// and /how-it-works points at Matching preferences.
//
//   BASE_URL=http://localhost:3210 node verify-phase15.mjs

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

let passed = 0, failed = 0, skipped = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const skip = (n, d) => { skipped++; console.log(`  ~ ${n} (skipped: ${d})`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const tempUserIds = [];

async function mkUser(tag, { plan } = {}) {
  const email = `verify15-${tag}-${rand}@example.com`;
  const password = 'Verify15!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  tempUserIds.push(id);
  if (plan) await admin.from('user_profiles').update({ plan_code: plan }).eq('user_id', id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn(${tag}): ${sErr.message}`);
  return { id, client };
}
const prefs = async (id) =>
  (await admin.from('user_profiles')
    .select('degrees_of_separation, allow_semi_duplicate_matches, allow_semi_duplicate_with_free')
    .eq('user_id', id).single()).data;

try {
  console.log('\n[sprout — controls locked]');
  {
    const free = await mkUser('free', { plan: 'sprout' });
    const { error: dErr } = await free.client.rpc('update_match_preferences', { p_degrees_of_separation: 2 });
    expect('sprout cannot change degrees', !!dErr && /does not include degrees/i.test(dErr.message), dErr?.message ?? 'succeeded');
    const { error: sErr } = await free.client.rpc('update_match_preferences', { p_allow_semi_duplicate: false });
    expect('sprout cannot disable semi-duplicate matching', !!sErr && /does not include semi-duplicate/i.test(sErr.message), sErr?.message ?? 'succeeded');
    const { error: fErr } = await free.client.rpc('update_match_preferences', { p_allow_semi_duplicate_with_free: true });
    expect('sprout cannot flip the with-free toggle', !!fErr && /does not include the semi-duplicate-with-free/i.test(fErr.message), fErr?.message ?? 'succeeded');
    const p = await prefs(free.id);
    expect('sprout values untouched (1° / on / off)',
      p.degrees_of_separation === 1 && p.allow_semi_duplicate_matches === true && p.allow_semi_duplicate_with_free === false,
      JSON.stringify(p));
  }

  console.log('\n[bloom — full control within plan limits]');
  {
    const paid = await mkUser('paid', { plan: 'bloom' });
    const { error: e3 } = await paid.client.rpc('update_match_preferences', { p_degrees_of_separation: 3 });
    expect('bloom can set 3°', !e3, e3?.message ?? '');
    const { error: e4 } = await paid.client.rpc('update_match_preferences', { p_degrees_of_separation: 4 });
    expect('bloom cannot set 4°', !!e4 && /between 1 and 3/.test(e4.message), e4?.message ?? 'succeeded');
    const { error: eSemi } = await paid.client.rpc('update_match_preferences', { p_allow_semi_duplicate: false });
    expect('bloom can disable semi-duplicate matching', !eSemi, eSemi?.message ?? '');
    const { error: eFree } = await paid.client.rpc('update_match_preferences', { p_allow_semi_duplicate_with_free: true });
    expect('bloom can opt into with-free', !eFree, eFree?.message ?? '');
    const p = await prefs(paid.id);
    expect('all three values persisted (3° / off / on)',
      p.degrees_of_separation === 3 && p.allow_semi_duplicate_matches === false && p.allow_semi_duplicate_with_free === true,
      JSON.stringify(p));

    // partial update leaves the others alone
    await paid.client.rpc('update_match_preferences', { p_degrees_of_separation: 2 });
    const p2 = await prefs(paid.id);
    expect('partial update leaves other prefs alone',
      p2.degrees_of_separation === 2 && p2.allow_semi_duplicate_matches === false && p2.allow_semi_duplicate_with_free === true,
      JSON.stringify(p2));

    await admin.from('user_profiles').update({ account_status: 'suspended' }).eq('user_id', paid.id);
    const { error: eSusp } = await paid.client.rpc('update_match_preferences', { p_degrees_of_separation: 1 });
    expect('suspended caller is blocked', !!eSusp && /suspended/i.test(eSusp.message), eSusp?.message ?? 'succeeded');
    await admin.from('user_profiles').update({ account_status: 'active' }).eq('user_id', paid.id);
  }

  console.log('\n[HTTP — preferences page + honest pricing] (needs dev server)');
  {
    let up = true;
    try { await fetch(`${BASE}/`, { redirect: 'manual' }); } catch { up = false; }
    if (!up) {
      skip('HTTP checks', `no server at ${BASE}`);
    } else {
      const res = await fetch(`${BASE}/account/preferences`, { redirect: 'manual' });
      const loc = res.headers.get('location') ?? '';
      expect('anon /account/preferences redirects to login', res.status >= 300 && res.status < 400 && loc.includes('/login'), `status=${res.status} loc=${loc}`);

      const pricing = await (await fetch(`${BASE}/pricing`)).text();
      expect('no "Stripe checkout coming soon" on /pricing', !pricing.includes('Stripe checkout coming soon'));
      expect('semi-duplicate settings back in the pricing table', pricing.includes('Semi-duplicate match settings'));

      // HowPage is a tabbed client component — the matching/roadmap tab copy
      // is not in the SSR HTML, so assert against the component source.
      const howSrc = readFileSync(new URL('./src/components/fivestarz/HowPage.jsx', import.meta.url), 'utf8');
      expect('HowPage copy points at Matching preferences', howSrc.includes('Matching preferences'));
      expect('HowPage no longer defers the settings UI', !howSrc.includes('in development'));
    }
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of tempUserIds) await admin.auth.admin.deleteUser(id);
  if (tempUserIds.length) console.log(`\ncleaned up ${tempUserIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(failed === 0 ? 0 : 1);
