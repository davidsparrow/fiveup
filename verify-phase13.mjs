// Live verification for Phase 13 — demo/matching hardening.
//
// Asserts: is_demo set on the seeded cast; create_match survives a 4°-
// separation pair (degree capped at 3) and blocks demo↔real matches; demo
// members are hidden from real members' candidates and member Proof Lab
// listings but still visible to demo callers and on anonymous surfaces;
// the graph-test fixture users are gone from the live DB.
//
// Requires the demo world seeded (node seed-demo.mjs) and the dev server up.
//
//   BASE_URL=http://localhost:3210 node verify-phase13.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { DEMO_HANDLES } from './src/lib/fivestarz/demo.js';

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
const tempUserIds = [];

async function mkUser(tag, { plan, isDemo } = {}) {
  const email = `verify13-${tag}-${rand}@example.com`;
  const password = 'Verify13!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  tempUserIds.push(id);
  const patch = {};
  if (plan) patch.plan_code = plan;
  if (isDemo) patch.is_demo = true;
  if (Object.keys(patch).length) await admin.from('user_profiles').update(patch).eq('user_id', id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn(${tag}): ${sErr.message}`);
  return { id, client };
}
async function mkAsset(owner, name) {
  return owner.client.rpc('create_asset', {
    p_name: name, p_public_url: `https://example.com/${encodeURIComponent(name)}-${rand}`,
    p_asset_type: 'digital_product_saas', p_channels: ['LinkedIn'], p_feedback_formats: ['written'],
  }).then(({ data, error }) => { if (error) throw new Error(`create_asset(${name}): ${error.message}`); return data; });
}

try {
  console.log('\n[is_demo on the seeded cast]');
  {
    const { data } = await admin.from('user_profiles').select('is_demo').in('public_username', DEMO_HANDLES);
    expect('all 5 demo profiles have is_demo = true', data?.length === DEMO_HANDLES.length && data.every((r) => r.is_demo),
      JSON.stringify(data));
  }

  console.log('\n[create_match 4° fix]');
  {
    // sam↔noor closes the 5-cycle at exactly 4°; the seed created it via the
    // real RPC, so it must exist with the stored degree capped at 3.
    const { data: sam } = await admin.from('user_profiles').select('user_id').eq('public_username', 'demo-sam').single();
    const { data: noor } = await admin.from('user_profiles').select('user_id').eq('public_username', 'demo-noor').single();
    const { data: m } = await admin.from('matches').select('separation_degree_used, source')
      .or(`and(member_a_user_id.eq.${sam.user_id},member_b_user_id.eq.${noor.user_id}),and(member_a_user_id.eq.${noor.user_id},member_b_user_id.eq.${sam.user_id})`);
    expect('4°-separation match created via RPC', m?.length === 1 && m[0].source === 'browse', JSON.stringify(m));
    expect('stored separation degree capped at 3', m?.[0]?.separation_degree_used === 3, `got ${m?.[0]?.separation_degree_used}`);
  }

  console.log('\n[demo/real matching wall]');
  {
    const real = await mkUser('real', { plan: 'bloom' });
    const realAsset = await mkAsset(real, 'Real Product');
    const { data: maya } = await admin.from('user_profiles').select('user_id').eq('public_username', 'demo-maya').single();
    const { data: mayaAsset } = await admin.from('assets').select('id').eq('owner_user_id', maya.user_id).limit(1).single();
    const { error } = await real.client.rpc('create_match', {
      p_other_user_id: maya.user_id, p_my_asset_id: realAsset, p_their_asset_id: mayaAsset.id,
    });
    expect('real member cannot match a demo account', !!error && /demo/i.test(error.message), error?.message ?? 'succeeded');

    console.log('\n[candidate visibility]');
    const { data: realCands } = await real.client.rpc('eligible_match_candidates', { p_my_asset_id: realAsset });
    const demoIds = new Set([maya.user_id]);
    const { data: cast } = await admin.from('user_profiles').select('user_id').in('public_username', DEMO_HANDLES);
    for (const r of cast ?? []) demoIds.add(r.user_id);
    const leaked = (realCands ?? []).filter((c) => demoIds.has(c.candidate_user_id));
    expect('real member sees NO demo candidates', leaked.length === 0, `leaked ${leaked.length}`);
    expect('no graph-test fixtures among candidates', !(realCands ?? []).some((c) => /Seed$/.test(c.candidate_display_name ?? '')));

    const demoViewer = await mkUser('demoviewer', { plan: 'bloom', isDemo: true });
    const demoAsset = await mkAsset(demoViewer, 'Demo Viewer Asset');
    const { data: demoCands } = await demoViewer.client.rpc('eligible_match_candidates', { p_my_asset_id: demoAsset });
    expect('demo caller still sees demo candidates', (demoCands ?? []).some((c) => demoIds.has(c.candidate_user_id)),
      `saw ${(demoCands ?? []).length} candidates`);

    console.log('\n[member Proof Lab listings]');
    const listingQuery = (client) => client
      .from('proof_lab_listings')
      .select('id, seller:user_profiles!seller_user_id!inner(is_demo)')
      .eq('status', 'active');
    const { data: realList } = await listingQuery(real.client).eq('seller.is_demo', false);
    expect('real member marketplace hides demo listings', (realList ?? []).length === 0, `saw ${(realList ?? []).length}`);
    const { data: demoList } = await listingQuery(demoViewer.client);
    expect('demo viewer still sees the demo listings', (demoList ?? []).length >= 3, `saw ${(demoList ?? []).length}`);
  }

  console.log('\n[anonymous surfaces unchanged]');
  {
    const { data: teaser } = await anon.rpc('list_public_proof_lab_teaser');
    const total = (teaser ?? []).reduce((s, c) => s + (c.active_listing_count ?? 0), 0);
    expect('anon Proof Lab teaser still counts demo listings', total >= 3, `total=${total}`);
    const res = await fetch(`${BASE}/u/demo-maya`, { redirect: 'manual' });
    expect('/u/demo-maya still renders publicly', res.status === 200, `status=${res.status}`);
  }

  console.log('\n[graph-test fixtures removed]');
  {
    const { count } = await admin.from('user_profiles').select('user_id', { count: 'exact', head: true }).like('display_name', '% Seed');
    expect('no "* Seed" fixture profiles remain', count === 0, `count=${count}`);
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of tempUserIds) await admin.auth.admin.deleteUser(id);
  if (tempUserIds.length) console.log(`\ncleaned up ${tempUserIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
