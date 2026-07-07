// Live verification for Phase 7c — moderation actions + enforcement.
//
// A *moderator*-role user (not an admin) resolves flags; a plain member is
// refused. Covers dismiss / remove_content (+ RLS hiding from other members) /
// warn / suspend (+ write RPCs blocked, reads still work) / reinstate, each
// writing an audit row and advancing the flag's status.
//
//   node verify-phase7c.mjs

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

async function mkUser(tag, { plan, role } = {}) {
  const email = `verify7c-${tag}-${rand}@example.com`;
  const password = 'Verify7c!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  userIds.push(id);
  if (plan) await admin.from('user_profiles').update({ plan_code: plan }).eq('user_id', id);
  if (role) {
    const { error: rErr } = await admin.from('user_roles').insert({ user_id: id, role });
    if (rErr) throw new Error(`grantRole(${tag}): ${rErr.message}`);
  }
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn(${tag}): ${sErr.message}`);
  return { id, email, client };
}

const flagOn = async (type, id) => (await admin.from('moderation_flags').select('*').eq('content_type', type).eq('content_id', id)).data?.[0];
const flagById = async (id) => (await admin.from('moderation_flags').select('*').eq('id', id)).data?.[0];
const profile = async (id) => (await admin.from('user_profiles').select('account_status').eq('user_id', id)).data?.[0];
const actionsFor = async (flagId) => (await admin.from('moderation_actions').select('*').eq('flag_id', flagId)).data ?? [];

try {
  const mod = await mkUser('mod', { role: 'moderator' });      // moderator, NOT admin
  const author = await mkUser('author', { plan: 'bloom' });    // owns removable content
  const viewer = await mkUser('viewer');                       // another member / reporter
  const badActor = await mkUser('bad');                        // gets suspended
  console.log(`mod=${mod.id} author=${author.id} viewer=${viewer.id} bad=${badActor.id}`);

  // ── authority: only a moderator/admin can resolve ──────────────────────
  console.log('\n[resolve_flag authority]');
  {
    const { data: listingId } = await author.client.rpc('create_proof_lab_listing', {
      p_title: 'audit service', p_description: 'a thorough audit', p_category_slug: 'automation' });
    const { data: fid } = await viewer.client.rpc('report_content', {
      p_content_type: 'proof_lab_listing', p_content_id: listingId, p_reason: 'spam' });
    const { error: memberErr } = await viewer.client.rpc('resolve_flag', { p_flag_id: fid, p_action: 'dismiss' });
    expect('a plain member cannot resolve a flag', !!memberErr && /moderator or admin only/.test(memberErr.message), `err=${memberErr && memberErr.message}`);
    globalThis._listingId = listingId; globalThis._fid = fid;
  }

  // ── remove_content: hides content from other members, keeps it for owner ─
  console.log('\n[resolve_flag remove_content]');
  {
    const listingId = globalThis._listingId, fid = globalThis._fid;
    const seenBefore = (await viewer.client.from('proof_lab_listings').select('id').eq('id', listingId)).data ?? [];
    expect('viewer sees the active listing before removal', seenBefore.length === 1, `saw ${seenBefore.length}`);

    const { error } = await mod.client.rpc('resolve_flag', { p_flag_id: fid, p_action: 'remove_content', p_notes: 'removed for spam' });
    expect('moderator (not admin) can resolve', !error, `err=${error && error.message}`);

    const { data: row } = await admin.from('proof_lab_listings').select('moderation_status').eq('id', listingId).single();
    expect('content marked removed', row && row.moderation_status === 'removed', `status=${row && row.moderation_status}`);
    const seenAfter = (await viewer.client.from('proof_lab_listings').select('id').eq('id', listingId)).data ?? [];
    expect('other member can no longer see removed content (RLS)', seenAfter.length === 0, `saw ${seenAfter.length}`);
    const ownerSees = (await author.client.from('proof_lab_listings').select('id').eq('id', listingId)).data ?? [];
    expect('owner still sees their own removed content', ownerSees.length === 1, `saw ${ownerSees.length}`);
    const modSees = (await mod.client.from('proof_lab_listings').select('id').eq('id', listingId)).data ?? [];
    expect('moderator still sees removed content', modSees.length === 1, `saw ${modSees.length}`);

    expect('flag advanced to resolved', (await flagById(fid))?.status === 'resolved', `status=${(await flagById(fid))?.status}`);
    const acts = await actionsFor(fid);
    expect('audit row written (remove_content)', acts.length === 1 && acts[0].action === 'remove_content' && acts[0].admin_user_id === mod.id && acts[0].target_user_id === author.id,
      JSON.stringify(acts));
  }

  // ── dismiss ──────────────────────────────────────────────────────────────
  console.log('\n[resolve_flag dismiss]');
  {
    const { data: aId } = await author.client.rpc('create_asset', {
      p_name: 'ordinary asset', p_public_url: 'https://ex.com/a', p_asset_type: 'digital_product_saas' });
    const { data: fid } = await viewer.client.rpc('report_content', { p_content_type: 'asset', p_content_id: aId, p_reason: 'mistaken' });
    await mod.client.rpc('resolve_flag', { p_flag_id: fid, p_action: 'dismiss', p_notes: 'not a violation' });
    expect('flag advanced to dismissed', (await flagById(fid))?.status === 'dismissed');
    expect('dismiss does NOT remove the content', (await admin.from('assets').select('moderation_status').eq('id', aId).single()).data?.moderation_status === 'ok');
    const acts = await actionsFor(fid);
    expect('audit row written (dismiss)', acts.length === 1 && acts[0].action === 'dismiss', JSON.stringify(acts));
  }

  // ── warn_user ──────────────────────────────────────────────────────────
  console.log('\n[resolve_flag warn_user]');
  {
    const fid = (await viewer.client.rpc('report_content', { p_content_type: 'profile_bio', p_content_id: author.id, p_reason: 'tone' })).data;
    await mod.client.rpc('resolve_flag', { p_flag_id: fid, p_action: 'warn_user' });
    expect('warned user account_status = warned', (await profile(author.id))?.account_status === 'warned', `status=${(await profile(author.id))?.account_status}`);
    // a warned user can still write
    const { error } = await author.client.rpc('update_my_profile', { p_bio: 'updated bio after warning' });
    expect('a warned user can still write', !error, `err=${error && error.message}`);
  }

  // ── suspend_user: writes blocked, reads + reporting still work ──────────
  console.log('\n[resolve_flag suspend_user]');
  {
    const { data: aId } = await badActor.client.rpc('create_asset', {
      p_name: 'bad actor asset', p_public_url: 'https://ex.com/b', p_asset_type: 'digital_product_saas' });
    const fid = (await viewer.client.rpc('report_content', { p_content_type: 'asset', p_content_id: aId, p_reason: 'abuse' })).data;
    await mod.client.rpc('resolve_flag', { p_flag_id: fid, p_action: 'suspend_user', p_notes: 'repeat abuse' });
    expect('suspended user account_status = suspended', (await profile(badActor.id))?.account_status === 'suspended');

    const { error: e1 } = await badActor.client.rpc('update_my_profile', { p_bio: 'trying to write while suspended' });
    expect('suspended user blocked from update_my_profile', !!e1 && /suspended/.test(e1.message), `err=${e1 && e1.message}`);
    const { error: e2 } = await badActor.client.rpc('create_asset', {
      p_name: 'another', p_public_url: 'https://ex.com/c', p_asset_type: 'digital_product_saas' });
    expect('suspended user blocked from create_asset', !!e2 && /suspended/.test(e2.message), `err=${e2 && e2.message}`);

    // reads still work
    const reads = await badActor.client.from('proof_lab_listings').select('id').limit(1);
    expect('suspended user can still read', !reads.error, `err=${reads.error && reads.error.message}`);
    // reporting is a safety action, not guarded by standing
    const { error: repErr } = await badActor.client.rpc('report_content', { p_content_type: 'profile_bio', p_content_id: author.id, p_reason: 'still can report' });
    expect('suspended user can still report content', !repErr, `err=${repErr && repErr.message}`);

    globalThis._badFlag = fid;
  }

  // ── reinstate_user ───────────────────────────────────────────────────────
  console.log('\n[resolve_flag reinstate_user]');
  {
    await mod.client.rpc('resolve_flag', { p_flag_id: globalThis._badFlag, p_action: 'reinstate_user', p_notes: 'appeal accepted' });
    expect('reinstated user account_status = active', (await profile(badActor.id))?.account_status === 'active');
    const { error } = await badActor.client.rpc('update_my_profile', { p_bio: 'writing again after reinstatement' });
    expect('reinstated user can write again', !error, `err=${error && error.message}`);
  }

  // ── audit-trail RLS ──────────────────────────────────────────────────────
  console.log('\n[moderation_actions RLS]');
  {
    const { data: asMember } = await viewer.client.from('moderation_actions').select('id');
    expect('plain member cannot read the audit trail', (asMember ?? []).length === 0, `saw ${(asMember ?? []).length}`);
    const { data: asMod } = await mod.client.from('moderation_actions').select('id');
    expect('moderator can read the audit trail', (asMod ?? []).length >= 4, `saw ${(asMod ?? []).length}`);
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  await admin.from('moderation_actions').delete().in('admin_user_id', userIds); // admin_user_id is RESTRICT
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
