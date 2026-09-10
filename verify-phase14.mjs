// Live verification for Phase 14 — safety & reputation fixes.
//
// Asserts: eligible_match_candidates / create_match reject suspended members
// and moderation-removed assets; matches.separation_degree_used accepts 1–4;
// reputation aggregates recompute on remove_content and the new
// restore_content action; suspended sellers vanish from member listings and
// the fundraiser leaderboard; get_public_asset returns updated_at.
// With the dev server up (BASE_URL, default :3210) it also checks the honest
// marketing copy and the CreativeWork JSON-LD on /a/[slug].
//
//   BASE_URL=http://localhost:3210 node verify-phase14.mjs

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

let passed = 0, failed = 0, skipped = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const skip = (n, d) => { skipped++; console.log(`  ~ ${n} (skipped: ${d})`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const tempUserIds = [];

async function mkUser(tag, { plan, role } = {}) {
  const email = `verify14-${tag}-${rand}@example.com`;
  const password = 'Verify14!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  tempUserIds.push(id);
  if (plan) await admin.from('user_profiles').update({ plan_code: plan }).eq('user_id', id);
  if (role) {
    const { error: rErr } = await admin.from('user_roles').insert({ user_id: id, role });
    if (rErr) throw new Error(`grantRole(${tag}): ${rErr.message}`);
  }
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
const setStanding = (id, s) => admin.from('user_profiles').update({ account_status: s }).eq('user_id', id);
const profileOf = async (id, cols) => (await admin.from('user_profiles').select(cols).eq('user_id', id).single()).data;
const archivedAsset = async (uid) =>
  (await admin.from('assets').insert({ owner_user_id: uid, name: `arch-${rand}`, public_url: `https://ex.com/${rand}`, asset_type: 'digital_product_saas', status: 'archived' }).select('id').single()).data.id;

try {
  console.log('\n[A3 — separation_degree_used check widened to 1–4]');
  {
    const u1 = await mkUser('deg-a');
    const u2 = await mkUser('deg-b');
    const a1 = await archivedAsset(u1.id);
    const a2 = await archivedAsset(u2.id);
    const ins = (deg) => admin.from('matches').insert({
      member_a_user_id: u1.id, member_b_user_id: u2.id, member_a_asset_id: a1, member_b_asset_id: a2,
      source: 'browse', status: 'matched', separation_degree_used: deg,
    }).select('id').single();
    const { data: m4, error: e4 } = await ins(4);
    expect('degree 4 is now storable', !!m4 && !e4, e4?.message ?? '');
    if (m4) await admin.from('matches').delete().eq('id', m4.id);
    const { error: e5 } = await ins(5);
    expect('degree 5 still violates the check', !!e5 && /check|constraint/i.test(e5.message), e5?.message ?? 'succeeded');
  }

  console.log('\n[A1 — suspended members leave the candidate pool]');
  {
    const caller = await mkUser('caller', { plan: 'bloom' });
    const cand = await mkUser('cand', { plan: 'bloom' });
    const callerAsset = await mkAsset(caller, 'Caller Product');
    const candAsset = await mkAsset(cand, 'Candidate Product');

    const candidates = async () =>
      (await caller.client.rpc('eligible_match_candidates', { p_my_asset_id: callerAsset })).data ?? [];
    const hasCand = (list) => list.some((c) => c.candidate_user_id === cand.id);

    expect('active candidate is visible', hasCand(await candidates()), 'candidate missing while active');

    await setStanding(cand.id, 'suspended');
    expect('suspended candidate is hidden', !hasCand(await candidates()), 'candidate still listed while suspended');

    const { error: cmErr } = await caller.client.rpc('create_match', {
      p_other_user_id: cand.id, p_my_asset_id: callerAsset, p_their_asset_id: candAsset,
    });
    expect('create_match rejects a suspended target', !!cmErr && /not currently available/i.test(cmErr.message), cmErr?.message ?? 'succeeded');

    await setStanding(cand.id, 'warned');
    expect("'warned' candidate stays eligible", hasCand(await candidates()), 'candidate missing while warned');

    await setStanding(cand.id, 'active');
    await admin.from('assets').update({ moderation_status: 'removed' }).eq('id', candAsset);
    expect('candidate with only a moderation-removed asset is hidden', !hasCand(await candidates()), 'removed-asset candidate still listed');
    await admin.from('assets').update({ moderation_status: 'ok' }).eq('id', candAsset);
  }

  console.log('\n[A2 — Proof Lab rating recomputed on remove/restore]');
  {
    const seller = await mkUser('seller', { plan: 'bloom' });
    const buyer = await mkUser('buyer', { plan: 'bloom' });
    const mod = await mkUser('mod', { role: 'moderator' });

    const { data: listingId, error: lErr } = await seller.client.rpc('create_proof_lab_listing', {
      p_title: `Audit ${rand}`, p_description: 'a thorough audit', p_category_slug: 'automation' });
    if (lErr) throw new Error(`create_proof_lab_listing: ${lErr.message}`);
    const { data: deal } = await admin.from('proof_lab_deal_requests').insert({
      listing_id: listingId, requester_user_id: buyer.id, seller_user_id: seller.id,
      requester_email: 'b@ex.com', status: 'completed', donation_percent: 10, deal_value_cents: 10000,
    }).select('id').single();
    const { data: reviewId, error: rErr } = await buyer.client.rpc('create_proof_lab_review', {
      p_deal_id: deal.id, p_stars: 5, p_written: 'excellent work throughout' });
    if (rErr) throw new Error(`create_proof_lab_review: ${rErr.message}`);

    let p = await profileOf(seller.id, 'proof_lab_rating_avg, proof_lab_rating_count');
    expect('review sets avg 5 / count 1', Number(p.proof_lab_rating_avg) === 5 && p.proof_lab_rating_count === 1, JSON.stringify(p));

    const { data: fid, error: repErr } = await seller.client.rpc('report_content', {
      p_content_type: 'proof_lab_review', p_content_id: reviewId, p_reason: 'test' });
    if (repErr) throw new Error(`report_content: ${repErr.message}`);

    const { error: remErr } = await mod.client.rpc('resolve_flag', { p_flag_id: fid, p_action: 'remove_content' });
    expect('remove_content succeeds', !remErr, remErr?.message ?? '');
    p = await profileOf(seller.id, 'proof_lab_rating_avg, proof_lab_rating_count');
    expect('removal zeroes the aggregate', Number(p.proof_lab_rating_avg) === 0 && p.proof_lab_rating_count === 0, JSON.stringify(p));

    const { error: resErr } = await mod.client.rpc('resolve_flag', { p_flag_id: fid, p_action: 'restore_content' });
    expect('restore_content succeeds', !resErr, resErr?.message ?? '');
    p = await profileOf(seller.id, 'proof_lab_rating_avg, proof_lab_rating_count');
    expect('restore recomputes back to 5 / 1', Number(p.proof_lab_rating_avg) === 5 && p.proof_lab_rating_count === 1, JSON.stringify(p));
    const { data: acts } = await admin.from('moderation_actions').select('action').eq('flag_id', fid);
    expect('audit rows for remove + restore', (acts ?? []).map((a) => a.action).sort().join(',') === 'remove_content,restore_content', JSON.stringify(acts));

    console.log('\n[A1 — suspended sellers off member surfaces]');
    const seen = async (client) => ((await client.from('proof_lab_listings').select('id').eq('id', listingId)).data ?? []).length;
    expect('buyer sees the active listing', (await seen(buyer.client)) === 1);
    const lb = async () => ((await buyer.client.rpc('proof_lab_fundraiser_leaderboard')).data ?? []).some((r) => r.seller_user_id === seller.id);
    expect('seller ranks on the fundraiser leaderboard', await lb(), 'seller missing while active');

    await setStanding(seller.id, 'suspended');
    expect("suspended seller's listing hidden from members", (await seen(buyer.client)) === 0, 'still visible');
    expect('suspended seller still sees their own listing', (await seen(seller.client)) === 1, 'owner lost visibility');
    expect('suspended seller off the leaderboard', !(await lb()), 'still ranked');
    await setStanding(seller.id, 'active');
  }

  console.log('\n[A2 — feedback rating recomputed on remove/restore]');
  {
    const reviewer = await mkUser('rev', { plan: 'bloom' });
    const reviewee = await mkUser('ree', { plan: 'bloom' });
    const mod2 = await mkUser('mod2', { role: 'moderator' });
    const { data: match } = await admin.from('matches').insert({
      member_a_user_id: reviewer.id, member_b_user_id: reviewee.id,
      member_a_asset_id: await archivedAsset(reviewer.id), member_b_asset_id: await archivedAsset(reviewee.id),
      source: 'browse', status: 'matched',
    }).select('id').single();
    const { data: fsId, error: fbErr } = await reviewer.client.rpc('submit_feedback', {
      p_match_id: match.id, p_stars: 5, p_written_feedback: 'sharp, clear thinking' });
    if (fbErr) throw new Error(`submit_feedback: ${fbErr.message}`);
    const { error: rateErr } = await reviewee.client.rpc('rate_member_feedback', {
      p_feedback_submission_id: fsId, p_stars: 5 });
    if (rateErr) throw new Error(`rate_member_feedback: ${rateErr.message}`);

    let p = await profileOf(reviewer.id, 'feedback_rating_avg, feedback_rating_count');
    expect('rating sets avg 5 / count 1', Number(p.feedback_rating_avg) === 5 && p.feedback_rating_count === 1, JSON.stringify(p));

    const { data: fid2, error: rep2Err } = await reviewee.client.rpc('report_content', {
      p_content_type: 'feedback', p_content_id: fsId, p_reason: 'test' });
    if (rep2Err) throw new Error(`report_content(feedback): ${rep2Err.message}`);

    await mod2.client.rpc('resolve_flag', { p_flag_id: fid2, p_action: 'remove_content' });
    p = await profileOf(reviewer.id, 'feedback_rating_avg, feedback_rating_count');
    expect("removal zeroes the author's feedback rating", Number(p.feedback_rating_avg) === 0 && p.feedback_rating_count === 0, JSON.stringify(p));

    await mod2.client.rpc('resolve_flag', { p_flag_id: fid2, p_action: 'restore_content' });
    p = await profileOf(reviewer.id, 'feedback_rating_avg, feedback_rating_count');
    expect('restore recomputes back to 5 / 1', Number(p.feedback_rating_avg) === 5 && p.feedback_rating_count === 1, JSON.stringify(p));
  }

  console.log('\n[C — get_public_asset returns updated_at]');
  const owner = await mkUser('owner', { plan: 'bloom' });
  const assetId = await mkAsset(owner, `Indexed Widget ${rand}`);
  let assetSlug = null;
  {
    const { error: vErr } = await owner.client.rpc('set_asset_visibility', { p_asset_id: assetId, p_visibility: 'public' });
    if (vErr) throw new Error(`set_asset_visibility: ${vErr.message}`);
    const { error: sErr2 } = await owner.client.rpc('set_asset_searchable', { p_asset_id: assetId, p_value: true });
    if (sErr2) throw new Error(`set_asset_searchable: ${sErr2.message}`);
    const { data: row } = await admin.from('assets').select('public_slug').eq('id', assetId).single();
    assetSlug = row?.public_slug;
    const { data: pub, error: gErr } = await anon.rpc('get_public_asset', { p_slug: assetSlug });
    expect('anon get_public_asset succeeds', !gErr && pub?.length === 1, gErr?.message ?? `rows=${pub?.length}`);
    expect('row includes updated_at', pub?.[0] && 'updated_at' in pub[0] && !!pub[0].updated_at, JSON.stringify(pub?.[0]));
    expect('row is indexable (bloom + searchable)', pub?.[0]?.indexable === true, JSON.stringify(pub?.[0]));
  }

  console.log('\n[HTTP — JSON-LD + honest copy] (needs dev server)');
  {
    let up = true;
    try { await fetch(`${BASE}/`, { redirect: 'manual' }); } catch { up = false; }
    if (!up) {
      skip('CreativeWork JSON-LD on /a/[slug]', `no server at ${BASE}`);
      skip('noindex asset page has no JSON-LD', `no server at ${BASE}`);
      skip('marketing copy checks', `no server at ${BASE}`);
    } else {
      const pageHtml = await (await fetch(`${BASE}/a/${assetSlug}`)).text();
      expect('indexable asset page emits CreativeWork JSON-LD',
        pageHtml.includes('application/ld+json') && pageHtml.includes('"CreativeWork"'), 'no JSON-LD block');
      expect('JSON-LD names the creator Person', pageHtml.includes('"creator"') && pageHtml.includes('"Person"'), 'no creator');

      await owner.client.rpc('set_asset_searchable', { p_asset_id: assetId, p_value: false });
      const offHtml = await (await fetch(`${BASE}/a/${assetSlug}`)).text();
      expect('non-indexable asset page has no CreativeWork JSON-LD', !offHtml.includes('"CreativeWork"'), 'JSON-LD still present');
      expect('non-indexable asset page is noindex', /noindex/.test(offHtml), 'no noindex robots meta');

      const how = await (await fetch(`${BASE}/how-it-works`)).text();
      const pricing = await (await fetch(`${BASE}/pricing`)).text();
      expect('no stale "Q3 2025" label', !how.includes('Q3 2025') && !pricing.includes('Q3 2025'));
      expect('no "disable semi-duplicate matching in preferences" claim', !how.includes('disable semi-duplicate matching in preferences'));
      expect('no "Semi-duplicate match settings" pricing row', !pricing.includes('Semi-duplicate match settings'));
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
