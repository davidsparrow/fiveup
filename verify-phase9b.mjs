// Live verification for Phase 9b — external profile links on /u/[username].
//
// Exercises owner write RPCs (validation, cap, ownership scoping), the anon
// projection gating (toggle / moderation / suspension / profile-public), that
// anon cannot read the base table, and that the rendered anchors carry safe
// rel attributes.
//
//   BASE_URL=http://localhost:3210 node verify-phase9b.mjs
//   (start `PORT=3210 npm run dev` first)

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

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const userIds = [];

async function mkUser(tag, { plan } = {}) {
  const email = `verify9b-${tag}-${rand}@example.com`;
  const password = 'Verify9b!' + rand;
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

async function waitForServer(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/`, { redirect: 'manual' }); if (r.status > 0) return true; } catch {}
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`dev server never became reachable at ${BASE}`);
}
const get = (path) => fetch(`${BASE}${path}`, { redirect: 'manual' });
const links = (u) => anon.rpc('get_public_links', { p_username: u }).then((r) => r.data ?? []);
const addLink = (u, url, label) => u.client.rpc('add_external_link', { p_url: url, p_label: label ?? null });

const HANDLE = `linkowner${rand}`.replace(/[^a-z0-9]/g, '').slice(0, 28);

try {
  await waitForServer();

  const owner = await mkUser('owner');
  const other = await mkUser('other');
  await owner.client.rpc('update_my_profile', { p_display_name: 'Link Owner', p_bio: 'x' });
  await owner.client.rpc('claim_public_username', { p_username: HANDLE });
  await owner.client.rpc('update_publishing_settings', { p_profile_public_enabled: true, p_show_external_links: true });

  const ALPHA = `https://alpha-${rand}.example.com`;
  const BETA = `https://beta-${rand}.example.com`;

  console.log('\n[owner writes + validation]');
  {
    const { data: id1, error: e1 } = await addLink(owner, ALPHA, 'Alpha Site');
    const { data: id2, error: e2 } = await addLink(owner, BETA, null);
    expect('add valid https link (with label)', !e1 && !!id1, e1 && e1.message);
    expect('add valid https link (no label)', !e2 && !!id2, e2 && e2.message);

    const { error: eHttp } = await addLink(owner, `http://insecure-${rand}.com`, 'x');
    expect('rejects non-https URL', !!eHttp && /https/.test(eHttp.message), `err=${eHttp && eHttp.message}`);
    const { error: eJunk } = await addLink(owner, 'not-a-url', 'x');
    expect('rejects malformed URL', !!eJunk, 'expected an error');
    const { error: eLabel } = await addLink(owner, `https://x-${rand}.com`, 'L'.repeat(81));
    expect('rejects over-long label', !!eLabel && /label/.test(eLabel.message), `err=${eLabel && eLabel.message}`);

    // reorder: beta before alpha
    await owner.client.rpc('reorder_external_links', { p_ids: [id2, id1] });
    const ordered = await links(HANDLE);
    expect('reorder reflected in anon projection order', ordered[0]?.url === BETA && ordered[1]?.url === ALPHA, JSON.stringify(ordered.map((l) => l.url)));
    expect('label passed through; null label omitted', ordered.some((l) => l.label === 'Alpha Site') && ordered.some((l) => l.url === BETA && l.label === null), JSON.stringify(ordered));

    // cap at 5
    await addLink(owner, `https://g1-${rand}.com`);
    await addLink(owner, `https://g2-${rand}.com`);
    await addLink(owner, `https://g3-${rand}.com`); // now 5 total
    const { error: eCap } = await addLink(owner, `https://g4-${rand}.com`);
    expect('enforces 5-link cap', !!eCap && /at most 5/.test(eCap.message), `err=${eCap && eCap.message}`);

    // ownership scoping on remove
    const { error: eRemoveOther } = await other.client.rpc('remove_external_link', { p_id: id1 });
    expect('cannot remove another user’s link', !!eRemoveOther, 'expected an error');
    await owner.client.rpc('remove_external_link', { p_id: id1 });
    expect('owner can remove own link', !(await links(HANDLE)).some((l) => l.url === ALPHA));
  }

  console.log('\n[anon projection gating]');
  {
    expect('links visible when public + toggle on', (await links(HANDLE)).some((l) => l.url === BETA));

    await owner.client.rpc('update_publishing_settings', { p_show_external_links: false });
    expect('hidden when show_external_links off', (await links(HANDLE)).length === 0);
    await owner.client.rpc('update_publishing_settings', { p_show_external_links: true });

    const one = (await links(HANDLE))[0];
    const { data: rowId } = await admin.from('profile_external_links').select('id').eq('url', one.url).single();
    await admin.from('profile_external_links').update({ moderation_status: 'removed' }).eq('id', rowId.id);
    expect('moderation-removed link excluded', !(await links(HANDLE)).some((l) => l.url === one.url));
    await admin.from('profile_external_links').update({ moderation_status: 'ok' }).eq('id', rowId.id);

    await admin.from('user_profiles').update({ account_status: 'suspended' }).eq('user_id', owner.id);
    expect('suspended owner -> no links', (await links(HANDLE)).length === 0);
    await admin.from('user_profiles').update({ account_status: 'active' }).eq('user_id', owner.id);

    await owner.client.rpc('update_publishing_settings', { p_profile_public_enabled: false });
    expect('unpublished profile -> no links', (await links(HANDLE)).length === 0);
    await owner.client.rpc('update_publishing_settings', { p_profile_public_enabled: true });
  }

  console.log('\n[anon cannot read the base table]');
  {
    const { data } = await anon.from('profile_external_links').select('id, url');
    expect('anon SELECT on profile_external_links returns nothing', (data ?? []).length === 0, `saw ${(data ?? []).length}`);
  }

  console.log('\n[anon HTTP GET /u/<handle> — safe anchors]');
  {
    const html = await (await get(`/u/${HANDLE}`)).text();
    expect('renders a link URL', html.includes(BETA), 'link url missing');
    expect('anchors carry rel="nofollow noopener noreferrer"', /rel="nofollow noopener noreferrer"/.test(html), 'rel attrs missing');
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (userIds.length) console.log(`\ncleaned up ${userIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
