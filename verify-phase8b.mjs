// Live verification for Phase 8b — anon public-read layer + approval model.
//
// Drives the get_public_* RPCs as a true ANONYMOUS client (no session = anon
// role) and asserts: curated projections, per-field toggles, per-item feedback
// approval, paid-section gating re-checked against the owner's current plan,
// Phase-7 suppression (suspended / moderation removed), and that anon cannot
// read base tables directly.
//
//   node verify-phase8b.mjs

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
const anon = createClient(URL_, ANON, { auth: { persistSession: false } }); // no signIn = anon role

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const userIds = [];

async function mkUser(tag, { plan } = {}) {
  const email = `verify8b-${tag}-${rand}@example.com`;
  const password = 'Verify8b!' + rand;
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
const HANDLE = `proofowner${rand}`.replace(/[^a-z0-9]/g, '').slice(0, 28);
const prof = (u) => anon.rpc('get_public_profile', { p_username: u }).then((r) => r.data ?? []);
const feed = (u) => anon.rpc('get_public_feedback', { p_username: u }).then((r) => r.data ?? []);

try {
  const owner = await mkUser('owner', { plan: 'bloom' });
  const reviewer = await mkUser('reviewer');
  const buyer = await mkUser('buyer');

  // profile content
  await owner.client.rpc('update_my_profile', { p_display_name: 'Owner Owens', p_bio: 'seasoned founder', p_location_text: 'Austin, TX', p_avatar_url: 'https://ex.com/logo.png' });
  await admin.from('user_profiles').update({ feedback_rating_avg: 4.5, feedback_rating_count: 3, proof_lab_rating_avg: 5, proof_lab_rating_count: 1 }).eq('user_id', owner.id);
  await owner.client.rpc('claim_public_username', { p_username: HANDLE });
  await owner.client.rpc('update_publishing_settings', {
    p_profile_public_enabled: true, p_show_logo: true, p_show_location: true, p_show_stats: true,
    p_show_feedback_excerpts: true, p_show_public_videos: true, p_show_marketplace_offers: true,
    p_searchable_public_profile: true });

  // a public asset + a member_only asset
  const { data: pubAsset } = await owner.client.rpc('create_asset', { p_name: 'My Case Study', p_public_url: 'https://ex.com/cs', p_asset_type: 'digital_product_saas' });
  await owner.client.rpc('set_asset_visibility', { p_asset_id: pubAsset, p_visibility: 'public' });
  await owner.client.rpc('create_asset', { p_name: 'Hidden Asset', p_public_url: 'https://ex.com/h', p_asset_type: 'content_podcast_video' }); // stays member_only

  // a listing (categories + offers)
  await owner.client.rpc('create_proof_lab_listing', { p_title: 'Landing page audit', p_description: 'thorough', p_category_slug: 'automation' });

  // match feedback about the owner (seed the match directly)
  const mkAsset = async (uid) => (await admin.from('assets').insert({ owner_user_id: uid, name: 'x', public_url: 'https://ex.com/x', asset_type: 'digital_product_saas', status: 'archived' }).select('id').single()).data.id;
  const { data: match } = await admin.from('matches').insert({ member_a_user_id: reviewer.id, member_b_user_id: owner.id, member_a_asset_id: await mkAsset(reviewer.id), member_b_asset_id: await mkAsset(owner.id), source: 'browse', status: 'matched' }).select('id').single();
  const { data: fsId } = await reviewer.client.rpc('submit_feedback', { p_match_id: match.id, p_stars: 5, p_written_feedback: 'sharp, clear thinking', p_media_url: 'https://ex.com/clip.mp4' });

  // engaged review about the owner (seed a completed deal)
  const { data: listingForDeal } = await owner.client.rpc('create_proof_lab_listing', { p_title: 'Deal listing', p_description: 'x', p_category_slug: 'automation' });
  const { data: deal } = await admin.from('proof_lab_deal_requests').insert({ listing_id: listingForDeal, requester_user_id: buyer.id, seller_user_id: owner.id, requester_email: 'b@ex.com', status: 'completed' }).select('id').single();
  const { data: reviewId } = await buyer.client.rpc('create_proof_lab_review', { p_deal_id: deal.id, p_stars: 5, p_written: 'delivered brilliantly' });

  console.log('\n[get_public_profile — anon]');
  {
    const rows = await prof(HANDLE);
    const p = rows[0];
    expect('published profile returns one row', rows.length === 1, `rows=${rows.length}`);
    expect('core identity present', p && p.display_name === 'Owner Owens' && p.public_username === HANDLE && p.bio === 'seasoned founder');
    expect('logo shown when show_logo on', p && p.avatar_url === 'https://ex.com/logo.png');
    expect('location shown when show_location on', p && p.location_text === 'Austin, TX');
    expect('stats shown when show_stats on', p && Number(p.feedback_rating_avg) === 4.5 && p.proof_lab_rating_count === 1);
    expect('categories derived from listings + public assets', p && p.categories.includes('Automation') && p.categories.some((c) => /Digital Product/.test(c)), JSON.stringify(p && p.categories));
    expect('searchable true (paid + toggle on)', p && p.searchable === true, `searchable=${p && p.searchable}`);
  }

  console.log('\n[per-field toggle off]');
  {
    await owner.client.rpc('update_publishing_settings', { p_show_logo: false, p_show_location: false, p_show_stats: false });
    const p = (await prof(HANDLE))[0];
    expect('logo hidden when toggle off', p && p.avatar_url === null);
    expect('location hidden when toggle off', p && p.location_text === null);
    expect('stats hidden when toggle off', p && p.feedback_rating_avg === null && p.proof_lab_rating_avg === null);
    await owner.client.rpc('update_publishing_settings', { p_show_logo: true, p_show_location: true, p_show_stats: true }); // restore
  }

  console.log('\n[get_public_feedback — per-item approval]');
  {
    expect('no excerpts before any approval', (await feed(HANDLE)).length === 0);
    await owner.client.rpc('approve_public_feedback', { p_source_type: 'match_feedback', p_source_id: fsId, p_approved: true });
    const afterMatch = await feed(HANDLE);
    expect('approved match feedback yields an excerpt', afterMatch.some((r) => r.kind === 'excerpt' && r.source === 'match' && /sharp, clear/.test(r.body)));
    expect('same item with media yields a clip', afterMatch.some((r) => r.kind === 'clip' && r.media_url === 'https://ex.com/clip.mp4'));
    expect('engaged review not shown until approved', !afterMatch.some((r) => r.source === 'engaged_review'));
    await owner.client.rpc('approve_public_feedback', { p_source_type: 'engaged_review', p_source_id: reviewId, p_approved: true });
    expect('approved engaged review now appears', (await feed(HANDLE)).some((r) => r.source === 'engaged_review' && /brilliantly/.test(r.body)));
    // unapprove hides again
    await owner.client.rpc('approve_public_feedback', { p_source_type: 'engaged_review', p_source_id: reviewId, p_approved: false });
    expect('unapproving hides it again', !(await feed(HANDLE)).some((r) => r.source === 'engaged_review'));
    await owner.client.rpc('approve_public_feedback', { p_source_type: 'engaged_review', p_source_id: reviewId, p_approved: true });
  }

  console.log('\n[approval authority]');
  {
    const { error } = await reviewer.client.rpc('approve_public_feedback', { p_source_type: 'match_feedback', p_source_id: fsId, p_approved: true });
    expect('a non-recipient cannot publish someone else’s feedback', !!error && /feedback you received/.test(error.message), `err=${error && error.message}`);
  }

  console.log('\n[get_public_assets / get_public_offers]');
  {
    const { data: assets } = await anon.rpc('get_public_assets', { p_username: HANDLE });
    expect('public asset listed', (assets ?? []).some((a) => a.name === 'My Case Study' && a.public_slug), JSON.stringify(assets));
    expect('member_only asset NOT listed', !(assets ?? []).some((a) => a.name === 'Hidden Asset'));
    const { data: offers } = await anon.rpc('get_public_offers', { p_username: HANDLE });
    expect('offers shown when toggle on + paid', (offers ?? []).some((o) => o.title === 'Landing page audit' && o.category === 'Automation'), JSON.stringify(offers));
  }

  console.log('\n[paid gating re-checked against current plan]');
  {
    await admin.from('user_profiles').update({ plan_code: 'sprout' }).eq('user_id', owner.id); // downgrade
    expect('excerpts hidden after downgrade (paid)', (await feed(HANDLE)).length === 0);
    const p = (await prof(HANDLE))[0];
    expect('searchable false after downgrade', p && p.searchable === false);
    const { data: offers } = await anon.rpc('get_public_offers', { p_username: HANDLE });
    expect('offers hidden after downgrade', (offers ?? []).length === 0);
    await admin.from('user_profiles').update({ plan_code: 'bloom' }).eq('user_id', owner.id); // restore
  }

  console.log('\n[anon cannot read base tables directly]');
  {
    const { data: up } = await anon.from('user_profiles').select('user_id').eq('user_id', owner.id);
    expect('anon SELECT on user_profiles returns nothing', (up ?? []).length === 0, `saw ${(up ?? []).length}`);
    const { data: fs } = await anon.from('feedback_submissions').select('id');
    expect('anon SELECT on feedback_submissions returns nothing', (fs ?? []).length === 0, `saw ${(fs ?? []).length}`);
  }

  console.log('\n[Phase-7 suppression]');
  {
    await admin.from('user_profiles').update({ moderation_status: 'removed' }).eq('user_id', owner.id);
    expect('moderation-removed profile invisible to anon', (await prof(HANDLE)).length === 0);
    await admin.from('user_profiles').update({ moderation_status: 'ok', account_status: 'suspended' }).eq('user_id', owner.id);
    expect('suspended owner profile invisible to anon', (await prof(HANDLE)).length === 0);
    await admin.from('user_profiles').update({ account_status: 'active' }).eq('user_id', owner.id);
    // unpublished
    await admin.from('user_profiles').update({ profile_public_enabled: false }).eq('user_id', owner.id);
    expect('unpublished profile invisible to anon', (await prof(HANDLE)).length === 0);
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
