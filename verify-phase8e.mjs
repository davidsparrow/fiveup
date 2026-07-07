// Live verification for Phase 8e — public Proof Lab teaser at /proof-lab.
//
// Asserts the marketplace Phase 1→2 boundary: anon sees an AGGREGATE teaser
// (category counts + headline totals), never a listing row; authenticated
// users still get the full ProofLabPage.
//
//   - anon RPCs return category counts + totals (Phase-7 suppression applied)
//   - anon base-table SELECT on proof_lab_listings stays empty
//   - anon HTTP GET /proof-lab -> 200 teaser (NOT a login redirect), shows
//     categories + CTA, and leaks NO listing titles
//   - authed HTTP GET /proof-lab -> 200 full ProofLabPage (teaser CTA absent)
//
//   BASE_URL=http://localhost:3210 node verify-phase8e.mjs
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
  const email = `verify8e-${tag}-${rand}@example.com`;
  const password = 'Verify8e!' + rand;
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

// Forge the @supabase/ssr auth cookie (v0.9): value = "base64-" + base64url(JSON
// session), chunked at 3180 chars into name.0/name.1 when large. base64url has
// no cookie-unsafe chars, so we send the raw value.
function sessionCookieHeader(session) {
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

try {
  await waitForServer();

  const seller = await mkUser('seller', { plan: 'bloom' });
  const buyer = await mkUser('buyer');
  await seller.client.rpc('update_my_profile', { p_display_name: 'Seller Sam', p_bio: 'x' });

  // Listings: 2x Copywriting, 1x SEO. Titles are unique + must NOT reach anon.
  const T1 = `SECRET-Copy-A-${rand}`, T2 = `SECRET-Copy-B-${rand}`, T3 = `SECRET-Seo-${rand}`;
  const { data: l1 } = await seller.client.rpc('create_proof_lab_listing', { p_title: T1, p_description: 'd', p_category_slug: 'copywriting' });
  await seller.client.rpc('create_proof_lab_listing', { p_title: T2, p_description: 'd', p_category_slug: 'copywriting' });
  await seller.client.rpc('create_proof_lab_listing', { p_title: T3, p_description: 'd', p_category_slug: 'seo' });

  // A completed deal with a charity pledge -> feeds total_pledged_cents.
  const { data: charity } = await admin.from('charities').select('id').eq('active', true).limit(1).single();
  const PLEDGE = (20000 * 10) / 100; // deal_value_cents * donation_percent / 100 = 2000
  await admin.from('proof_lab_deal_requests').insert({
    listing_id: l1, requester_user_id: buyer.id, seller_user_id: seller.id, requester_email: 'b@ex.com',
    status: 'completed', deal_value_cents: 20000, donation_percent: 10, charity_id: charity.id,
  });

  console.log('\n[anon RPC aggregates]');
  {
    const { data: rows } = await anon.rpc('list_public_proof_lab_teaser');
    const byCat = Object.fromEntries((rows ?? []).map((r) => [r.category, r.active_listing_count]));
    expect('Copywriting count >= 2', (byCat['Copywriting'] ?? 0) >= 2, JSON.stringify(byCat['Copywriting']));
    expect('SEO count >= 1', (byCat['SEO'] ?? 0) >= 1, JSON.stringify(byCat['SEO']));
    expect('rows carry only category + count (no listing fields)', (rows ?? []).every((r) => Object.keys(r).sort().join() === 'active_listing_count,category'), JSON.stringify(rows?.[0]));

    const { data: stats } = await anon.rpc('get_public_proof_lab_stats');
    const s = stats?.[0];
    expect('total_active_listings >= 3', s && s.total_active_listings >= 3, JSON.stringify(s));
    expect('total_pledged_cents >= our pledge', s && Number(s.total_pledged_cents) >= PLEDGE, JSON.stringify(s));
  }

  console.log('\n[anon cannot read listing rows directly]');
  {
    const { data: rows } = await anon.from('proof_lab_listings').select('id, title');
    expect('anon SELECT on proof_lab_listings returns nothing', (rows ?? []).length === 0, `saw ${(rows ?? []).length}`);
  }

  console.log('\n[Phase-7 suppression in aggregates]');
  {
    await admin.from('user_profiles').update({ account_status: 'suspended' }).eq('user_id', seller.id);
    const { data: stats } = await anon.rpc('get_public_proof_lab_stats');
    const { data: rows } = await anon.rpc('list_public_proof_lab_teaser');
    const byCat = Object.fromEntries((rows ?? []).map((r) => [r.category, r.active_listing_count]));
    expect('suspended seller drops from active-listing total', stats?.[0]?.total_active_listings >= 0 && (byCat['SEO'] ?? 0) === 0, JSON.stringify({ seo: byCat['SEO'] }));
    await admin.from('user_profiles').update({ account_status: 'active' }).eq('user_id', seller.id);
  }

  console.log('\n[anon HTTP GET /proof-lab -> teaser, not login redirect]');
  {
    const r = await get('/proof-lab');
    const html = await r.text();
    expect('anon /proof-lab returns 200 (no redirect)', r.status === 200, `status=${r.status}`);
    expect('renders teaser hero', html.includes('The Proof Lab'));
    expect('renders sign-in CTA', html.includes('Sign in to browse deals'), 'CTA missing');
    expect('renders "Browse by category"', html.includes('Browse by category'));
    expect('renders a category label', html.includes('Copywriting'));
    expect('does NOT leak listing title T1', !html.includes(T1), 'T1 leaked');
    expect('does NOT leak listing title T2', !html.includes(T2), 'T2 leaked');
    expect('does NOT leak listing title T3', !html.includes(T3), 'T3 leaked');
  }

  console.log('\n[authed HTTP GET /proof-lab -> full ProofLabPage]');
  {
    const cookie = sessionCookieHeader(seller.session);
    const r = await get('/proof-lab', { cookie });
    const html = await r.text();
    expect('authed /proof-lab returns 200', r.status === 200, `status=${r.status}`);
    expect('renders full page hero', html.includes('The Proof Lab'));
    expect('full page, NOT the teaser (no sign-in CTA)', !html.includes('Sign in to browse deals'), 'teaser CTA present for authed user');
    expect('full page, NOT the teaser (no "Browse by category")', !html.includes('Browse by category'));
    expect('renders the marketplace shell (listing count / loading)', /Loading|listing/i.test(html), 'ProofLabPage shell marker missing');
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  await admin.from('proof_lab_deal_requests').delete().in('seller_user_id', userIds);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
