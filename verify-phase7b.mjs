// Live verification for Phase 7b — member reporting + admin moderation queue.
//
// Creates an author (owns the reported content), two reporters, and an admin.
// Exercises report_content (owner resolved server-side, dedupe, self-report and
// not-found guards) and list_moderation_queue (admin-only, rendered snippet).
//
// Cleanup deletes the temp users; flags cascade off the content owner.
//
//   node verify-phase7b.mjs

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

async function mkUser(tag, { plan, displayName, isAdmin } = {}) {
  const email = `verify7b-${tag}-${rand}@example.com`;
  const password = 'Verify7b!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  userIds.push(id);
  const patch = {};
  if (plan) patch.plan_code = plan;
  if (displayName) patch.display_name = displayName;
  if (Object.keys(patch).length) await admin.from('user_profiles').update(patch).eq('user_id', id);
  if (isAdmin) {
    const { error: rErr } = await admin.from('user_roles').insert({ user_id: id, role: 'admin' });
    if (rErr) throw new Error(`grantAdmin(${tag}): ${rErr.message}`);
  }
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn(${tag}): ${sErr.message}`);
  return { id, email, client };
}

async function flagsOn(type, contentId) {
  const { data } = await admin.from('moderation_flags').select('*')
    .eq('content_type', type).eq('content_id', contentId);
  return data ?? [];
}

try {
  const author = await mkUser('author', { displayName: 'Author One' });
  const reporter = await mkUser('reporter', { displayName: 'Reporter One' });
  const reporter2 = await mkUser('reporter2', { displayName: 'Reporter Two' });
  const adminU = await mkUser('admin', { displayName: 'Admin One', isAdmin: true });
  console.log(`author=${author.id}\nreporter=${reporter.id}\nadmin=${adminU.id}`);

  // ── author-owned content to report ─────────────────────────────────────
  const BIO = 'clean professional bio, nothing wrong here';
  await author.client.rpc('update_my_profile', { p_bio: BIO }); // profile_bio, content_id = author.id
  const { data: assetId } = await author.client.rpc('create_asset', {
    p_name: 'reportable widget', p_public_url: 'https://ex.com/w', p_asset_type: 'digital_product_saas',
    p_description: 'an ordinary product listing',
  });

  // ── report_content ─────────────────────────────────────────────────────
  console.log('\n[report_content]');
  {
    const { data: fid, error } = await reporter.client.rpc('report_content', {
      p_content_type: 'profile_bio', p_content_id: author.id, p_reason: 'harassment in bio' });
    expect('member report returns a flag id', !error && !!fid, `err=${error && error.message}`);
    const rows = await flagsOn('profile_bio', author.id);
    const mine = rows.find((r) => r.id === fid);
    expect('flag persisted with resolved owner', mine && mine.content_owner_user_id === author.id, `owner=${mine && mine.content_owner_user_id}`);
    expect('flag records the reporter', mine && mine.reporter_user_id === reporter.id, `reporter=${mine && mine.reporter_user_id}`);
    expect('member report leaves auto_severity null', mine && mine.auto_severity === null, `sev=${mine && mine.auto_severity}`);
    expect('flag status pending', mine && mine.status === 'pending', `status=${mine && mine.status}`);
    expect('reason stored', mine && mine.reason === 'harassment in bio', `reason=${mine && mine.reason}`);

    // dedupe: same reporter + same content → same flag, no new row
    const { data: again } = await reporter.client.rpc('report_content', {
      p_content_type: 'profile_bio', p_content_id: author.id, p_reason: 'again' });
    expect('repeat report by same reporter is deduped (same id)', again === fid, `again=${again} first=${fid}`);
    expect('dedupe created no second row', (await flagsOn('profile_bio', author.id)).filter((r) => r.reporter_user_id === reporter.id).length === 1);

    // a different reporter on the same content IS allowed
    const { data: fid2, error: e2 } = await reporter2.client.rpc('report_content', {
      p_content_type: 'profile_bio', p_content_id: author.id, p_reason: 'me too' });
    expect('a different reporter can report the same content', !e2 && !!fid2 && fid2 !== fid, `err=${e2 && e2.message}`);

    // report a different content type
    const { data: aFid, error: aErr } = await reporter.client.rpc('report_content', {
      p_content_type: 'asset', p_content_id: assetId, p_reason: 'spam asset' });
    const aRow = (await flagsOn('asset', assetId)).find((r) => r.id === aFid);
    expect('member can report an asset', !aErr && aRow && aRow.content_owner_user_id === author.id, `err=${aErr && aErr.message}`);
  }

  // ── guards ──────────────────────────────────────────────────────────────
  console.log('\n[report_content guards]');
  {
    const { error: selfErr } = await author.client.rpc('report_content', {
      p_content_type: 'profile_bio', p_content_id: author.id });
    expect('reporting your own content is rejected', !!selfErr && /own content/.test(selfErr.message), `err=${selfErr && selfErr.message}`);

    const { error: nfErr } = await reporter.client.rpc('report_content', {
      p_content_type: 'asset', p_content_id: '00000000-0000-0000-0000-000000000000' });
    expect('reporting nonexistent content is rejected', !!nfErr && /content not found/.test(nfErr.message), `err=${nfErr && nfErr.message}`);
  }

  // ── list_moderation_queue ────────────────────────────────────────────────
  console.log('\n[list_moderation_queue]');
  {
    const { error: forbid } = await reporter.client.rpc('list_moderation_queue', { p_status: 'pending' });
    expect('non-admin cannot read the queue', !!forbid && /admin only/.test(forbid.message), `err=${forbid && forbid.message}`);

    const { data: queue, error } = await adminU.client.rpc('list_moderation_queue', { p_status: 'pending' });
    expect('admin can read the queue', !error && Array.isArray(queue), `err=${error && error.message}`);
    const bioFlag = (queue ?? []).find((r) => r.content_type === 'profile_bio' && r.content_id === author.id && r.reporter_user_id === reporter.id);
    expect('queue includes the reported bio flag', !!bioFlag, 'bio flag missing from queue');
    expect('queue renders the offending snippet', bioFlag && bioFlag.snippet && bioFlag.snippet.includes(BIO), `snippet=${bioFlag && bioFlag.snippet}`);
    expect('queue resolves owner display name', bioFlag && bioFlag.owner_display_name === 'Author One', `owner=${bioFlag && bioFlag.owner_display_name}`);
    expect('queue resolves reporter display name', bioFlag && bioFlag.reporter_display_name === 'Reporter One', `rep=${bioFlag && bioFlag.reporter_display_name}`);

    const assetFlag = (queue ?? []).find((r) => r.content_type === 'asset' && r.content_id === assetId);
    expect('queue renders the asset snippet', assetFlag && assetFlag.snippet && assetFlag.snippet.includes('reportable widget'), `snippet=${assetFlag && assetFlag.snippet}`);

    // status filter excludes non-matching statuses
    const { data: resolved } = await adminU.client.rpc('list_moderation_queue', { p_status: 'resolved' });
    expect('status filter excludes pending flags', !(resolved ?? []).some((r) => r.content_id === author.id && r.reporter_user_id === reporter.id), 'pending flag leaked into resolved filter');
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
