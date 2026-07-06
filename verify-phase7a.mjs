// Live verification for Phase 7a — blocklist + automated flagging on write.
//
// Creates two temp users (a buyer on the default plan, a seller on 'bloom' so
// Proof Lab listings are unlocked), then drives ALL SIX moderated write RPCs
// plus update_my_profile as the real authenticated author, asserting the
// block / flag / clean behaviour and the moderation_flags side effects at each.
//
// Heavy prerequisites that 7a does not touch (a match, a completed deal) are
// seeded directly with the service role — the point here is to exercise each
// RPC's moderation wiring, not re-test match-making or the deal lifecycle.
//
// Cleanup deletes the two users; every fixture cascades off them.
//
//   node verify-phase7a.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY from .env.local.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ── env ──────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const BLOCK_RE = /prohibited language/;

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
const ok = (name) => { passed++; console.log(`  ✓ ${name}`); };
const bad = (name, detail) => { failed++; console.log(`  ✗ ${name}\n      ${detail}`); };
const expect = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail));

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const userIds = [];

async function mkUser(tag, plan) {
  const email = `verify7a-${tag}-${rand}@example.com`;
  const password = 'Verify7a!' + rand;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (cErr) throw new Error(`createUser(${tag}): ${cErr.message}`);
  const id = created.user.id;
  userIds.push(id);
  if (plan) {
    const { error } = await admin.from('user_profiles').update({ plan_code: plan }).eq('user_id', id);
    if (error) throw new Error(`setPlan(${tag}): ${error.message}`);
  }
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn(${tag}): ${sErr.message}`);
  return { id, email, client };
}

// flags currently owned by a given user, oldest first
async function flagsFor(uid) {
  const { data } = await admin.from('moderation_flags').select('*')
    .eq('content_owner_user_id', uid).order('created_at', { ascending: true });
  return data ?? [];
}
const hasFlag = (rows, type, id) => rows.some((r) => r.content_type === type && r.content_id === id);

// Assert one RPC's full moderation contract: block rejects, flag writes + logs a
// system flag of the right shape, clean writes without a flag.
async function assertModeratedWrite({ label, owner, type, block, flag, clean, idOf }) {
  console.log(`\n[${label}]`);
  const { error: bErr } = await block();
  expect(`${label}: block phrase rejected`, !!bErr && BLOCK_RE.test(bErr.message), `err=${bErr && bErr.message}`);

  const beforeFlag = (await flagsFor(owner)).length;
  const flagRes = await flag();
  expect(`${label}: flag phrase written`, !flagRes.error, `err=${flagRes.error && flagRes.error.message}`);
  const fid = idOf(flagRes);
  const afterFlag = await flagsFor(owner);
  const row = afterFlag.find((r) => r.content_type === type && r.content_id === fid);
  expect(`${label}: system flag recorded`, !!row && afterFlag.length === beforeFlag + 1, `rows ${beforeFlag}->${afterFlag.length}`);
  expect(`${label}: flag is system+pending+flag-severity`,
    row && row.reporter_user_id === null && row.status === 'pending' && row.auto_severity === 'flag',
    row ? `reporter=${row.reporter_user_id} status=${row.status} sev=${row.auto_severity}` : 'no row');

  const beforeClean = (await flagsFor(owner)).length;
  const cleanRes = await clean();
  expect(`${label}: clean write succeeded`, !cleanRes.error, `err=${cleanRes.error && cleanRes.error.message}`);
  expect(`${label}: clean write logged no flag`, (await flagsFor(owner)).length === beforeClean, 'flag count changed');
}

try {
  const buyer = await mkUser('buyer');
  const seller = await mkUser('seller', 'bloom');
  console.log(`buyer=${buyer.id}  seller=${seller.id}`);

  // ── fixtures the moderation layer doesn't own ──────────────────────────
  const mkAsset = async (owner, name) => {
    const { data, error } = await admin.from('assets')
      .insert({ owner_user_id: owner, name, public_url: 'https://ex.com/x', asset_type: 'digital_product_saas', status: 'active' })
      .select('id').single();
    if (error) throw new Error('seed asset: ' + error.message);
    return data.id;
  };
  const buyerAsset = await mkAsset(buyer.id, 'buyer asset');
  const sellerAsset = await mkAsset(seller.id, 'seller asset');
  const { data: matchRow, error: mErr } = await admin.from('matches').insert({
    member_a_user_id: buyer.id, member_b_user_id: seller.id,
    member_a_asset_id: buyerAsset, member_b_asset_id: sellerAsset,
    source: 'browse', status: 'matched',
  }).select('id').single();
  if (mErr) throw new Error('seed match: ' + mErr.message);
  const matchId = matchRow.id;
  // the seed assets only exist to satisfy the match FK (which survives
  // archiving); archive them so they don't consume the buyer's sprout asset quota.
  await admin.from('assets').update({ status: 'archived' }).in('id', [buyerAsset, sellerAsset]);

  // ── scanner sanity (authenticated .rpc) ────────────────────────────────
  console.log('\n[scanner]');
  {
    const g = async (t) => (await buyer.client.rpc('scan_text_for_blocked_phrases', { p_text: t })).data;
    expect('scanner blocks', (await g('go kys now')) === 'block');
    expect('scanner flags', (await g('free money here')) === 'flag');
    expect('scanner passes clean', (await g('lovely portfolio')) === null);
    expect('scanner precedence block>flag', (await g('scam, now kill yourself')) === 'block');
    expect('scanner word-boundary (scammer != scam)', (await g('the scammer emailed')) === null);
  }

  // ── 1. profile bio ─────────────────────────────────────────────────────
  await assertModeratedWrite({
    label: 'update_my_profile', owner: buyer.id, type: 'profile_bio',
    block: () => buyer.client.rpc('update_my_profile', { p_bio: 'you should kill yourself' }),
    flag: () => buyer.client.rpc('update_my_profile', { p_bio: 'dm me for a crypto giveaway' }),
    clean: () => buyer.client.rpc('update_my_profile', { p_bio: 'seasoned product designer' }),
    idOf: () => buyer.id,
  });

  // ── 2. match feedback ──────────────────────────────────────────────────
  await assertModeratedWrite({
    label: 'submit_feedback', owner: buyer.id, type: 'feedback',
    block: () => buyer.client.rpc('submit_feedback', { p_match_id: matchId, p_stars: 5, p_written_feedback: 'go die already' }),
    flag: () => buyer.client.rpc('submit_feedback', { p_match_id: matchId, p_stars: 5, p_written_feedback: 'this is a scam' }),
    clean: () => buyer.client.rpc('submit_feedback', { p_match_id: matchId, p_stars: 5, p_written_feedback: 'genuinely nice work' }),
    idOf: (r) => r.data, // submit_feedback returns the feedback id
  });

  // ── 3. create asset (buyer's sprout plan caps assets at 1: free the slot) ─
  console.log('\n[create_asset]');
  {
    const before = (await flagsFor(buyer.id)).length;
    const { error: bErr } = await buyer.client.rpc('create_asset', {
      p_name: 'kys landing page', p_public_url: 'https://ex.com/a', p_asset_type: 'digital_product_saas' });
    expect('create_asset: block phrase rejected', !!bErr && BLOCK_RE.test(bErr.message), `err=${bErr && bErr.message}`);

    const { data: flaggedId, error: fErr } = await buyer.client.rpc('create_asset', {
      p_name: 'shop', p_public_url: 'https://ex.com/b', p_asset_type: 'digital_product_saas', p_description: 'this is a scam' });
    expect('create_asset: flag phrase written', !fErr && !!flaggedId, `err=${fErr && fErr.message}`);
    const rows = await flagsFor(buyer.id);
    expect('create_asset: system flag recorded', hasFlag(rows, 'asset', flaggedId) && rows.length === before + 1, `rows ${before}->${rows.length}`);

    await admin.from('assets').update({ status: 'archived' }).eq('id', flaggedId); // unrelated quota
    const beforeClean = (await flagsFor(buyer.id)).length;
    const { data: cleanId, error: cErr } = await buyer.client.rpc('create_asset', {
      p_name: 'portfolio', p_public_url: 'https://ex.com/c', p_asset_type: 'digital_product_saas' });
    expect('create_asset: clean write succeeded', !cErr && !!cleanId, `err=${cErr && cErr.message}`);
    expect('create_asset: clean write logged no flag', (await flagsFor(buyer.id)).length === beforeClean);
  }

  // ── 4. proof lab listing (create) — owner is the seller ────────────────
  let listingId = null;
  await assertModeratedWrite({
    label: 'create_proof_lab_listing', owner: seller.id, type: 'proof_lab_listing',
    block: () => seller.client.rpc('create_proof_lab_listing', { p_title: 'kys deal', p_description: 'ok', p_category_slug: 'automation' }),
    flag: () => seller.client.rpc('create_proof_lab_listing', { p_title: 'growth kit', p_description: 'get free money fast', p_category_slug: 'automation' }),
    clean: async () => {
      const r = await seller.client.rpc('create_proof_lab_listing', { p_title: 'audit service', p_description: 'a thorough audit', p_category_slug: 'automation' });
      listingId = r.data;
      return r;
    },
    idOf: (r) => r.data,
  });

  // ── 5. proof lab listing (update) — reuse the clean listing ────────────
  await assertModeratedWrite({
    label: 'update_proof_lab_listing', owner: seller.id, type: 'proof_lab_listing',
    block: () => seller.client.rpc('update_proof_lab_listing', { p_listing_id: listingId, p_title: 'go die', p_description: 'x', p_category_slug: 'automation' }),
    flag: () => seller.client.rpc('update_proof_lab_listing', { p_listing_id: listingId, p_title: 'audit service', p_description: 'buy followers cheap', p_category_slug: 'automation' }),
    clean: () => seller.client.rpc('update_proof_lab_listing', { p_listing_id: listingId, p_title: 'audit service', p_description: 'refreshed copy', p_category_slug: 'automation' }),
    idOf: () => listingId, // update returns void; flag is keyed on the listing id
  });

  // ── 6. deal request note — buyer requests the seller's listing ─────────
  await assertModeratedWrite({
    label: 'request_proof_lab_deal', owner: buyer.id, type: 'deal_note',
    block: () => buyer.client.rpc('request_proof_lab_deal', { p_listing_id: listingId, p_requester_email: 'b@ex.com', p_note: 'kill yourself' }),
    flag: () => buyer.client.rpc('request_proof_lab_deal', { p_listing_id: listingId, p_requester_email: 'b@ex.com', p_note: 'crypto giveaway please' }),
    clean: () => buyer.client.rpc('request_proof_lab_deal', { p_listing_id: listingId, p_requester_email: 'b@ex.com', p_note: 'looks great, keen' }),
    idOf: (r) => r.data,
  });

  // ── 7. engaged-reviewer review — seed two completed deals to review ────
  const mkCompletedDeal = async () => {
    const { data, error } = await admin.from('proof_lab_deal_requests').insert({
      listing_id: listingId, requester_user_id: buyer.id, seller_user_id: seller.id,
      requester_email: 'b@ex.com', status: 'completed',
    }).select('id').single();
    if (error) throw new Error('seed deal: ' + error.message);
    return data.id;
  };
  const dealForBlockFlag = await mkCompletedDeal(); // block rejects (no insert), then flag reviews it
  const dealForClean = await mkCompletedDeal();
  await assertModeratedWrite({
    label: 'create_proof_lab_review', owner: buyer.id, type: 'proof_lab_review',
    block: () => buyer.client.rpc('create_proof_lab_review', { p_deal_id: dealForBlockFlag, p_stars: 5, p_written: 'kys' }),
    flag: () => buyer.client.rpc('create_proof_lab_review', { p_deal_id: dealForBlockFlag, p_stars: 5, p_written: 'total scam experience' }),
    clean: () => buyer.client.rpc('create_proof_lab_review', { p_deal_id: dealForClean, p_stars: 5, p_written: 'great, would recommend' }),
    idOf: (r) => r.data,
  });

  // ── queue RLS + total flag accounting ──────────────────────────────────
  console.log('\n[moderation_flags RLS + tally]');
  {
    const { data: asUser } = await buyer.client.from('moderation_flags').select('id');
    expect('non-admin member cannot read the queue', (asUser ?? []).length === 0, `saw ${(asUser ?? []).length} rows`);
    const buyerFlags = await flagsFor(buyer.id);
    const sellerFlags = await flagsFor(seller.id);
    // buyer: profile, feedback, asset, deal_note, review = 5 ; seller: listing create + update = 2
    expect('buyer accrued 5 auto flags (one per moderated surface)', buyerFlags.length === 5, `got ${buyerFlags.length}: ${buyerFlags.map((r) => r.content_type)}`);
    expect('seller accrued 2 listing auto flags', sellerFlags.length === 2, `got ${sellerFlags.length}: ${sellerFlags.map((r) => r.content_type)}`);
    const types = new Set(buyerFlags.map((r) => r.content_type).concat(sellerFlags.map((r) => r.content_type)));
    expect('every content_type flagged at least once',
      ['profile_bio', 'feedback', 'asset', 'proof_lab_listing', 'deal_note', 'proof_lab_review'].every((t) => types.has(t)),
      [...types].join(','));
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
