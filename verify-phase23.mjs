// Live verification for Phase 23 — member profile cards.
//
// The card lets a member style their photo, add a tagline, pin one approved
// review, and shows review excerpts to free members' visitors for the first
// time. So this asserts: the free-plan gate flipped; the style writer accepts
// only the closed whitelist and the CHECK backs it even against the service
// role; a headline review must be the member's own, approved, and is withheld
// again the moment any excerpt gate closes; the avatar bucket lets a member
// write only under their own id while anyone can read; and the JS style
// contract and the SQL validator are the same list.
//
//   node verify-phase23.mjs
//
// Needs .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY and (for the CHECK-constraint section)
// SUPABASE_PERSONAL_ACCESS_TOKEN.

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

import {
  ALLOWED, DEFAULT_STYLE, STYLE_KEYS, normalizeStyle, isValidStyle,
} from './src/components/fivestarz/profile-card/cardStyle.js';

const env = Object.fromEntries(
  readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const PAT = env.SUPABASE_PERSONAL_ACCESS_TOKEN;
const PROJECT_REF = (URL_ ?? '').replace(/^https:\/\//, '').split('.')[0];

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const tempUserIds = [];

async function mkUser(tag, { plan = 'sprout' } = {}) {
  const email = `verify23-${tag}-${rand}@example.com`;
  const password = 'Verify23!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  tempUserIds.push(id);
  if (plan !== 'sprout') await admin.from('user_profiles').update({ plan_code: plan }).eq('user_id', id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn(${tag}): ${sErr.message}`);
  return { id, email, client };
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

const HANDLE = `cardowner${rand}`.replace(/[^a-z0-9]/g, '').slice(0, 28);
const prof = (u) => anon.rpc('get_public_profile', { p_username: u }).then((r) => r.data ?? []);
const feed = (u) => anon.rpc('get_public_feedback', { p_username: u }).then((r) => r.data ?? []);
const row = async (id) =>
  (await admin.from('user_profiles')
    .select('tagline, profile_style, headline_feedback_source_type, headline_feedback_source_id, avatar_url')
    .eq('user_id', id).single()).data;

// A 1×1 transparent PNG.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const FULL_STYLE = {
  shape: 'arch', ring: 'gradient', ringWidth: 'bold', ringColor: 'teal', ringColor2: 'gold',
  photoBg: 'transparent', shadow: 'strong', photoPos: 'bottom-right', textSide: 'top',
  textAlign: 'left', bgKind: 'gradient', bgColor: 'brown', bgColor2: 'purple', bgPreset: 'dusk',
};

try {
  // ── Fixtures: a free owner, a reviewer, a buyer, and a second owner ──────
  const owner = await mkUser('owner');            // sprout — the point of the gate flip
  const reviewer = await mkUser('reviewer');
  const buyer = await mkUser('buyer');
  const other = await mkUser('other', { plan: 'bloom' });

  await owner.client.rpc('update_my_profile', { p_display_name: 'Card Owner', p_bio: 'builds things', p_location_text: 'Lisbon' });
  await owner.client.rpc('claim_public_username', { p_username: HANDLE });

  const mkAsset = async (uid) => (await admin.from('assets').insert({
    owner_user_id: uid, name: 'x', public_url: 'https://ex.com/x', asset_type: 'digital_product_saas', status: 'archived',
  }).select('id').single()).data.id;

  // match feedback about the owner, with text and a clip
  const { data: match } = await admin.from('matches').insert({
    member_a_user_id: reviewer.id, member_b_user_id: owner.id,
    member_a_asset_id: await mkAsset(reviewer.id), member_b_asset_id: await mkAsset(owner.id),
    source: 'browse', status: 'matched',
  }).select('id').single();
  const { data: fsId, error: fsErr } = await reviewer.client.rpc('submit_feedback', {
    p_match_id: match.id, p_stars: 5, p_written_feedback: 'clear, generous, specific', p_media_url: 'https://ex.com/clip.mp4',
  });
  if (fsErr) throw new Error(`submit_feedback: ${fsErr.message}`);

  // an engaged review about the owner
  await admin.from('user_profiles').update({ plan_code: 'bloom' }).eq('user_id', owner.id); // listings are paid
  const { data: listingId, error: lErr } = await owner.client.rpc('create_proof_lab_listing', {
    p_title: 'Deal listing', p_description: 'x', p_category_slug: 'automation',
  });
  if (lErr) throw new Error(`create_proof_lab_listing: ${lErr.message}`);
  const { data: deal } = await admin.from('proof_lab_deal_requests').insert({
    listing_id: listingId, requester_user_id: buyer.id, seller_user_id: owner.id, requester_email: 'b@ex.com', status: 'completed',
  }).select('id').single();
  const { data: reviewId, error: rErr } = await buyer.client.rpc('create_proof_lab_review', {
    p_deal_id: deal.id, p_stars: 4, p_written: 'delivered exactly what was promised',
  });
  if (rErr) throw new Error(`create_proof_lab_review: ${rErr.message}`);
  await admin.from('user_profiles').update({ plan_code: 'sprout' }).eq('user_id', owner.id); // back to free

  // the other member gets an approved review of their own, to test ownership
  const { data: otherMatch } = await admin.from('matches').insert({
    member_a_user_id: reviewer.id, member_b_user_id: other.id,
    member_a_asset_id: await mkAsset(reviewer.id), member_b_asset_id: await mkAsset(other.id),
    source: 'browse', status: 'matched',
  }).select('id').single();
  const { data: otherFsId } = await reviewer.client.rpc('submit_feedback', {
    p_match_id: otherMatch.id, p_stars: 5, p_written_feedback: 'someone else’s praise',
  });
  await other.client.rpc('approve_public_feedback', { p_source_type: 'match_feedback', p_source_id: otherFsId, p_approved: true });

  console.log('\n[the free plan can publish review excerpts]');
  {
    const { error } = await owner.client.rpc('update_publishing_settings', {
      p_profile_public_enabled: true, p_show_logo: true, p_show_location: true, p_show_stats: true,
      p_show_feedback_excerpts: true,
    });
    expect('a sprout member can turn on feedback excerpts', !error, error?.message ?? '');

    const { error: clipErr } = await owner.client.rpc('update_publishing_settings', { p_show_public_videos: true });
    expect('clips stay paid-only', !!clipErr && /plan/.test(clipErr.message), clipErr?.message ?? 'succeeded');

    expect('nothing shows before approval', (await feed(HANDLE)).length === 0);
    await owner.client.rpc('approve_public_feedback', { p_source_type: 'match_feedback', p_source_id: fsId, p_approved: true });
    await owner.client.rpc('approve_public_feedback', { p_source_type: 'engaged_review', p_source_id: reviewId, p_approved: true });
    const rows = await feed(HANDLE);
    expect('an approved match excerpt is returned for a free member’s profile',
      rows.some((r) => r.kind === 'excerpt' && r.source === 'match' && /generous/.test(r.body)), JSON.stringify(rows));
    expect('an approved engaged review too',
      rows.some((r) => r.kind === 'excerpt' && r.source === 'engaged_review' && r.stars === 4), JSON.stringify(rows));
    expect('the clip is still withheld (public_video_enabled is off for sprout)',
      !rows.some((r) => r.kind === 'clip'), JSON.stringify(rows));

    const { data: caps } = await anon.rpc('public_plan_caps');
    const sproutGate = (caps ?? []).find((c) => c.plan_code === 'sprout' && c.feature_key === 'public_feedback_excerpts_enabled');
    expect('public_plan_caps shows the sprout excerpts gate enabled', sproutGate?.enabled === true, JSON.stringify(sproutGate));
  }

  console.log('\n[update_profile_card — the style whitelist]');
  {
    const rpc = (args) => owner.client.rpc('update_profile_card', args);

    let r = await rpc({ p_profile_style: { shape: 'circle', hex: '#fff' } });
    expect('an unknown key is rejected', !!r.error && /invalid profile style/.test(r.error.message), r.error?.message ?? 'accepted');
    r = await rpc({ p_profile_style: { shape: 'hexagon' } });
    expect('an unknown value is rejected', !!r.error && /invalid profile style/.test(r.error.message), r.error?.message ?? 'accepted');
    r = await rpc({ p_profile_style: { shape: 5 } });
    expect('a non-string value is rejected', !!r.error && /invalid profile style/.test(r.error.message), r.error?.message ?? 'accepted');
    r = await rpc({ p_profile_style: ['circle'] });
    expect('a non-object is rejected', !!r.error, r.error?.message ?? 'accepted');
    r = await rpc({ p_profile_style: { shape: 'circle', ring: 'x'.repeat(1600) } });
    expect('an oversized object is rejected', !!r.error, r.error?.message ?? 'accepted');

    r = await rpc({ p_profile_style: FULL_STYLE });
    expect('a full valid style is accepted', !r.error, r.error?.message ?? '');
    const p = (await prof(HANDLE))[0];
    expect('get_public_profile echoes it', p && JSON.stringify(p.profile_style) === JSON.stringify(FULL_STYLE), JSON.stringify(p?.profile_style));
    expect('normalizeStyle leaves it unchanged',
      JSON.stringify(normalizeStyle(p?.profile_style)) === JSON.stringify(FULL_STYLE));
    expect('the JS validator agrees it is valid', isValidStyle(FULL_STYLE));
    expect('and rejects the same bad inputs',
      !isValidStyle({ shape: 'hexagon' }) && !isValidStyle({ hex: '#fff' }) && !isValidStyle({ shape: 5 }) && !isValidStyle(['circle']));

    r = await rpc({ p_profile_style: {} });
    expect('an empty object is accepted (renderer falls back to defaults)', !r.error, r.error?.message ?? '');
    expect('normalizeStyle({}) is DEFAULT_STYLE', JSON.stringify(normalizeStyle({})) === JSON.stringify(DEFAULT_STYLE));
  }

  console.log('\n[update_profile_card — tagline]');
  {
    const rpc = (args) => owner.client.rpc('update_profile_card', args);

    let r = await rpc({ p_tagline: 'x'.repeat(81) });
    expect('81 characters are rejected', !!r.error && /80 characters/.test(r.error.message), r.error?.message ?? 'accepted');
    r = await rpc({ p_tagline: 'line one\nline two' });
    expect('a newline is collapsed rather than stored', !r.error && (await row(owner.id)).tagline === 'line one line two', r.error?.message ?? (await row(owner.id)).tagline);
    r = await rpc({ p_tagline: 'you should kill yourself' });
    expect('a blocked phrase is refused', !!r.error && /prohibited/.test(r.error.message), r.error?.message ?? 'accepted');
    const flagCount = async () =>
      (await admin.from('moderation_flags').select('id').eq('content_owner_user_id', owner.id).eq('content_type', 'profile_bio')).data?.length ?? 0;
    const flagsBefore = await flagCount();
    r = await rpc({ p_tagline: 'dm me for a crypto giveaway' });
    const flagsAfter = await flagCount();
    expect('a flag phrase is stored and auto-flagged', !r.error && flagsAfter === flagsBefore + 1, `err=${r.error?.message ?? 'none'} flags ${flagsBefore}->${flagsAfter}`);
    r = await rpc({ p_tagline: '  Ships   calm,  honest software  ' });
    expect('whitespace is collapsed and trimmed', !r.error && (await row(owner.id)).tagline === 'Ships calm, honest software', (await row(owner.id)).tagline);
    const p = (await prof(HANDLE))[0];
    expect('the public projection carries the tagline', p?.tagline === 'Ships calm, honest software', String(p?.tagline));
    r = await rpc({ p_clear_tagline: true });
    expect('p_clear_tagline nulls it', !r.error && (await row(owner.id)).tagline === null, String((await row(owner.id)).tagline));
    await rpc({ p_tagline: 'Ships calm, honest software' });
  }

  console.log('\n[update_profile_card — headline review ownership]');
  {
    const rpc = (args) => owner.client.rpc('update_profile_card', args);

    let r = await rpc({ p_headline_source_id: fsId });
    expect('an id without a type is rejected', !!r.error && /source type/.test(r.error.message), r.error?.message ?? 'accepted');

    r = await rpc({ p_headline_source_type: 'match_feedback', p_headline_source_id: otherFsId });
    expect('another member’s approved review cannot be pinned',
      !!r.error && /one you have approved/.test(r.error.message), r.error?.message ?? 'accepted');

    await owner.client.rpc('approve_public_feedback', { p_source_type: 'engaged_review', p_source_id: reviewId, p_approved: false });
    r = await rpc({ p_headline_source_type: 'engaged_review', p_headline_source_id: reviewId });
    expect('an un-approved review of your own cannot be pinned',
      !!r.error && /one you have approved/.test(r.error.message), r.error?.message ?? 'accepted');
    await owner.client.rpc('approve_public_feedback', { p_source_type: 'engaged_review', p_source_id: reviewId, p_approved: true });

    r = await rpc({ p_headline_source_type: 'match_feedback', p_headline_source_id: fsId });
    expect('your own approved review pins', !r.error, r.error?.message ?? '');
    let p = (await prof(HANDLE))[0];
    expect('get_public_profile returns the headline',
      p?.headline_stars === 5 && /generous/.test(p?.headline_body ?? '') && p?.headline_source === 'match',
      JSON.stringify({ s: p?.headline_stars, b: p?.headline_body, src: p?.headline_source }));

    r = await rpc({ p_headline_source_type: 'engaged_review', p_headline_source_id: reviewId });
    p = (await prof(HANDLE))[0];
    expect('switching to the engaged review works and carries the listing title',
      !r.error && p?.headline_source === 'engaged_review' && p?.headline_stars === 4 && p?.headline_product_name === 'Deal listing',
      JSON.stringify({ err: r.error?.message, src: p?.headline_source, name: p?.headline_product_name }));

    // The gates are re-checked at read time, not just at write time.
    await owner.client.rpc('approve_public_feedback', { p_source_type: 'engaged_review', p_source_id: reviewId, p_approved: false });
    p = (await prof(HANDLE))[0];
    const stored = await row(owner.id);
    expect('un-approving the pinned review hides the headline while the pointer stays',
      p?.headline_body === null && stored.headline_feedback_source_id === reviewId, JSON.stringify({ body: p?.headline_body, ptr: stored.headline_feedback_source_id }));
    await owner.client.rpc('approve_public_feedback', { p_source_type: 'engaged_review', p_source_id: reviewId, p_approved: true });

    await owner.client.rpc('update_publishing_settings', { p_show_feedback_excerpts: false });
    p = (await prof(HANDLE))[0];
    expect('turning excerpts off hides the headline too', p?.headline_body === null, String(p?.headline_body));
    await owner.client.rpc('update_publishing_settings', { p_show_feedback_excerpts: true });

    r = await rpc({ p_clear_headline: true });
    const after = await row(owner.id);
    expect('p_clear_headline nulls both columns',
      !r.error && after.headline_feedback_source_type === null && after.headline_feedback_source_id === null, JSON.stringify(after));
    await rpc({ p_headline_source_type: 'match_feedback', p_headline_source_id: fsId });
  }

  console.log('\n[get_public_profile — shape and gating]');
  {
    const { data: cols } = await admin.rpc('get_public_profile', { p_username: HANDLE });
    const keys = Object.keys(cols?.[0] ?? {});
    expect('the twelve original columns still come first',
      keys.slice(0, 12).join(',') === 'display_name,public_username,bio,avatar_url,location_text,feedback_rating_avg,feedback_rating_count,proof_lab_rating_avg,proof_lab_rating_count,categories,searchable,is_demo',
      keys.join(','));
    expect('the six new columns follow',
      keys.slice(12).join(',') === 'tagline,profile_style,headline_stars,headline_body,headline_source,headline_product_name', keys.join(','));

    await owner.client.rpc('update_publishing_settings', { p_profile_public_enabled: false });
    expect('an unpublished profile returns nothing to anon', (await prof(HANDLE)).length === 0);
    await owner.client.rpc('update_publishing_settings', { p_profile_public_enabled: true });
  }

  console.log('\n[the CHECK constraint is a backstop, not just the RPC]');
  if (PAT) {
    const res = await sql(`update public.user_profiles set profile_style = '{"shape":"hexagon"}'::jsonb where user_id = '${owner.id}'`);
    expect('a service-role write of a bad style fails on the constraint',
      !res.ok && /user_profiles_profile_style_valid/.test(res.body), res.body.slice(0, 200));
    const res2 = await sql(`update public.user_profiles set tagline = repeat('x', 81) where user_id = '${owner.id}'`);
    expect('an over-long tagline fails on the constraint',
      !res2.ok && /user_profiles_tagline_len/.test(res2.body), res2.body.slice(0, 200));
  } else {
    console.log('  (skipped: SUPABASE_PERSONAL_ACCESS_TOKEN not set)');
  }

  console.log('\n[update_my_profile — avatar]');
  {
    let r = await owner.client.rpc('update_my_profile', { p_avatar_url: 'http://ex.com/a.png' });
    expect('http:// is rejected', !!r.error && /https/.test(r.error.message), r.error?.message ?? 'accepted');
    r = await owner.client.rpc('update_my_profile', { p_avatar_url: 'javascript:alert(1)' });
    expect('javascript: is rejected', !!r.error, r.error?.message ?? 'accepted');
    r = await owner.client.rpc('update_my_profile', { p_display_name: 'Card Owner', p_bio: 'b', p_location_text: 'Lisbon', p_avatar_url: 'https://ex.com/logo.png' });
    expect('the four-argument call shape still works', !r.error && (await row(owner.id)).avatar_url === 'https://ex.com/logo.png', r.error?.message ?? '');
    r = await owner.client.rpc('update_my_profile', { p_clear_avatar_url: true });
    expect('p_clear_avatar_url nulls the avatar', !r.error && (await row(owner.id)).avatar_url === null, r.error?.message ?? '');
  }

  console.log('\n[the avatars bucket]');
  {
    const path = `${owner.id}/avatar.png`;
    let r = await owner.client.storage.from('avatars').upload(path, PNG_1x1, { contentType: 'image/png', upsert: true });
    expect('the owner can write under their own id', !r.error, r.error?.message ?? '');
    r = await owner.client.storage.from('avatars').upload(`${other.id}/avatar.png`, PNG_1x1, { contentType: 'image/png', upsert: true });
    expect('…but not under another member’s id', !!r.error, 'upload succeeded');
    r = await owner.client.storage.from('avatars').upload(`${owner.id}/notes.txt`, Buffer.from('hi'), { contentType: 'text/plain', upsert: true });
    expect('a non-image type is refused', !!r.error, 'upload succeeded');

    const { data: pub } = anon.storage.from('avatars').getPublicUrl(path);
    const res = await fetch(pub.publicUrl);
    expect('anyone can read the public URL', res.status === 200, `status=${res.status}`);

    r = await owner.client.storage.from('avatars').remove([path]);
    expect('the owner can delete their own object', !r.error, r.error?.message ?? '');
  }

  console.log('\n[the JS contract and the SQL validator are one list]');
  {
    const migration = read('./supabase/migrations/20261027120000_phase23_profile_card.sql');
    const validator = migration.slice(migration.indexOf('profile_style_is_valid(p jsonb)'), migration.indexOf('comment on function public.profile_style_is_valid'));

    const keyList = /k not in \(([^)]*)\)/s.exec(validator)?.[1] ?? '';
    const sqlKeys = [...keyList.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect('the SQL key list equals STYLE_KEYS',
      sqlKeys.length === STYLE_KEYS.length && STYLE_KEYS.every((k) => sqlKeys.includes(k)), `sql=${sqlKeys.join(',')}`);

    for (const key of STYLE_KEYS) {
      const m = new RegExp(`p->>'${key}'\\s+in \\(([^)]*)\\)`).exec(validator);
      const sqlVals = [...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1]);
      const jsVals = ALLOWED[key];
      expect(`${key}: SQL and JS allow the same values`,
        sqlVals.length === jsVals.length && jsVals.every((v) => sqlVals.includes(v)), `sql=${sqlVals.join(',')} js=${jsVals.join(',')}`);
    }

    const cardStyleSrc = read('./src/components/fivestarz/profile-card/cardStyle.js');
    expect('cardStyle.js imports nothing (stays Node-loadable)', !/^\s*import\s/m.test(cardStyleSrc));
  }

  console.log('\n[wiring]');
  {
    expect('the old scrolling profile page is gone', !existsSync(new URL('./src/components/fivestarz/PublicProfilePage.jsx', import.meta.url)));
    const route = read('./src/app/u/[username]/page.jsx');
    expect('the /u route renders ProfileCard', /ProfileCard/.test(route));
    expect('…without the footer', /footer=\{false\}/.test(route));
    const shell = read('./src/components/fivestarz/PageShell.jsx');
    expect('PageShell honours a footer prop', /footer\s*=\s*true/.test(shell) && /footer\s*\?/.test(shell));
    const og = read('./src/app/u/[username]/opengraph-image.jsx');
    expect('the share image uses the style resolver', /resolveStyle/.test(og));

    // The card renders only what the public RPCs hand it; the editor is the
    // one file in the folder allowed to talk to Supabase.
    const { readdirSync } = await import('node:fs');
    const dir = new URL('./src/components/fivestarz/profile-card/', import.meta.url);
    const offenders = readdirSync(dir, { recursive: true })
      .filter((f) => /\.(js|jsx)$/.test(f) && !/ProfileCardEditor\.jsx$/.test(f))
      .filter((f) => /@\/lib\/supabase|@supabase\//.test(readFileSync(new URL(f, dir), 'utf8')));
    expect('nothing under profile-card/ but the editor imports Supabase', offenders.length === 0, offenders.join(','));
  }
} catch (e) {
  bad('script ran to completion', e.stack || e.message);
} finally {
  for (const id of tempUserIds) {
    await admin.storage.from('avatars').remove([`${id}/avatar.png`, `${id}/avatar.jpg`]).catch(() => {});
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
