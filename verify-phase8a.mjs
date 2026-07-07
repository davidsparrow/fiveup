// Live verification for Phase 8a — visibility & publishing data model.
//
// Defaults are private/off; claim_public_username validates + reserves +
// screens; update_publishing_settings gates paid toggles by plan; asset
// visibility/brand-visibility are owner-only and (where paid) plan-gated;
// suspended callers are blocked. No public/anon exposure is exercised here
// (that's 8b) — this is the member-facing data model only.
//
//   node verify-phase8a.mjs

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

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const userIds = [];

async function mkUser(tag, { plan } = {}) {
  const email = `verify8a-${tag}-${rand}@example.com`;
  const password = 'Verify8a!' + rand;
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

const profile = async (id) => (await admin.from('user_profiles').select('*').eq('user_id', id).single()).data;
const asset = async (id) => (await admin.from('assets').select('*').eq('id', id).single()).data;
const mkAsset = (c, name) => c.rpc('create_asset', { p_name: name, p_public_url: 'https://ex.com/x', p_asset_type: 'digital_product_saas' });

try {
  const a = await mkUser('sprout', { plan: 'sprout' });
  const b = await mkUser('bloom', { plan: 'bloom' });
  const c = await mkUser('other', { plan: 'sprout' });
  console.log(`sprout=${a.id} bloom=${b.id} other=${c.id}`);

  console.log('\n[defaults — private/off]');
  {
    const p = await profile(a.id);
    const bools = ['profile_public_enabled', 'searchable_public_profile', 'show_logo', 'show_location', 'show_stats', 'show_feedback_excerpts', 'show_public_videos', 'show_marketplace_offers', 'show_external_links'];
    expect('all publishing toggles default false', bools.every((k) => p[k] === false), bools.filter((k) => p[k] !== false).join(','));
    expect('public_username defaults null', p.public_username === null, `got ${p.public_username}`);
    const { data: aid } = await mkAsset(a.client, 'sprout asset');
    const as = await asset(aid);
    expect('new asset defaults visibility=member_only', as.visibility === 'member_only', `got ${as.visibility}`);
    expect('new asset defaults brand_visibility=visible', as.brand_visibility === 'visible', `got ${as.brand_visibility}`);
    globalThis._aAsset = aid;
  }

  console.log('\n[claim_public_username]');
  {
    const { error } = await a.client.rpc('claim_public_username', { p_username: 'valid-handle1' });
    expect('valid handle claimed', !error, `err=${error && error.message}`);
    expect('handle persisted lowercased', (await profile(a.id)).public_username === 'valid-handle1');

    const reserved = await a.client.rpc('claim_public_username', { p_username: 'admin' });
    expect('reserved handle rejected', !!reserved.error && /reserved/.test(reserved.error.message), `err=${reserved.error && reserved.error.message}`);

    const short = await a.client.rpc('claim_public_username', { p_username: 'ab' });
    expect('too-short handle rejected', !!short.error && /3–30|3-30|chars/.test(short.error.message), `err=${short.error && short.error.message}`);

    const badchar = await a.client.rpc('claim_public_username', { p_username: '_nope' });
    expect('leading-separator handle rejected', !!badchar.error, `err=${badchar.error && badchar.error.message}`);

    const offensive = await a.client.rpc('claim_public_username', { p_username: 'kys' });
    expect('offensive handle rejected (Phase-7 scanner)', !!offensive.error && /not allowed/.test(offensive.error.message), `err=${offensive.error && offensive.error.message}`);

    const dup = await c.client.rpc('claim_public_username', { p_username: 'VALID-HANDLE1' });
    expect('duplicate handle rejected case-insensitively', !!dup.error && /already taken/.test(dup.error.message), `err=${dup.error && dup.error.message}`);
  }

  console.log('\n[update_publishing_settings — free vs paid]');
  {
    const { error: freeErr } = await a.client.rpc('update_publishing_settings', {
      p_profile_public_enabled: true, p_show_logo: true, p_show_location: true, p_show_stats: true, p_show_external_links: true });
    expect('free toggles persist for sprout', !freeErr, `err=${freeErr && freeErr.message}`);
    const p = await profile(a.id);
    expect('free toggles read back true', p.profile_public_enabled && p.show_logo && p.show_location && p.show_stats && p.show_external_links);

    for (const [param, label] of [['p_show_public_videos', 'video clips'], ['p_show_feedback_excerpts', 'feedback excerpts'], ['p_searchable_public_profile', 'search indexing'], ['p_show_marketplace_offers', 'Proof Lab offers']]) {
      const { error } = await a.client.rpc('update_publishing_settings', { [param]: true });
      expect(`sprout rejected for paid: ${label}`, !!error && /plan does not include/.test(error.message), `err=${error && error.message}`);
    }
    const stillOff = await profile(a.id);
    expect('rejected paid toggles stayed false', !stillOff.show_public_videos && !stillOff.show_feedback_excerpts && !stillOff.searchable_public_profile && !stillOff.show_marketplace_offers);

    const { error: paidOk } = await b.client.rpc('update_publishing_settings', {
      p_show_public_videos: true, p_show_feedback_excerpts: true, p_searchable_public_profile: true, p_show_marketplace_offers: true });
    expect('bloom allowed for paid toggles', !paidOk, `err=${paidOk && paidOk.message}`);
    const pb = await profile(b.id);
    expect('bloom paid toggles read back true', pb.show_public_videos && pb.show_feedback_excerpts && pb.searchable_public_profile && pb.show_marketplace_offers);
  }

  console.log('\n[set_asset_visibility]');
  {
    const aid = globalThis._aAsset;
    const { error: pubErr } = await a.client.rpc('set_asset_visibility', { p_asset_id: aid, p_visibility: 'public' });
    expect('owner can publish an ok asset', !pubErr && (await asset(aid)).visibility === 'public', `err=${pubErr && pubErr.message}`);

    const notOwner = await c.client.rpc('set_asset_visibility', { p_asset_id: aid, p_visibility: 'member_only' });
    expect('non-owner cannot change visibility', !!notOwner.error && /asset not found/.test(notOwner.error.message), `err=${notOwner.error && notOwner.error.message}`);

    await admin.from('assets').update({ moderation_status: 'removed' }).eq('id', aid);
    const removedPub = await a.client.rpc('set_asset_visibility', { p_asset_id: aid, p_visibility: 'public' });
    expect('cannot publish a removed asset', !!removedPub.error && /cannot be made public/.test(removedPub.error.message), `err=${removedPub.error && removedPub.error.message}`);
    await admin.from('assets').update({ moderation_status: 'ok' }).eq('id', aid); // restore for later steps
  }

  console.log('\n[set_asset_brand_visibility — paid]');
  {
    const aid = globalThis._aAsset;
    const sproutHide = await a.client.rpc('set_asset_brand_visibility', { p_asset_id: aid, p_value: 'hidden_until_feedback_complete' });
    expect('sprout rejected from hide-identity', !!sproutHide.error && /hide-identity/.test(sproutHide.error.message), `err=${sproutHide.error && sproutHide.error.message}`);
    const sproutVisible = await a.client.rpc('set_asset_brand_visibility', { p_asset_id: aid, p_value: 'visible' });
    expect('setting brand_visibility=visible is free', !sproutVisible.error, `err=${sproutVisible.error && sproutVisible.error.message}`);

    const { data: bid } = await mkAsset(b.client, 'bloom asset');
    const bloomHide = await b.client.rpc('set_asset_brand_visibility', { p_asset_id: bid, p_value: 'hidden_until_feedback_complete' });
    expect('bloom allowed to hide identity', !bloomHide.error && (await asset(bid)).brand_visibility === 'hidden_until_feedback_complete', `err=${bloomHide.error && bloomHide.error.message}`);
  }

  console.log('\n[suspended caller blocked]');
  {
    await admin.from('user_profiles').update({ account_status: 'suspended' }).eq('user_id', a.id);
    const e1 = await a.client.rpc('update_publishing_settings', { p_show_logo: false });
    expect('suspended blocked from update_publishing_settings', !!e1.error && /suspended/.test(e1.error.message), `err=${e1.error && e1.error.message}`);
    const e2 = await a.client.rpc('claim_public_username', { p_username: 'newhandle2' });
    expect('suspended blocked from claim_public_username', !!e2.error && /suspended/.test(e2.error.message), `err=${e2.error && e2.error.message}`);
    const e3 = await a.client.rpc('set_asset_visibility', { p_asset_id: globalThis._aAsset, p_visibility: 'member_only' });
    expect('suspended blocked from set_asset_visibility', !!e3.error && /suspended/.test(e3.error.message), `err=${e3.error && e3.error.message}`);
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
