// Live verification for Phase 21 / Discord D2a — plan grants.
//
// Asserts that exactly one thing can move a member between plans, that it
// leaves an audit row nobody can rewrite, that a member cannot promote
// themselves by any route, that the retired `flourish` tier is refused, and
// that the marketing surfaces now defer to the WordPress apex.
//
//   node verify-phase21.mjs

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
const PAT = env.SUPABASE_PERSONAL_ACCESS_TOKEN;
const PROJECT_REF = (URL_ ?? '').replace(/^https:\/\//, '').split('.')[0];

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const tempUserIds = [];

async function mkUser(tag, { plan = 'sprout', admin: isAdmin = false } = {}) {
  const email = `verify21-${tag}-${rand}@example.com`;
  const password = 'Verify21!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  tempUserIds.push(id);
  if (plan !== 'sprout') await admin.from('user_profiles').update({ plan_code: plan }).eq('user_id', id);
  if (isAdmin) {
    const { error: rErr } = await admin.from('user_roles').insert({ user_id: id, role: 'admin' });
    if (rErr) throw new Error(`grant admin(${tag}): ${rErr.message}`);
  }
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

const planOf = async (id) =>
  (await admin.from('user_profiles').select('plan_code').eq('user_id', id).single()).data?.plan_code;
const grantsOf = async (id) =>
  (await admin.from('plan_grants').select('*').eq('user_id', id).order('created_at', { ascending: true })).data ?? [];

try {
  console.log('\n[schema]');
  {
    const { error } = await admin.from('plan_grants').select('id').limit(1);
    expect('plan_grants exists', !error, error?.message ?? '');
  }

  const member = await mkUser('member');
  const adminUser = await mkUser('admin', { admin: true });

  console.log('\n[only an admin can move a plan]');
  {
    expect('a new member starts on sprout', (await planOf(member.id)) === 'sprout');

    const { error: selfErr } = await member.client.rpc('set_member_plan', {
      p_user_id: member.id, p_plan_code: 'bloom', p_source: 'admin',
    });
    expect('a member cannot promote themselves',
      !!selfErr && /only an admin/i.test(selfErr.message), selfErr?.message ?? 'succeeded');
    expect('and the plan did not move', (await planOf(member.id)) === 'sprout');

    // The other route a member might try: PostgREST straight at the table.
    const { error: directErr } = await member.client
      .from('user_profiles').update({ plan_code: 'bloom' }).eq('user_id', member.id);
    const planAfterDirect = await planOf(member.id);
    expect('a member cannot write plan_code through PostgREST either',
      planAfterDirect === 'sprout', `error=${directErr?.message ?? 'none'} plan=${planAfterDirect}`);
  }

  console.log('\n[the admin control]');
  {
    const { data, error } = await adminUser.client.rpc('set_member_plan', {
      p_user_id: member.id, p_plan_code: 'bloom', p_source: 'skool',
      p_external_ref: ' Member@Example.com ', p_note: 'joined the paid group',
    });
    expect('an admin can set bloom', !error && data?.status === 'changed', error?.message ?? JSON.stringify(data));
    expect('the profile moved', (await planOf(member.id)) === 'bloom');

    const grants = await grantsOf(member.id);
    expect('exactly one grant row was written', grants.length === 1, String(grants.length));
    const g = grants[0];
    expect('it records the previous plan', g?.previous_plan_code === 'sprout', String(g?.previous_plan_code));
    expect("it records the source", g?.source === 'skool', String(g?.source));
    expect('the external reference is trimmed', g?.external_ref === 'Member@Example.com', JSON.stringify(g?.external_ref));
    expect('it records who granted it', g?.granted_by_user_id === adminUser.id, String(g?.granted_by_user_id));
    expect('the note survives', g?.note === 'joined the paid group', String(g?.note));
  }

  console.log('\n[re-asserting a plan writes nothing]');
  {
    const { data } = await adminUser.client.rpc('set_member_plan', {
      p_user_id: member.id, p_plan_code: 'bloom', p_source: 'admin',
    });
    expect("a no-op reports 'unchanged'", data?.status === 'unchanged', JSON.stringify(data));
    expect('and adds no audit noise', (await grantsOf(member.id)).length === 1);
  }

  console.log('\n[flourish is retired, not assignable]');
  {
    const { error } = await adminUser.client.rpc('set_member_plan', {
      p_user_id: member.id, p_plan_code: 'flourish', p_source: 'admin',
    });
    expect('an admin cannot assign flourish',
      !!error && /flourish is retired/i.test(error.message), error?.message ?? 'succeeded');

    const { error: svcErr } = await admin.rpc('set_member_plan', {
      p_user_id: member.id, p_plan_code: 'flourish', p_source: 'admin',
    });
    expect('neither can the service role', !!svcErr && /flourish is retired/i.test(svcErr.message),
      svcErr?.message ?? 'succeeded');

    expect('flourish is still in the enum (dormant, not dropped)',
      (await sql("select 'flourish'::public.plan_code as v")).ok);
  }

  console.log('\n[bad input is refused]');
  {
    const { error } = await adminUser.client.rpc('set_member_plan', {
      p_user_id: member.id, p_plan_code: 'sprout', p_source: 'guesswork',
    });
    expect('an unknown source is refused',
      !!error && /source must be/i.test(error.message), error?.message ?? 'succeeded');

    const { error: missing } = await adminUser.client.rpc('set_member_plan', {
      p_user_id: '00000000-0000-0000-0000-000000000000', p_plan_code: 'bloom', p_source: 'admin',
    });
    expect('an unknown member is refused', !!missing && /member not found/i.test(missing.message),
      missing?.message ?? 'succeeded');
  }

  console.log('\n[the audit trail cannot be rewritten]');
  {
    const g = (await grantsOf(member.id))[0];

    const { error: svcUpdate } = await admin.from('plan_grants').update({ source: 'stripe' }).eq('id', g.id);
    expect('not even the service role can edit a grant',
      !!svcUpdate && /append-only/i.test(svcUpdate.message), svcUpdate?.message ?? 'succeeded');

    const direct = await sql(`update public.plan_grants set note = 'tampered' where id = '${g.id}'`);
    expect('nor a direct SQL update', !direct.ok && /append-only/i.test(direct.body),
      `${direct.status} ${direct.body.slice(0, 160)}`);

    expect('the row is unchanged',
      (await grantsOf(member.id))[0]?.note === 'joined the paid group');
  }

  console.log('\n[a member can see their own plan and its history]');
  {
    const { data, error } = await member.client.rpc('member_plan_state', { p_user_id: member.id });
    expect('member_plan_state works for self', !error && data?.plan_code === 'bloom',
      error?.message ?? JSON.stringify(data));
    expect('it reports the source', data?.source === 'skool', String(data?.source));

    const { data: own } = await member.client.from('plan_grants').select('id');
    expect('a member reads their own grants', (own ?? []).length === 1, JSON.stringify(own));

    const other = await mkUser('other');
    const { error: peek } = await other.client.rpc('member_plan_state', { p_user_id: member.id });
    expect('a member cannot read another member’s plan state',
      !!peek && /only read your own/i.test(peek.message), peek?.message ?? 'succeeded');

    const { data: theirs } = await other.client.from('plan_grants').select('id');
    expect('nor another member’s grant rows', (theirs ?? []).length === 0, JSON.stringify(theirs));

    const { data: defaulted } = await other.client.rpc('member_plan_state', { p_user_id: other.id });
    expect("no grant row reads as source 'signup'",
      defaulted?.plan_code === 'sprout' && defaulted?.source === 'signup', JSON.stringify(defaulted));
  }

  console.log('\n[admin member search]');
  {
    const { error } = await member.client.rpc('admin_search_members', { p_query: 'verify21', p_limit: 20 });
    expect('a member cannot search members', !!error && /admin only/i.test(error.message),
      error?.message ?? 'succeeded');

    const { data, error: aErr } = await adminUser.client.rpc('admin_search_members', {
      p_query: member.email, p_limit: 20,
    });
    expect('an admin can find a member by email', !aErr && (data ?? []).length >= 1,
      aErr?.message ?? JSON.stringify(data));
    const row = (data ?? []).find((r) => r.user_id === member.id);
    expect('the row carries the email, plan and source',
      row?.email === member.email && row?.plan_code === 'bloom' && row?.plan_source === 'skool',
      JSON.stringify(row));

    const { error: blank } = await adminUser.client.rpc('admin_search_members', { p_query: '  ' });
    expect('an empty search is refused', !!blank && /search term is required/i.test(blank.message),
      blank?.message ?? 'succeeded');
  }

  console.log('\n[demotion is the same mechanism]');
  {
    const { data } = await adminUser.client.rpc('set_member_plan', {
      p_user_id: member.id, p_plan_code: 'sprout', p_source: 'skool',
      p_external_ref: 'Member@Example.com', p_note: 'left the paid group',
    });
    expect('an admin can demote to sprout', data?.status === 'changed', JSON.stringify(data));

    const grants = await grantsOf(member.id);
    expect('both directions are in the history', grants.length === 2, String(grants.length));
    expect('the demotion records bloom as previous',
      grants[1]?.previous_plan_code === 'bloom' && grants[1]?.plan_code === 'sprout', JSON.stringify(grants[1]));
  }

  console.log('\n[append-only must not make accounts undeletable]');
  {
    // The subject's rows cascade away. This is the easy direction.
    const doomed = await mkUser('doomed');
    await adminUser.client.rpc('set_member_plan', {
      p_user_id: doomed.id, p_plan_code: 'bloom', p_source: 'admin',
    });
    expect('the doomed member has a grant row', (await grantsOf(doomed.id)).length === 1);

    const { error } = await admin.auth.admin.deleteUser(doomed.id);
    expect('deleting the subject works (cascade)', !error, error?.message ?? '');
    expect('and its grant rows went with it', (await grantsOf(doomed.id)).length === 0);
    tempUserIds.splice(tempUserIds.indexOf(doomed.id), 1);
  }

  {
    // The hard direction, and the one that broke first: deleting the admin
    // who made a grant fires ON DELETE SET NULL, which is an UPDATE. A
    // statement-level trigger also fired for deletions of people who had
    // granted nothing, so this guards both.
    const granter = await mkUser('granter', { admin: true });
    const subject = await mkUser('subject');
    await granter.client.rpc('set_member_plan', {
      p_user_id: subject.id, p_plan_code: 'bloom', p_source: 'admin', p_note: 'keep me',
    });

    const { error } = await admin.auth.admin.deleteUser(granter.id);
    expect('deleting the granting admin works (set null)', !error, error?.message ?? '');
    tempUserIds.splice(tempUserIds.indexOf(granter.id), 1);

    const g = (await grantsOf(subject.id))[0];
    expect('the grant survives with granted_by nulled',
      !!g && g.granted_by_user_id === null, JSON.stringify(g));
    expect('and every evidential field is intact',
      g?.plan_code === 'bloom' && g?.previous_plan_code === 'sprout' &&
      g?.source === 'admin' && g?.note === 'keep me', JSON.stringify(g));

    // The permitted update is exactly one shape; nothing rides along with it.
    const smuggle = await sql(
      `update public.plan_grants set granted_by_user_id = null, source = 'stripe' where id = '${g.id}'`);
    expect('an update cannot smuggle a change in alongside the null',
      !smuggle.ok && /append-only/i.test(smuggle.body), `${smuggle.status} ${smuggle.body.slice(0, 160)}`);

    const reverse = await sql(
      `update public.plan_grants set granted_by_user_id = '${subject.id}' where id = '${g.id}'`);
    expect('nor set granted_by to somebody',
      !reverse.ok && /append-only/i.test(reverse.body), `${reverse.status} ${reverse.body.slice(0, 160)}`);

    const nullAgain = await sql(
      `update public.plan_grants set granted_by_user_id = null where id = '${g.id}'`);
    expect('re-nulling an already-null granter is refused (nothing to set)',
      !nullAgain.ok && /append-only/i.test(nullAgain.body), `${nullAgain.status} ${nullAgain.body.slice(0, 160)}`);

    expect('deleting the subject afterwards still works',
      !(await admin.auth.admin.deleteUser(subject.id)).error);
    tempUserIds.splice(tempUserIds.indexOf(subject.id), 1);
  }

  console.log('\n[wiring]');
  {
    const data = readFileSync(new URL('./src/lib/fivestarz/data.js', import.meta.url), 'utf8');
    expect('data.js exports the plan writer and reader',
      data.includes('export async function setMemberPlan') &&
      data.includes('export async function getMemberPlanState'));

    const actions = readFileSync(new URL('./src/app/admin/actions.js', import.meta.url), 'utf8');
    expect('the admin action exists and rejects flourish',
      actions.includes('setMemberPlanAction') &&
      actions.includes('VALID_PLANS = new Set(["sprout", "bloom"])'));

    const page = readFileSync(new URL('./src/app/admin/page.jsx', import.meta.url), 'utf8');
    expect('the admin page offers the plan control',
      page.includes('setMemberPlanAction') && page.includes('admin_search_members'.replace('admin_search_members', 'searchMembersAsAdmin')));
    expect('the control explains that Skool is the billing system',
      /Skool is the billing system/.test(page));
  }

  console.log('\n[marketing surfaces defer to the apex]');
  {
    const site = readFileSync(new URL('./src/lib/fivestarz/site.js', import.meta.url), 'utf8');
    expect('getSiteUrl falls back to the app host, not the apex',
      site.includes('https://app.proofsignals.net') &&
      !/NEXT_PUBLIC_SITE_URL \|\| "https:\/\/proofsignals\.net"/.test(site));
    expect('MARKETING_ROBOTS is noindex, follow',
      site.includes('MARKETING_ROBOTS = { index: false, follow: true }'));

    for (const route of ['page.jsx', 'how-it-works/page.jsx', 'pricing/page.jsx', 'community/page.jsx', 'safety/page.jsx', 'demo/page.jsx']) {
      const src = readFileSync(new URL(`./src/app/${route}`, import.meta.url), 'utf8');
      expect(`/${route.replace('/page.jsx', '').replace('page.jsx', '')} is noindex`,
        src.includes('MARKETING_ROBOTS'), 'missing');
    }

    const sitemap = readFileSync(new URL('./src/app/sitemap.js', import.meta.url), 'utf8');
    expect('the sitemap no longer submits the marketing routes',
      !sitemap.includes('"/how-it-works"') && !sitemap.includes('"/pricing"') &&
      !sitemap.includes('"/safety"') && !sitemap.includes('"/community"'));
    expect('it still submits profiles and assets',
      sitemap.includes('/u/${p.public_username}') && sitemap.includes('/a/${a.public_slug}'));
    expect('Proof Market stays indexed (not duplicated by WordPress)',
      sitemap.includes('"/proof-market"'));
  }
} catch (err) {
  bad('harness', err.stack ?? err.message);
} finally {
  for (const id of tempUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
