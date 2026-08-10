// Live verification for the 2026-07-15 review-fixes migration
// (20260715120000_review_fixes_hardening.sql) + app-side changes.
//
// Pure DB/RPC checks — no dev server needed. Some checks use the seeded demo
// world when present and are skipped otherwise.
//
//   node verify-review-fixes.mjs

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

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });

let passed = 0, failed = 0, skipped = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const skip = (n) => { skipped++; console.log(`  - ${n} (skipped — demo world not seeded)`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const tempUserIds = [];

async function mkUser(tag, { plan = 'bloom', isDemo = false } = {}) {
  const email = `verifyfix-${tag}-${rand}@example.com`;
  const password = 'VerifyFix!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  tempUserIds.push(id);
  const patch = { plan_code: plan };
  if (isDemo) patch.is_demo = true;
  await admin.from('user_profiles').update(patch).eq('user_id', id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn(${tag}): ${sErr.message}`);
  return { id, client };
}
async function mkAsset(owner, name) {
  const { data, error } = await owner.client.rpc('create_asset', {
    p_name: name, p_public_url: `https://example.com/${encodeURIComponent(name)}-${rand}`,
    p_asset_type: 'digital_product_saas', p_channels: ['LinkedIn'], p_feedback_formats: ['stars', 'written'],
  });
  if (error) throw new Error(`create_asset(${name}): ${error.message}`);
  return data;
}

try {
  const { data: demoRows } = await admin.from('user_profiles').select('user_id').in('public_username', DEMO_HANDLES);
  const demoWorld = (demoRows ?? []).length === DEMO_HANDLES.length;

  console.log('\n[1. create_match suspension guard restored]');
  {
    const susp = await mkUser('susp');
    const other = await mkUser('other');
    const suspAsset = await mkAsset(susp, 'Susp Asset');
    const otherAsset = await mkAsset(other, 'Other Asset');
    await admin.from('user_profiles').update({ account_status: 'suspended' }).eq('user_id', susp.id);
    const { error } = await susp.client.rpc('create_match', {
      p_other_user_id: other.id, p_my_asset_id: suspAsset, p_their_asset_id: otherAsset,
    });
    expect('suspended member cannot create_match', !!error && /suspend/i.test(error.message), error?.message ?? 'succeeded');
    await admin.from('user_profiles').update({ account_status: 'active' }).eq('user_id', susp.id);
    const { data: mid, error: okErr } = await susp.client.rpc('create_match', {
      p_other_user_id: other.id, p_my_asset_id: suspAsset, p_their_asset_id: otherAsset,
    });
    expect('active member can still create_match', !okErr && !!mid, okErr?.message);
  }

  console.log('\n[2. demo walls: create_match + symmetric candidates]');
  {
    const real = await mkUser('real');
    const demo = await mkUser('demo', { isDemo: true });
    const realAsset = await mkAsset(real, 'Real Wall Asset');
    const demoAsset = await mkAsset(demo, 'Demo Wall Asset');
    const { error } = await real.client.rpc('create_match', {
      p_other_user_id: demo.id, p_my_asset_id: realAsset, p_their_asset_id: demoAsset,
    });
    expect('real→demo create_match still blocked', !!error && /demo/i.test(error.message), error?.message ?? 'succeeded');

    const { data: realCands } = await real.client.rpc('eligible_match_candidates', { p_my_asset_id: realAsset });
    expect('real caller sees no demo candidates', !(realCands ?? []).some((c) => c.candidate_user_id === demo.id),
      'demo temp user leaked into real browse');

    const { data: demoCands, error: dcErr } = await demo.client.rpc('eligible_match_candidates', { p_my_asset_id: demoAsset });
    expect('demo caller sees NO real candidates (symmetric wall)',
      !dcErr && !(demoCands ?? []).some((c) => c.candidate_user_id === real.id),
      dcErr?.message ?? 'real temp user leaked into demo browse');
    if (demoWorld) {
      const demoIds = new Set((demoRows ?? []).map((r) => r.user_id));
      expect('demo caller still sees the demo cast', (demoCands ?? []).some((c) => demoIds.has(c.candidate_user_id)),
        `saw ${(demoCands ?? []).length} candidates`);
    } else skip('demo caller still sees the demo cast');
  }

  console.log('\n[3. user_profiles direct writes revoked]');
  {
    const u = await mkUser('writer');
    const { error: e1 } = await u.client.from('user_profiles').update({ is_demo: true }).eq('user_id', u.id);
    expect('self-update of is_demo rejected', !!e1, 'update succeeded');
    const { error: e2 } = await u.client.from('user_profiles').update({ plan_code: 'flourish' }).eq('user_id', u.id);
    expect('self-update of plan_code rejected', !!e2, 'update succeeded');
    const { data: row } = await admin.from('user_profiles').select('is_demo, plan_code').eq('user_id', u.id).single();
    expect('row unchanged', row && row.is_demo === false && row.plan_code === 'bloom', JSON.stringify(row));
    const { error: rpcErr } = await u.client.rpc('update_my_profile', { p_display_name: 'Writer', p_bio: 'x' });
    expect('RPC write path still works', !rpcErr, rpcErr?.message);
  }

  console.log('\n[4. demo- handle namespace reserved]');
  {
    const real = await mkUser('claimer');
    const { error } = await real.client.rpc('claim_public_username', { p_username: `demo-claim-${rand}`.slice(0, 28) });
    expect('real member cannot claim a demo-* handle', !!error && /reserved/i.test(error.message), error?.message ?? 'succeeded');
    const demo = await mkUser('demoworthy', { isDemo: true });
    const { error: dErr } = await demo.client.rpc('claim_public_username', { p_username: `demo-ok-${rand}`.replace(/[^a-z0-9-]/g, '').slice(0, 28) });
    expect('demo account can claim a demo-* handle', !dErr, dErr?.message);
  }

  console.log('\n[5. brand-hidden assets off the public profile]');
  {
    const owner = await mkUser('brand'); // bloom has brand_visibility_enabled
    await owner.client.rpc('update_my_profile', { p_display_name: 'Brand Owner', p_bio: 'x' });
    const handle = `brandfix${rand}`.replace(/[^a-z0-9]/g, '').slice(0, 28);
    await owner.client.rpc('claim_public_username', { p_username: handle });
    await owner.client.rpc('update_publishing_settings', { p_profile_public_enabled: true });
    const assetId = await mkAsset(owner, 'Brand Fix Asset');
    await owner.client.rpc('set_asset_visibility', { p_asset_id: assetId, p_visibility: 'public' });

    const listNames = async () => (await anon.rpc('get_public_assets', { p_username: handle })).data?.map((a) => a.name) ?? [];
    expect('visible asset listed on profile', (await listNames()).includes('Brand Fix Asset'), JSON.stringify(await listNames()));

    await owner.client.rpc('set_asset_brand_visibility', { p_asset_id: assetId, p_value: 'hidden_until_feedback_complete' });
    expect('brand-hidden asset NOT listed on profile', !(await listNames()).includes('Brand Fix Asset'), JSON.stringify(await listNames()));

    const { data: slugRow } = await admin.from('assets').select('public_slug').eq('id', assetId).single();
    const { data: assetRows } = await anon.rpc('get_public_asset', { p_slug: slugRow.public_slug });
    const a = assetRows?.[0];
    expect('/a/ page still serves it, owner hidden, owner_is_demo=false',
      a && a.owner_hidden === true && a.owner_display_name === null && a.owner_is_demo === false, JSON.stringify(a));

    await owner.client.rpc('set_asset_brand_visibility', { p_asset_id: assetId, p_value: 'visible' });
    expect('revealed asset listed again', (await listNames()).includes('Brand Fix Asset'));
  }

  console.log('\n[6. get_public_feedback product_name gating]');
  {
    const a = await mkUser('reviewee'); // bloom: public_feedback_excerpts_enabled
    const b = await mkUser('reviewer');
    await a.client.rpc('update_my_profile', { p_display_name: 'Reviewee A', p_bio: 'x' });
    const handle = `pnamefix${rand}`.replace(/[^a-z0-9]/g, '').slice(0, 28);
    await a.client.rpc('claim_public_username', { p_username: handle });
    await a.client.rpc('update_publishing_settings', { p_profile_public_enabled: true, p_show_feedback_excerpts: true });
    const aAsset = await mkAsset(a, 'Secret Private Asset'); // stays private
    const bAsset = await mkAsset(b, 'Reviewer Asset');
    const { data: matchId, error: mErr } = await a.client.rpc('create_match', {
      p_other_user_id: b.id, p_my_asset_id: aAsset, p_their_asset_id: bAsset,
    });
    if (mErr) throw new Error(`match: ${mErr.message}`);
    const { data: fbId, error: fbErr } = await b.client.rpc('submit_feedback', {
      p_match_id: matchId, p_stars: 5, p_written_feedback: 'Genuinely useful product, clear and well organized throughout.',
    });
    if (fbErr) throw new Error(`feedback: ${fbErr.message}`);
    const { error: apErr } = await a.client.rpc('approve_public_feedback', { p_source_type: 'match_feedback', p_source_id: fbId });
    if (apErr) throw new Error(`approve: ${apErr.message}`);

    const rows = async () => (await anon.rpc('get_public_feedback', { p_username: handle })).data ?? [];
    let r = await rows();
    expect('excerpt visible on public profile', r.length === 1, `rows=${r.length}`);
    expect('private asset name withheld (product_name null)', r[0] && r[0].product_name === null, JSON.stringify(r[0]));

    await a.client.rpc('set_asset_visibility', { p_asset_id: aAsset, p_visibility: 'public' });
    r = await rows();
    expect('public asset name shown', r[0] && r[0].product_name === 'Secret Private Asset', JSON.stringify(r[0]));

    await a.client.rpc('set_asset_brand_visibility', { p_asset_id: aAsset, p_value: 'hidden_until_feedback_complete' });
    r = await rows();
    expect('brand-hidden asset name withheld again', r[0] && r[0].product_name === null, JSON.stringify(r[0]));
  }

  console.log('\n[7. proof lab demo wall server-side]');
  {
    const real = await mkUser('pl-real');
    const demoViewer = await mkUser('pl-demo', { isDemo: true });
    if (demoWorld) {
      const { data: realList } = await real.client.from('proof_lab_listings').select('id, seller_user_id').eq('status', 'active');
      const demoIds = new Set((demoRows ?? []).map((r) => r.user_id));
      expect('RLS hides demo listings from real members (no client filter)',
        !(realList ?? []).some((l) => demoIds.has(l.seller_user_id)), `saw ${(realList ?? []).length} rows`);
      const { data: demoList } = await demoViewer.client.from('proof_lab_listings').select('id').eq('status', 'active');
      expect('RLS still shows demo listings to demo viewers', (demoList ?? []).length >= 1, `saw ${(demoList ?? []).length}`);

      const { data: anyDemoListing } = await admin.from('proof_lab_listings').select('id').in('seller_user_id', [...demoIds]).eq('status', 'active').limit(1).single();
      const { error: dealErr } = await real.client.rpc('request_proof_lab_deal', {
        p_listing_id: anyDemoListing.id, p_requester_email: `verifyfix-${rand}@example.com`, p_note: 'test',
      });
      expect('request_proof_lab_deal blocks real→demo', !!dealErr && /demo/i.test(dealErr.message), dealErr?.message ?? 'succeeded');
    } else {
      skip('RLS hides demo listings from real members');
      skip('RLS still shows demo listings to demo viewers');
      skip('request_proof_lab_deal blocks real→demo');
    }
    const { error: lbErr } = await real.client.rpc('proof_lab_fundraiser_leaderboard');
    expect('fundraiser leaderboard still callable', !lbErr, lbErr?.message);
  }

  console.log('\n[8. demo world regressions (banner data source)]');
  if (demoWorld) {
    const { data: prof } = await anon.rpc('get_public_profile', { p_username: 'demo-maya' });
    expect('get_public_profile exposes is_demo=true for demo-maya', prof?.[0]?.is_demo === true, JSON.stringify(prof?.[0]));
    const { data: asset } = await anon.rpc('get_public_asset', { p_slug: DEMO_ASSET_SLUGS.mayaCourse });
    expect('get_public_asset exposes owner_is_demo=true for demo asset', asset?.[0]?.owner_is_demo === true, JSON.stringify(asset?.[0]));
    const { data: fb } = await anon.rpc('get_public_feedback', { p_username: 'demo-priya' });
    expect('demo feedback still carries product_name (public assets)',
      (fb ?? []).length > 0 && (fb ?? []).every((f) => f.product_name), JSON.stringify((fb ?? []).map((f) => f.product_name)));
  } else {
    skip('get_public_profile is_demo');
    skip('get_public_asset owner_is_demo');
    skip('demo feedback product_name regression');
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of tempUserIds) await admin.auth.admin.deleteUser(id);
  if (tempUserIds.length) console.log(`\ncleaned up ${tempUserIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed === 0 ? 0 : 1);
