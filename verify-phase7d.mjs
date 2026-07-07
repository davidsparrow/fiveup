// Live verification for Phase 7d — admin moderation console DATA PATH.
//
// The /admin route + server action are thin: a gate (is_moderator) plus the
// data-layer calls this script drives directly with real auth — the same RPCs
// the console page and resolveFlagAction use. The route/action/imports are
// additionally covered by `npm run build`, and the unauthenticated HTTP gate by
// the redirect check that follows this script.
//
//   node verify-phase7d.mjs

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
  const email = `verify7d-${tag}-${rand}@example.com`;
  const password = 'Verify7d!' + rand;
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

// mirrors data.js getModerationAccess
async function access(c) {
  const [{ data: isModerator }, { data: isAdmin }] = await Promise.all([c.rpc('is_moderator'), c.rpc('is_admin')]);
  return { isModerator: !!isModerator, isAdmin: !!isAdmin };
}

try {
  const mod = await mkUser('mod', { role: 'moderator' });
  const adm = await mkUser('adm', { role: 'admin' });
  const author = await mkUser('author', { plan: 'bloom' });
  const member = await mkUser('member');
  console.log(`mod=${mod.id} adm=${adm.id} author=${author.id} member=${member.id}`);

  // seed a reported (pending) flag the console would show
  const { data: listingId } = await author.client.rpc('create_proof_lab_listing', {
    p_title: 'console test listing', p_description: 'a listing to moderate', p_category_slug: 'automation' });
  const { data: flagId } = await member.client.rpc('report_content', {
    p_content_type: 'proof_lab_listing', p_content_id: listingId, p_reason: 'test report' });

  console.log('\n[console gate — getModerationAccess]');
  {
    const m = await access(mod.client);
    expect('moderator: isModerator true, isAdmin false (queue yes, ops no)', m.isModerator && !m.isAdmin, JSON.stringify(m));
    const a = await access(adm.client);
    expect('admin: isModerator true, isAdmin true (queue + ops)', a.isModerator && a.isAdmin, JSON.stringify(a));
    const mem = await access(member.client);
    expect('plain member: isModerator false (route would redirect)', !mem.isModerator, JSON.stringify(mem));
  }

  console.log('\n[queue — list_moderation_queue]');
  {
    const { data: q, error } = await mod.client.rpc('list_moderation_queue', { p_status: 'pending' });
    expect('moderator loads the pending queue', !error && Array.isArray(q), `err=${error && error.message}`);
    const row = (q ?? []).find((r) => r.id === flagId);
    expect('seeded flag appears with a rendered snippet', row && /console test listing/.test(row.snippet ?? ''), `snippet=${row && row.snippet}`);
    const { error: memErr } = await member.client.rpc('list_moderation_queue', { p_status: 'pending' });
    expect('plain member cannot load the queue', !!memErr && /admin only/.test(memErr.message), `err=${memErr && memErr.message}`);
  }

  console.log('\n[action — resolveFlagAction path via resolve_flag]');
  {
    const { error } = await mod.client.rpc('resolve_flag', { p_flag_id: flagId, p_action: 'dismiss', p_notes: 'from console' });
    expect('moderator action resolves the flag', !error, `err=${error && error.message}`);
    const { data: pending } = await mod.client.rpc('list_moderation_queue', { p_status: 'pending' });
    expect('flag leaves the pending queue after action', !(pending ?? []).some((r) => r.id === flagId));
    const { data: dismissed } = await mod.client.rpc('list_moderation_queue', { p_status: 'dismissed' });
    expect('flag appears under the dismissed filter', (dismissed ?? []).some((r) => r.id === flagId));
  }

  console.log('\n[ops section — admin only]');
  {
    const { error: adminOk } = await adm.client.rpc('proof_lab_deals_awaiting_confirmation', { p_stale_days: 14 });
    expect('admin can load the awaiting-confirmation ops flag', !adminOk, `err=${adminOk && adminOk.message}`);
    const { error: modErr } = await mod.client.rpc('proof_lab_deals_awaiting_confirmation', { p_stale_days: 14 });
    expect('moderator (non-admin) is refused the ops flag', !!modErr && /admin only/.test(modErr.message), `err=${modErr && modErr.message}`);
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  await admin.from('moderation_actions').delete().in('admin_user_id', userIds);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
