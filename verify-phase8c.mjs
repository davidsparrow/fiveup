// Live verification for Phase 8c — public profile page /u/[username].
//
// Seeds a published owner (like 8b) then drives REAL ANONYMOUS HTTP fetches
// against the running dev server, asserting:
//   - published handle -> 200 with only approved fields (name, bio, stats,
//     approved excerpt) and NO leaked internals (email, plan_code)
//   - non-searchable profile -> noindex robots meta present
//   - searchable (paid + toggle) profile -> index (no noindex)
//   - unpublishable handles (unpublished / suspended / removed / unknown) -> 404
//
//   BASE_URL=http://localhost:3210 node verify-phase8c.mjs
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
  const email = `verify8c-${tag}-${rand}@example.com`;
  const password = 'Verify8c!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  userIds.push(id);
  if (plan) await admin.from('user_profiles').update({ plan_code: plan }).eq('user_id', id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn(${tag}): ${sErr.message}`);
  return { id, email, password, client };
}

const HANDLE = `pubprofile${rand}`.replace(/[^a-z0-9]/g, '').slice(0, 28);
const OWNER_EMAIL_LOCAL = () => userIds; // referenced for leak checks below

async function waitForServer(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/`, { redirect: 'manual' });
      if (r.status > 0) return true;
    } catch {}
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`dev server never became reachable at ${BASE}`);
}

const get = (path) => fetch(`${BASE}${path}`, { redirect: 'manual' });

try {
  await waitForServer();

  const owner = await mkUser('owner', { plan: 'bloom' });
  const reviewer = await mkUser('reviewer');

  await owner.client.rpc('update_my_profile', { p_display_name: 'Casey Public', p_bio: 'Founder of a small SaaS. Loves clear feedback.', p_location_text: 'Denver, CO', p_avatar_url: 'https://ex.com/logo.png' });
  await admin.from('user_profiles').update({ feedback_rating_avg: 4.7, feedback_rating_count: 4, proof_lab_rating_avg: 5, proof_lab_rating_count: 2 }).eq('user_id', owner.id);
  await owner.client.rpc('claim_public_username', { p_username: HANDLE });
  await owner.client.rpc('update_publishing_settings', {
    p_profile_public_enabled: true, p_show_logo: true, p_show_location: true, p_show_stats: true,
    p_show_feedback_excerpts: true, p_show_public_videos: true, p_show_marketplace_offers: true,
    p_searchable_public_profile: false }); // start NON-searchable -> expect noindex

  // A public asset (links to /a/[slug])
  const { data: pubAsset } = await owner.client.rpc('create_asset', { p_name: 'My Case Study', p_public_url: 'https://ex.com/cs', p_asset_type: 'digital_product_saas' });
  await owner.client.rpc('set_asset_visibility', { p_asset_id: pubAsset, p_visibility: 'public' });

  // An approved match-feedback excerpt
  const mkAsset = async (uid) => (await admin.from('assets').insert({ owner_user_id: uid, name: 'x', public_url: 'https://ex.com/x', asset_type: 'digital_product_saas', status: 'archived' }).select('id').single()).data.id;
  const { data: match } = await admin.from('matches').insert({ member_a_user_id: reviewer.id, member_b_user_id: owner.id, member_a_asset_id: await mkAsset(reviewer.id), member_b_asset_id: await mkAsset(owner.id), source: 'browse', status: 'matched' }).select('id').single();
  const { data: fsId } = await reviewer.client.rpc('submit_feedback', { p_match_id: match.id, p_stars: 5, p_written_feedback: 'sharp and generous with detail', p_media_url: null });
  await owner.client.rpc('approve_public_feedback', { p_source_type: 'match_feedback', p_source_id: fsId, p_approved: true });

  console.log('\n[published profile — anon HTTP 200 + approved fields]');
  {
    const r = await get(`/u/${HANDLE}`);
    const html = await r.text();
    expect('published handle returns 200', r.status === 200, `status=${r.status}`);
    expect('renders display name', html.includes('Casey Public'), 'display_name missing');
    expect('renders @handle', html.includes(`@${HANDLE}`), 'handle missing');
    expect('renders bio', html.includes('Loves clear feedback'), 'bio missing');
    expect('renders location', html.includes('Denver, CO'), 'location missing');
    expect('renders neutral stat average (no star glyph in stats)', html.includes('4.7'), 'avg missing');
    expect('renders approved feedback excerpt', html.includes('sharp and generous with detail'), 'excerpt missing');
    expect('links to public asset page /a/', /href="\/a\//.test(html), 'asset link missing');
    // Leak checks: owner internals must never reach the anon HTML
    expect('does NOT leak owner email', !html.includes(owner.email), 'email leaked');
    expect('does NOT leak plan_code', !/plan_code/.test(html) && !html.includes('bloom'), 'plan leaked');
    expect('does NOT leak user_id (uuid)', !html.includes(owner.id), 'user_id leaked');
    expect('non-searchable profile is noindex', /name="robots"[^>]*content="[^"]*noindex/i.test(html), 'noindex meta absent');
  }

  console.log('\n[searchable profile -> index]');
  {
    await owner.client.rpc('update_publishing_settings', { p_searchable_public_profile: true });
    const r = await get(`/u/${HANDLE}`);
    const html = await r.text();
    expect('searchable handle still 200', r.status === 200, `status=${r.status}`);
    expect('searchable profile is NOT noindex', !/name="robots"[^>]*content="[^"]*noindex/i.test(html), 'unexpected noindex');
  }

  console.log('\n[unpublishable handles -> 404]');
  {
    const unknown = await get(`/u/nobody-${rand}`);
    expect('unknown handle returns 404', unknown.status === 404, `status=${unknown.status}`);

    await admin.from('user_profiles').update({ account_status: 'suspended' }).eq('user_id', owner.id);
    expect('suspended owner returns 404', (await get(`/u/${HANDLE}`)).status === 404);
    await admin.from('user_profiles').update({ account_status: 'active', moderation_status: 'removed' }).eq('user_id', owner.id);
    expect('moderation-removed owner returns 404', (await get(`/u/${HANDLE}`)).status === 404);
    await admin.from('user_profiles').update({ moderation_status: 'ok', profile_public_enabled: false }).eq('user_id', owner.id);
    expect('unpublished profile returns 404', (await get(`/u/${HANDLE}`)).status === 404);
  }

  console.log('\n[app-wide not-found page renders the error shell]');
  {
    const r = await get(`/u/nobody-${rand}`);
    const html = await r.text();
    expect('404 body renders ErrorShell copy', /couldn't find that page|couldn’t find that page/i.test(html), 'ErrorShell copy missing');
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
