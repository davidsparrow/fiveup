// Live verification for Phase 23 / Discord D3 — groups in Discord.
//
// D3's "done when" is five testers running every command in the test guild.
// That needs the Discord portal. Everything SHORT of the portal is provable
// here, and that turns out to be nearly all of it: the handlers take a `port`
// argument and import no Supabase, so this script builds the real
// ProofSignals port against the live database, hands the router synthetic
// interactions in the exact shape Discord sends, and asserts the rows that
// come out. The same trick verify-phase20 used for Ed25519 — generate the
// input rather than wait for Discord to send one.
//
// What it covers:
//
//   • the three new RPCs, their ACLs, and the act-as refusals
//   • member_for_external_identity carrying `track` (what /group create
//     inherits) and still refusing a non-service caller
//   • every /group subcommand and /me, driven through handleInteraction
//   • the asset auto-pick AND the ambiguous case, which is the one piece of
//     product judgement D3 added
//   • the room path, with a fetch stub standing in for Discord's API, which
//     proves the thread-id write-back without an app registered
//   • the two seams, re-checked because D3 added eight files
//
// What it cannot cover: whether Discord accepts the command definitions, and
// whether the bot has the guild permissions to open a private thread. Those
// are the portal's, and `node src/lib/discord/register.mjs` is the next step.
//
//   node verify-phase23.mjs

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// ── The "@/" alias, so a verify script can import the real handlers ─────────
//
// Next.js resolves "@/x" to "src/x"; plain Node does not. Without this the
// only testable modules would be the alias-free leaves, which is why D1 could
// only unit-test verify.js. Ten lines here buys coverage of every handler.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context);
    const base = resolvePath('src', specifier.slice(2));
    for (const candidate of [base, `${base}.js`, `${base}.jsx`, join(base, 'index.js')]) {
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const { createProofSignalsPort } = await import('./src/lib/community/proofsignals/adapter.js');
const { handleInteraction } = await import('./src/lib/discord/router.js');
const { COMMAND_NAMES, GROUP_SUBCOMMANDS } = await import('./src/lib/discord/commands/definitions.js');
const { SUBCOMMANDS } = await import('./src/lib/discord/commands/group.js');
const { OPTIONAL_OPERATIONS, REQUIRED_OPERATIONS } = await import('./src/lib/community/port.js');
const { commandDefinitionProblems } = await import('./src/lib/discord/commands/validate.js');
const { COMMAND_DEFINITIONS } = await import('./src/lib/discord/commands/definitions.js');

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
const port = createProofSignalsPort(admin);

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const tempUserIds = [];
const tempGroupIds = [];

const SITE = 'https://app.proofsignals.net';

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: JSON.stringify({ query }),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

function readTree(dir) {
  const out = {};
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|jsx|mjs)$/.test(entry)) out[full] = readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return out;
}

// Run-unique, not a fixed base. A deterministic sequence collides with the
// previous run's rows the moment a run is interrupted before its cleanup —
// which is exactly what happens if you pipe this script through `head`, since
// SIGPIPE kills it before the finally block. The unique index on
// (provider, external_id) then fails every subsequent run.
let snowflakeSeq = 7000000000000000 + Math.floor(Math.random() * 8_000_000) * 100;

async function mkUser(tag, { plan = 'bloom', track = 'ai_builders', link = true } = {}) {
  const email = `verify23-${tag}-${rand}@example.com`;
  const password = 'Verify23!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  tempUserIds.push(id);

  const patch = { display_name: `V23 ${tag}` };
  if (plan !== 'sprout') patch.plan_code = plan;
  if (track) patch.track = track;
  const { error: pErr } = await admin.from('user_profiles').update(patch).eq('user_id', id);
  if (pErr) throw new Error(`profile(${tag}): ${pErr.message}`);

  const snowflake = String(++snowflakeSeq);
  if (link) {
    const { error: iErr } = await admin.from('member_identities').insert({
      user_id: id, provider: 'discord', external_id: snowflake,
      handle: `v23_${tag}`, status: 'linked', linked_via: 'code',
    });
    if (iErr) throw new Error(`identity(${tag}): ${iErr.message}`);
  }

  // A signed-in anon client, for the RPC calls that must be made AS a member
  // rather than as the service role — the ACL and act-as assertions.
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  for (let attempt = 1; ; attempt++) {
    const { error: sErr } = await client.auth.signInWithPassword({ email, password });
    if (!sErr) break;
    if (!/rate limit/i.test(sErr.message) || attempt >= 5) throw new Error(`signIn(${tag}): ${sErr.message}`);
    const wait = attempt * 15000;
    console.log(`     … auth rate limit; waiting ${wait / 1000}s before retrying ${tag}`);
    await new Promise((r) => setTimeout(r, wait));
  }

  return { id, tag, email, client, snowflake };
}

let assetSeq = 0;

async function mkAsset(user, name = null, { status = 'active', moderation = 'ok' } = {}) {
  const n = ++assetSeq;
  const { data, error } = await admin.from('assets').insert({
    owner_user_id: user.id,
    name: name ?? `V23 asset ${user.tag} ${n}`,
    public_url: `https://example.com/v23-${user.tag}-${rand}-${n}`,
    asset_type: 'digital_product_saas',
    status,
    moderation_status: moderation,
  }).select('id').single();
  if (error) throw new Error(`mkAsset(${user.tag}): ${error.message}`);
  // Only the first becomes the fixture's default — the phase 22 lesson.
  user.assetId ??= data.id;
  return data.id;
}

// ── Driving a command the way the route does ────────────────────────────────
//
// The real route verifies a signature, defers, then runs deferredWork() in
// after(). This does the same two steps and returns both halves, so an
// assertion can check that a command deferred AND what it eventually said.
function interactionFor(name, { snowflake, sub = null, options = {}, resolvedUsers = {} }) {
  const data = { name, id: 'cmd', type: 1 };
  const optionEntries = Object.entries(options)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => ({
      name: k,
      type: typeof v === 'number' ? 4 : 3,
      value: v,
    }));

  data.options = sub ? [{ name: sub, type: 1, options: optionEntries }] : optionEntries;
  if (Object.keys(resolvedUsers).length > 0) data.resolved = { users: resolvedUsers };

  return {
    type: 2,
    token: 'verify-token',
    // A guild interaction: the user arrives under member.user, which is the
    // shape interactionUser() has to handle alongside the DM shape.
    member: { user: { id: snowflake, username: `u${snowflake}`, global_name: null } },
    data,
  };
}

async function run(name, opts, config = { canCreateRooms: false }) {
  const result = await handleInteraction({
    interaction: interactionFor(name, opts),
    port,
    config,
    siteUrl: SITE,
  });
  const content = result.deferredWork ? await result.deferredWork() : null;
  return { responseType: result.response?.type, content };
}

try {
  console.log('\n[schema — the three functions D3 added]');
  {
    const r = await sql(`select p.proname, coalesce(array_to_string(p.proacl, ' | '), '(default)') as acl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('my_pairable_assets', 'member_overview', 'member_for_external_identity')`);
    const rows = JSON.parse(r.body);
    const acl = Object.fromEntries(rows.map((x) => [x.proname, x.acl]));

    expect('my_pairable_assets exists', Boolean(acl.my_pairable_assets));
    expect('member_overview exists', Boolean(acl.member_overview));

    // The phase 22 lesson: `revoke all ... from public` leaves Supabase's
    // by-name grants to anon and authenticated in place. Assert the ACL.
    expect('my_pairable_assets is not executable by anon',
      !/\banon=/.test(acl.my_pairable_assets ?? ''), acl.my_pairable_assets);
    expect('member_overview is not executable by anon',
      !/\banon=/.test(acl.member_overview ?? ''), acl.member_overview);
    expect('member_for_external_identity is service_role only — no anon, no authenticated',
      /service_role=X/.test(acl.member_for_external_identity ?? '')
        && !/\banon=/.test(acl.member_for_external_identity ?? '')
        && !/\bauthenticated=/.test(acl.member_for_external_identity ?? ''),
      acl.member_for_external_identity);
  }

  const owner = await mkUser('owner', { plan: 'bloom', track: 'ai_builders' });
  const guest = await mkUser('guest', { plan: 'bloom', track: 'creators' });
  const stranger = await mkUser('stranger', { plan: 'bloom', link: false });
  await mkAsset(owner, 'Owner Primary');
  await mkAsset(guest, 'Guest Primary');
  await mkAsset(stranger, 'Stranger Primary');

  console.log('\n[the bot\'s member read now carries the track]');
  {
    const resolved = await port.resolveMember({ provider: 'discord', externalId: owner.snowflake });
    expect('resolveMember returns linked', resolved.status === 'linked', JSON.stringify(resolved));
    expect('…with the member\'s track, which /group create inherits',
      resolved.track === 'ai_builders', JSON.stringify(resolved.track));
    expect('…and the user id', resolved.userId === owner.id);

    const unlinked = await port.resolveMember({ provider: 'discord', externalId: '7999999999999999' });
    expect('an unknown snowflake is unlinked, not an error', unlinked.status === 'unlinked');

    // Still bot-only. A member reaching this would be reading identities.
    const { error } = await owner.client.rpc('member_for_external_identity', {
      p_provider: 'discord', p_external_id: guest.snowflake,
    });
    expect('a member cannot call member_for_external_identity',
      Boolean(error), error?.message ?? 'NO ERROR — a member read an identity');
  }

  console.log('\n[my_pairable_assets — the criteria must match assert_pairable_asset]');
  {
    const mine = await port.listPairableAssets({ userId: owner.id });
    expect('returns the member\'s active, moderated asset', mine.length === 1 && mine[0].name === 'Owner Primary',
      JSON.stringify(mine));

    const draft = await mkAsset(owner, 'Owner Draft', { status: 'draft' });
    const removed = await mkAsset(owner, 'Owner Removed', { moderation: 'removed' });
    const after = await port.listPairableAssets({ userId: owner.id });
    const names = after.map((a) => a.name);
    expect('a draft asset is excluded', !names.includes('Owner Draft'), names.join(', '));
    expect('a moderation-removed asset is excluded', !names.includes('Owner Removed'), names.join(', '));

    // The real check: the list and the write RPC must agree. create_group
    // refusing something the list offered would be the drift this guards.
    const { error: draftErr } = await admin.rpc('create_group', {
      p_name: `V23 draft probe ${rand}`, p_asset_id: draft, p_acting_user_id: owner.id,
    });
    expect('create_group refuses the asset the list excluded',
      Boolean(draftErr) && /active|moderation/i.test(draftErr.message), draftErr?.message ?? 'NO ERROR');
    const { error: removedErr } = await admin.rpc('create_group', {
      p_name: `V23 removed probe ${rand}`, p_asset_id: removed, p_acting_user_id: owner.id,
    });
    expect('…and the moderation-removed one too', Boolean(removedErr), removedErr?.message ?? 'NO ERROR');

    // Act-as, both directions.
    const { error: actErr } = await owner.client.rpc('my_pairable_assets', { p_acting_user_id: guest.id });
    expect('a member cannot list another member\'s assets',
      Boolean(actErr) && /act on behalf/i.test(actErr.message), actErr?.message ?? 'NO ERROR');
    const { error: nullErr } = await admin.rpc('my_pairable_assets', { p_acting_user_id: null });
    expect('a service-role call naming nobody is refused',
      Boolean(nullErr) && /must name the member/i.test(nullErr.message), nullErr?.message ?? 'NO ERROR');

    await admin.from('assets').delete().in('id', [draft, removed]);
  }

  console.log('\n[member_overview — what /me reads]');
  {
    const o = await port.memberOverview({ userId: owner.id });
    expect('reports the plan', o.planCode === 'bloom', o.planCode);
    expect('reports the track', o.track === 'ai_builders', String(o.track));
    expect('reports the caps', o.caps.maxConcurrentGroups === 3 && o.caps.feedbackGroupsPerMonth === 3,
      JSON.stringify(o.caps));
    expect('reports usage, starting at zero groups', o.usage.openGroups === 0, JSON.stringify(o.usage));
    expect('reports the pairable asset count', o.pairableAssetCount === 1, String(o.pairableAssetCount));
    expect('reports the match surface', ['web', 'discord'].includes(o.matchSurface), o.matchSurface);

    const { error } = await owner.client.rpc('member_overview', { p_acting_user_id: guest.id });
    expect('a member cannot read another member\'s overview',
      Boolean(error) && /act on behalf/i.test(error.message), error?.message ?? 'NO ERROR');

    // Called as the member themselves, through the site's own road.
    const { data: selfData, error: selfErr } = await owner.client.rpc('member_overview', {});
    expect('a member can read their own overview with no argument',
      !selfErr && selfData?.plan_code === 'bloom', selfErr?.message ?? JSON.stringify(selfData?.plan_code));
  }

  console.log('\n[/me, through the router]');
  {
    const r = await run('me', { snowflake: owner.snowflake });
    expect('defers rather than replying inline', r.responseType === 5, String(r.responseType));
    expect('names the plan', /Bloom/.test(r.content), r.content);
    expect('names the track', /AI Builders/.test(r.content), r.content);
    expect('shows groups against the cap', /Feedback groups open: 0 \/ 3/.test(r.content), r.content);
    expect('links the account page', r.content.includes(`${SITE}/account`), r.content);

    const unlinked = await run('me', { snowflake: '7999999999999998' });
    expect('an unlinked caller is sent to /link', /\/link/.test(unlinked.content), unlinked.content);
  }

  console.log('\n[the definitions and the router agree]');
  {
    expect('three commands are registered', COMMAND_NAMES.join(',') === 'link,me,group', COMMAND_NAMES.join(','));
    const missing = GROUP_SUBCOMMANDS.filter((s) => typeof SUBCOMMANDS[s] !== 'function');
    expect('every registered subcommand has a handler', missing.length === 0, missing.join(', '));
    const extra = Object.keys(SUBCOMMANDS).filter((s) => !GROUP_SUBCOMMANDS.includes(s));
    expect('every handler is a registered subcommand', extra.length === 0, extra.join(', '));

    const unknown = await run('group', { snowflake: owner.snowflake, sub: 'teleport' });
    expect('an unknown subcommand is refused inline, not deferred', unknown.responseType === 4, String(unknown.responseType));

    // Discord rejects the whole payload on one bad field, with a JSON path
    // for an error message. register.mjs --dry-run runs this check with no
    // credentials; these assertions prove the check itself works, because a
    // validator that only ever returns [] is indistinguishable from no
    // validator at all.
    expect('the real definitions pass Discord\'s documented limits',
      commandDefinitionProblems(COMMAND_DEFINITIONS).length === 0,
      commandDefinitionProblems(COMMAND_DEFINITIONS).join('; '));

    const traps = {
      'an over-long description': [{ name: 'x', description: 'y'.repeat(101), type: 1 }],
      'an uppercase name': [{ name: 'Bad', description: 'd', type: 1 }],
      'a duplicate name': [{ name: 'x', description: 'd', type: 1 }, { name: 'x', description: 'd', type: 1 }],
      'a missing description': [{ name: 'x', type: 1 }],
      'a required option after an optional one': [{ name: 'x', description: 'd', type: 1, options: [
        { name: 's', description: 'd', type: 1, options: [
          { name: 'a', description: 'd', type: 3, required: false },
          { name: 'b', description: 'd', type: 3, required: true }] }] }],
      'too many options': [{ name: 'x', description: 'd', type: 1,
        options: Array.from({ length: 26 }, (_, i) => ({ name: `s${i}`, description: 'd', type: 1 })) }],
    };
    for (const [label, defs] of Object.entries(traps)) {
      expect(`…and catches ${label}`, commandDefinitionProblems(defs).length > 0);
    }
  }

  console.log('\n[/group create — and the track it inherits]');
  let groupId = null;
  {
    const r = await run('group', {
      snowflake: owner.snowflake, sub: 'create',
      options: { name: `V23 Thursday ${rand}`, size: 4 },
    });
    expect('defers', r.responseType === 5);
    expect('confirms the first seat', /first seat/.test(r.content), r.content);
    expect('tells a private group\'s owner to invite', /\/group invite/.test(r.content), r.content);

    const { data: rows } = await admin.from('groups').select('*').eq('created_by', owner.id);
    expect('exactly one group row', rows?.length === 1, JSON.stringify(rows?.length));
    groupId = rows?.[0]?.id;
    if (groupId) tempGroupIds.push(groupId);

    expect('it inherited the creator\'s track', rows?.[0]?.track === 'ai_builders', String(rows?.[0]?.track));
    expect('it defaulted to private', rows?.[0]?.visibility === 'private', String(rows?.[0]?.visibility));
    expect('it took the size given', rows?.[0]?.max_members === 4, String(rows?.[0]?.max_members));
    expect('kind is feedback, never challenge', rows?.[0]?.kind === 'feedback', String(rows?.[0]?.kind));
    expect('no thread id, because rooms were not configured',
      rows?.[0]?.discord_thread_id === null, String(rows?.[0]?.discord_thread_id));

    const { data: seat } = await admin.from('group_members')
      .select('role, status, asset_id').eq('group_id', groupId).eq('user_id', owner.id).single();
    expect('the creator holds an active owner seat',
      seat?.role === 'owner' && seat?.status === 'active', JSON.stringify(seat));
    expect('…with their asset on it', seat?.asset_id === owner.assetId, String(seat?.asset_id));

    const after = await port.memberOverview({ userId: owner.id });
    expect('the open-group count moved', after.usage.openGroups === 1, String(after.usage.openGroups));
  }

  console.log('\n[the asset auto-pick, and the ambiguous case]');
  {
    const second = await mkAsset(owner, 'Owner Secondary');

    const r = await run('group', {
      snowflake: owner.snowflake, sub: 'create', options: { name: `V23 Ambiguous ${rand}` },
    });
    expect('with two assets and none named, it asks rather than guessing',
      /tell me which one/i.test(r.content), r.content);
    expect('…and names both', /Owner Primary/.test(r.content) && /Owner Secondary/.test(r.content), r.content);

    const { data: none } = await admin.from('groups').select('id').eq('name', `V23 Ambiguous ${rand}`);
    expect('…and wrote nothing', (none ?? []).length === 0, JSON.stringify(none));

    const named = await run('group', {
      snowflake: owner.snowflake, sub: 'create',
      options: { name: `V23 Named ${rand}`, asset: 'Owner Secondary' },
    });
    expect('naming the asset works', /first seat/.test(named.content), named.content);
    const { data: namedRows } = await admin.from('groups').select('id').eq('name', `V23 Named ${rand}`);
    if (namedRows?.[0]?.id) tempGroupIds.push(namedRows[0].id);
    const { data: namedSeat } = await admin.from('group_members')
      .select('asset_id').eq('group_id', namedRows?.[0]?.id).eq('user_id', owner.id).single();
    expect('…and brings the asset that was named', namedSeat?.asset_id === second, String(namedSeat?.asset_id));

    const partial = await run('group', {
      snowflake: owner.snowflake, sub: 'create',
      options: { name: `V23 Partial ${rand}`, asset: 'Owner' },
    });
    expect('an ambiguous partial name is refused with both options',
      /matches 2 of your assets/i.test(partial.content), partial.content);

    const unknown = await run('group', {
      snowflake: owner.snowflake, sub: 'create',
      options: { name: `V23 Unknown ${rand}`, asset: 'Nonexistent' },
    });
    expect('an unknown asset name lists the real ones',
      /no active asset called "Nonexistent"/i.test(unknown.content), unknown.content);

    await admin.from('assets').delete().eq('id', second);
  }

  console.log('\n[/group list, members, recommend]');
  {
    const list = await run('group', { snowflake: owner.snowflake, sub: 'list' });
    expect('lists the groups the member is in', /V23 Thursday/.test(list.content), list.content);
    expect('…marking the ones they own', /you own it/.test(list.content), list.content);

    const members = await run('group', {
      snowflake: owner.snowflake, sub: 'members', options: { group: `V23 Thursday ${rand}` },
    });
    expect('the roster names the owner', /V23 owner/.test(members.content), members.content);
    expect('…and what they brought', /Owner Primary/.test(members.content), members.content);

    const rec = await run('group', {
      snowflake: owner.snowflake, sub: 'recommend', options: { group: `V23 Thursday ${rand}` },
    });
    expect('the recommender answers', typeof rec.content === 'string' && rec.content.length > 0, String(rec.content));

    // A non-owner asking for recommendations is the three-valued-logic trap
    // from phase 22: group_role_of() returns null, and `if not (null or ...)`
    // never fires. Driven here through the handler, which filters first.
    const notOwner = await run('group', {
      snowflake: guest.snowflake, sub: 'recommend', options: { group: `V23 Thursday ${rand}` },
    });
    expect('a non-member gets no recommendations for someone else\'s group',
      !/V23 owner/.test(notOwner.content) && /own|not in any/i.test(notOwner.content), notOwner.content);
  }

  console.log('\n[invite → accept, and the link requirement]');
  {
    const notLinked = await run('group', {
      snowflake: owner.snowflake, sub: 'invite',
      options: { group: `V23 Thursday ${rand}`, member: '7999999999999997' },
      resolvedUsers: { '7999999999999997': { id: '7999999999999997', username: 'ghost' } },
    });
    expect('inviting an unlinked Discord user says so', /\/link/.test(notLinked.content), notLinked.content);

    const invited = await run('group', {
      snowflake: owner.snowflake, sub: 'invite',
      options: { group: `V23 Thursday ${rand}`, member: guest.snowflake },
      resolvedUsers: { [guest.snowflake]: { id: guest.snowflake, username: 'v23_guest' } },
    });
    expect('inviting a linked member works', /Invited/.test(invited.content), invited.content);

    const { data: inviteRow } = await admin.from('group_members')
      .select('status, invited_by_user_id, joined_via').eq('group_id', groupId).eq('user_id', guest.id).single();
    expect('an invited row exists', inviteRow?.status === 'invited', JSON.stringify(inviteRow));
    expect('…attributed to the owner', inviteRow?.invited_by_user_id === owner.id,
      String(inviteRow?.invited_by_user_id));

    const again = await run('group', {
      snowflake: owner.snowflake, sub: 'invite',
      options: { group: `V23 Thursday ${rand}`, member: guest.snowflake },
      resolvedUsers: { [guest.snowflake]: { id: guest.snowflake, username: 'v23_guest' } },
    });
    expect('inviting twice is reported, not duplicated', /already has an open invitation/.test(again.content), again.content);

    // A non-owner inviting is the same null-guard trap, from the other side:
    // group_role_of() returns null for someone with no active seat, and
    // `if not (null = 'owner' or ...)` never fires. Asserted on the ROW, not
    // on the wording — an invite that went through while the message looked
    // like a refusal is the failure that matters.
    const byGuest = await run('group', {
      snowflake: guest.snowflake, sub: 'invite',
      options: { group: `V23 Thursday ${rand}`, member: stranger.snowflake },
      resolvedUsers: { [stranger.snowflake]: { id: stranger.snowflake, username: 'v23_stranger' } },
    });
    const { data: strangerRow } = await admin.from('group_members')
      .select('status').eq('group_id', groupId).eq('user_id', stranger.id).maybeSingle();
    expect('an invitee cannot invite anyone into a group they have not joined yet',
      strangerRow === null, JSON.stringify(strangerRow));
    expect('…and is told why, naming their own pending invitation',
      /have not accepted the invitation/i.test(byGuest.content), byGuest.content);

    const accepted = await run('group', {
      snowflake: guest.snowflake, sub: 'accept', options: { group: `V23 Thursday ${rand}` },
    });
    expect('accepting works', /You are in/.test(accepted.content), accepted.content);

    const { data: seat } = await admin.from('group_members')
      .select('status, asset_id, role').eq('group_id', groupId).eq('user_id', guest.id).single();
    expect('the seat is active', seat?.status === 'active', JSON.stringify(seat));
    expect('…with the invitee\'s own asset on it', seat?.asset_id === guest.assetId, String(seat?.asset_id));
    expect('…as a member, not an owner', seat?.role === 'member', String(seat?.role));

    const roster = await run('group', {
      snowflake: owner.snowflake, sub: 'members', options: { group: `V23 Thursday ${rand}` },
    });
    expect('the roster now shows both', /V23 owner/.test(roster.content) && /V23 guest/.test(roster.content), roster.content);
  }

  console.log('\n[discover → join, with the cap gating the request]');
  {
    const listed = await run('group', {
      snowflake: owner.snowflake, sub: 'create',
      options: { name: `V23 Listed ${rand}`, visibility: 'listed' },
    });
    expect('a listed group can be created', /first seat/.test(listed.content), listed.content);
    const { data: listedRows } = await admin.from('groups').select('id').eq('name', `V23 Listed ${rand}`);
    const listedId = listedRows?.[0]?.id;
    if (listedId) tempGroupIds.push(listedId);

    const discovered = await run('group', { snowflake: stranger.snowflake, sub: 'discover' });
    expect('an unlinked member cannot discover', /\/link/.test(discovered.content), discovered.content);

    const seen = await run('group', { snowflake: guest.snowflake, sub: 'discover' });
    expect('a linked member sees the listed group', /V23 Listed/.test(seen.content), seen.content);
    expect('…and that it needs approval', /approval needed/.test(seen.content), seen.content);

    const requested = await run('group', {
      snowflake: guest.snowflake, sub: 'join', options: { group: `V23 Listed ${rand}` },
    });
    expect('joining a listed group creates a request, not a seat',
      /Requested a seat/.test(requested.content), requested.content);

    const { data: reqRow } = await admin.from('group_members')
      .select('status').eq('group_id', listedId).eq('user_id', guest.id).single();
    expect('the row is `requested`', reqRow?.status === 'requested', JSON.stringify(reqRow));

    // discoverable_groups now omits this room for `guest`, so the handler has
    // to fall back to their own group list to answer honestly. Before the fix
    // this said "No groups are open to join right now."
    const twice = await run('group', {
      snowflake: guest.snowflake, sub: 'join', options: { group: `V23 Listed ${rand}` },
    });
    expect('asking twice reports the pending request, not "no such group"',
      /already asked to join/.test(twice.content), twice.content);

    const alreadyIn = await run('group', {
      snowflake: owner.snowflake, sub: 'join', options: { group: `V23 Thursday ${rand}` },
    });
    expect('trying to join your own group says so',
      /already in/.test(alreadyIn.content), alreadyIn.content);
  }

  console.log('\n[the cap, as a member actually meets it]');
  {
    // sprout is 1 open feedback group. The cap has to bite through the
    // handler with the database's own sentence, not a generic failure.
    const free = await mkUser('free', { plan: 'sprout', track: 'creators' });
    await mkAsset(free, 'Free Primary');

    const first = await run('group', {
      snowflake: free.snowflake, sub: 'create', options: { name: `V23 Free One ${rand}` },
    });
    expect('a free member can create their first group', /first seat/.test(first.content), first.content);
    const { data: freeRows } = await admin.from('groups').select('id').eq('created_by', free.id);
    for (const row of freeRows ?? []) tempGroupIds.push(row.id);

    const second = await run('group', {
      snowflake: free.snowflake, sub: 'create', options: { name: `V23 Free Two ${rand}` },
    });
    expect('the second is stopped by the cap, in the database\'s own words',
      /limit on your plan/.test(second.content), second.content);
    const { data: stillOne } = await admin.from('groups').select('id').eq('created_by', free.id);
    expect('…and no second group row was written', (stillOne ?? []).length === 1, JSON.stringify(stillOne?.length));
  }

  console.log('\n[the room — a fetch stub standing in for Discord]');
  {
    // Its own member: `owner` is at the bloom cap of 3 open groups by now, and
    // a cap refusal here would look like a room failure.
    const host = await mkUser('host', { plan: 'bloom', track: 'ai_builders' });
    await mkAsset(host, 'Host Primary');

    const realFetch = globalThis.fetch;
    const calls = [];
    const THREAD_ID = '8100000000000001';

    // Only Discord's API is intercepted; Supabase's own fetch must pass
    // through untouched or every assertion below would be testing the stub.
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url ?? '';
      if (!url.startsWith('https://discord.com/api/')) return realFetch(input, init);

      calls.push(`${init?.method ?? 'GET'} ${url.replace('https://discord.com/api/v10', '')}`);

      if (/\/channels\/\d+\/threads$/.test(url)) {
        return new Response(JSON.stringify({ id: THREAD_ID, name: 'thread' }),
          { status: 201, headers: { 'content-type': 'application/json' } });
      }
      return new Response('', { status: 204 });
    };

    try {
      const r = await run('group',
        { snowflake: host.snowflake, sub: 'create', options: { name: `V23 Roomed ${rand}` } },
        { canCreateRooms: true, botToken: 'fake-token', groupsChannelId: '8000000000000001' },
      );

      expect('the reply points at the room', r.content.includes(`<#${THREAD_ID}>`), r.content);
      expect('a private thread was requested off the configured channel',
        calls.some((c) => c === 'POST /channels/8000000000000001/threads'), calls.join(' | '));
      expect('the creator was added to it',
        calls.some((c) => c === `PUT /channels/${THREAD_ID}/thread-members/${host.snowflake}`), calls.join(' | '));
      expect('an opening message was posted',
        calls.some((c) => c === `POST /channels/${THREAD_ID}/messages`), calls.join(' | '));

      const { data: roomed } = await admin.from('groups').select('id, discord_thread_id, discord_channel_id')
        .eq('name', `V23 Roomed ${rand}`).single();
      if (roomed?.id) tempGroupIds.push(roomed.id);
      expect('the thread id was written back to the group',
        roomed?.discord_thread_id === THREAD_ID, String(roomed?.discord_thread_id));
      expect('…and the parent channel with it',
        roomed?.discord_channel_id === '8000000000000001', String(roomed?.discord_channel_id));

      // The honest failure: Discord refuses, the group still exists.
      globalThis.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input?.url ?? '';
        if (!url.startsWith('https://discord.com/api/')) return realFetch(input, init);
        return new Response('missing permissions', { status: 403 });
      };

      const denied = await run('group',
        { snowflake: host.snowflake, sub: 'create', options: { name: `V23 Roomless ${rand}` } },
        { canCreateRooms: true, botToken: 'fake-token', groupsChannelId: '8000000000000001' },
      );
      expect('a refused thread does not fail the command', /first seat/.test(denied.content), denied.content);
      expect('…and says the room is missing', /could not open a private thread/i.test(denied.content), denied.content);

      const { data: roomless } = await admin.from('groups').select('id, discord_thread_id')
        .eq('name', `V23 Roomless ${rand}`).single();
      if (roomless?.id) tempGroupIds.push(roomless.id);
      expect('the group exists with no thread',
        Boolean(roomless?.id) && roomless?.discord_thread_id === null, JSON.stringify(roomless));
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  console.log('\n[leave and close]');
  {
    const left = await run('group', {
      snowflake: guest.snowflake, sub: 'leave', options: { group: `V23 Thursday ${rand}` },
    });
    expect('leaving works', /You left/.test(left.content), left.content);
    const { data: leftRow } = await admin.from('group_members')
      .select('status').eq('group_id', groupId).eq('user_id', guest.id).single();
    expect('the seat reads `left`', leftRow?.status === 'left', JSON.stringify(leftRow));

    const closed = await run('group', {
      snowflake: owner.snowflake, sub: 'close', options: { group: `V23 Thursday ${rand}` },
    });
    expect('closing works', /is closed/.test(closed.content), closed.content);
    expect('…and says the thread is archived, not deleted', /not deleted/.test(closed.content), closed.content);

    const { data: groupRow } = await admin.from('groups').select('status').eq('id', groupId).single();
    expect('the group row is closed', groupRow?.status === 'closed', JSON.stringify(groupRow));

    // my_groups keeps returning a closed group (the owner's seat stays
    // active), so the name still resolves — the subcommand's own filter is
    // what removes it. Saying "already closed" rather than "no group of
    // yours is called that" is the point of describeIneligibleGroup.
    const againClosed = await run('group', {
      snowflake: owner.snowflake, sub: 'close', options: { group: `V23 Thursday ${rand}` },
    });
    expect('closing an already-closed group says exactly that',
      /is already closed/.test(againClosed.content), againClosed.content);

    const inviteClosed = await run('group', {
      snowflake: owner.snowflake, sub: 'invite',
      options: { group: `V23 Thursday ${rand}`, member: stranger.snowflake },
      resolvedUsers: { [stranger.snowflake]: { id: stranger.snowflake, username: 'v23_stranger' } },
    });
    expect('…and inviting into it says so too, rather than "no such group"',
      /is already closed/.test(inviteClosed.content), inviteClosed.content);
  }

  console.log('\n[the surface gate stays off the group path]');
  {
    // Phase 22 proved recommend_group_members survives the flip. D3's concern
    // is narrower and worth its own assertion: no group subcommand may be
    // reachable only when match_surface is 'web', or flipping the gate for
    // D4 would silently take the group commands with it.
    const { data: gate } = await admin.from('plan_feature_gates')
      .select('plan_code, config').eq('feature_key', 'match_surface');
    expect('the gate is readable and seeded', (gate ?? []).length >= 1, JSON.stringify(gate));

    const sources = readTree('src/lib/discord');
    const gateReferences = Object.entries(sources).filter(([, src]) => /match_surface/.test(src));
    expect('no Discord handler consults match_surface',
      gateReferences.length === 0, gateReferences.map(([f]) => f).join(', '));
  }

  console.log('\n[the port keeps its shape]');
  {
    expect('the required floor is unchanged at seven', REQUIRED_OPERATIONS.length === 7,
      REQUIRED_OPERATIONS.join(', '));
    for (const op of OPTIONAL_OPERATIONS) {
      expect(`the adapter implements ${op}`, typeof port[op] === 'function');
    }
    expect('createPairing is still owed to D4, not silently added',
      typeof port.createPairing !== 'function');
  }

  console.log('\n[seams — eight new files, same two rules]');
  {
    const discordTree = readTree('src/lib/discord');
    const communityTree = readTree('src/lib/community');

    const botTouchesDb = Object.entries(discordTree).filter(
      ([, src]) => /from\s+["']@supabase\//.test(src) || /from\s+["']@\/lib\/supabase/.test(src)
        || /from\s+["']@\/lib\/community\/proofsignals/.test(src),
    );
    expect('no file under src/lib/discord imports Supabase or the adapter',
      botTouchesDb.length === 0, botTouchesDb.map(([f]) => f).join(', '));

    const communityTouchesDiscord = Object.entries(communityTree).filter(
      ([, src]) => /from\s+["']@\/lib\/discord/.test(src) || /from\s+["'][.\/]*lib\/discord/.test(src),
    );
    expect('no file under src/lib/community imports Discord',
      communityTouchesDiscord.length === 0, communityTouchesDiscord.map(([f]) => f).join(', '));

    const rulesOnly = Object.entries(communityTree).filter(([f]) => f.includes('/rules/'));
    expect('the rules modules import no backend at all',
      rulesOnly.length > 0 && rulesOnly.every(([, src]) => !/@supabase|@\/lib\/supabase/.test(src)),
      rulesOnly.map(([f]) => f).join(', '));

    const route = readFileSync('src/app/api/discord/interactions/route.js', 'utf8');
    expect('the interactions route is still the only composition root',
      route.includes('@/lib/community/proofsignals/adapter') && route.includes('@/lib/discord/router'));

    // The handlers are only testable here because they take a port. A handler
    // that reached for the adapter directly would break that and this check.
    const groupSrc = readFileSync('src/lib/discord/commands/group.js', 'utf8');
    expect('the group handler takes its backend as an argument',
      /export async function handleGroup\(\{ interaction, port, config, siteUrl \}\)/.test(groupSrc));
  }

  console.log('\n[house rules]');
  {
    const tree = { ...readTree('src/lib/discord'), ...readTree('src/lib/community') };
    const reviewTalk = Object.entries(tree).filter(([, src]) =>
      /\b(leave|write|post) (us )?(a|an) (online )?review\b/i.test(src)
      || /\bask(ing)? for (a )?review\b/i.test(src));
    expect('nothing asks for an online review',
      reviewTalk.length === 0, reviewTalk.map(([f]) => f).join(', '));

    const proofLab = Object.entries(tree).filter(([, src]) => /Proof Lab/i.test(src));
    expect('the marketplace is never called Proof Lab',
      proofLab.length === 0, proofLab.map(([f]) => f).join(', '));
  }
} catch (err) {
  bad('harness', err.stack ?? err.message);
} finally {
  // Users first: that cascades their group_members rows, which is what frees
  // the groups. Reported, never swallowed — the phase 22 lesson that left 27
  // accounts in the live database.
  const residue = [];
  for (const id of tempUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) residue.push(`user ${id}: ${error.message}`);
  }
  // groups.created_by is ON DELETE SET NULL, so deleting the creator does NOT
  // take the group with it — that is the phase 22 decision that stops one
  // member's account deletion evaporating a four-person room. It does mean a
  // verify run has to sweep its own groups by name, not rely on the cascade.
  {
    const { error } = await admin.from('groups').delete().like('name', `V23 %${rand}`);
    if (error) residue.push(`groups by name: ${error.message}`);
  }
  for (const id of tempGroupIds) {
    const { error } = await admin.from('groups').delete().eq('id', id);
    if (error) residue.push(`group ${id}: ${error.message}`);
  }
  if (residue.length > 0) {
    console.log(`\n  !! ${residue.length} fixture row(s) left behind:`);
    for (const line of residue) console.log(`     ${line}`);
  }
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
