// Live verification for Phase 22 / Discord D2 — groups and caps.
//
// The build spec's "done when" for D2, asserted against the real database:
//
//   • a member creates a private group and invites from the recommendations
//   • a free member is stopped at their concurrency cap BY THE DATABASE
//   • a group pairing does not consume match quota
//
// Plus the two traps the Phase 21 handoff named:
//
//   1. THE SURFACE GATE. recommend_group_members must keep working when the
//      match_surface gate is flipped to 'discord', or D3 inherits a bug that
//      looks like its own. The [surface gate] block flips the live gate,
//      proves the recommender still answers while eligible_match_candidates
//      refuses, and puts it back.
//   2. APPEND-ONLY / FOREIGN KEYS. Nothing here is append-only, but the FK
//      actions still have to let an account be deleted. The [account
//      deletion] block deletes a member who owns a group and has group
//      pairings, which is the shape that broke every deletion in Phase 21.
//
//   node verify-phase22.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
const tempGroupIds = [];
let gateFlipped = false;

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: JSON.stringify({ query }),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

const setSurface = (surface) =>
  sql(`update public.plan_feature_gates set config = '{"surface":"${surface}"}'::jsonb where feature_key = 'match_surface'`);

async function mkUser(tag, { plan = 'sprout', admin: isAdmin = false, demo = false, track = null } = {}) {
  const email = `verify22-${tag}-${rand}@example.com`;
  const password = 'Verify22!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  tempUserIds.push(id);

  const patch = { display_name: `V22 ${tag}`, is_demo: demo };
  if (plan !== 'sprout') patch.plan_code = plan;
  if (track) patch.track = track;
  const { error: pErr } = await admin.from('user_profiles').update(patch).eq('user_id', id);
  if (pErr) throw new Error(`profile(${tag}): ${pErr.message}`);

  if (isAdmin) {
    const { error: rErr } = await admin.from('user_roles').insert({ user_id: id, role: 'admin' });
    if (rErr) throw new Error(`grant admin(${tag}): ${rErr.message}`);
  }

  // This suite needs about forty signed-in members, which is past Supabase's
  // per-IP sign-in rate limit. Backing off is the fix rather than thinning the
  // fixtures: each block here is testing a distinct rule, and merging them to
  // save a sign-in would make a failure harder to read.
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  for (let attempt = 1; ; attempt++) {
    const { error: sErr } = await client.auth.signInWithPassword({ email, password });
    if (!sErr) break;
    if (!/rate limit/i.test(sErr.message) || attempt >= 5) {
      throw new Error(`signIn(${tag}): ${sErr.message}`);
    }
    const wait = attempt * 15000;
    console.log(`     … auth rate limit; waiting ${wait / 1000}s before retrying ${tag}`);
    await new Promise((r) => setTimeout(r, wait));
  }
  return { id, tag, email, client };
}

let assetSeq = 0;

// public_url is unique per owner, so the sequence matters: several fixtures
// give one member a second asset.
async function mkAsset(user, name = null) {
  const n = ++assetSeq;
  const { data, error } = await admin.from('assets').insert({
    owner_user_id: user.id,
    name: name ?? `Asset ${user.tag} ${rand}`,
    public_url: `https://example.com/${user.tag}-${rand}-${n}`,
    asset_type: 'digital_product_saas',
    status: 'active',
    moderation_status: 'ok',
  }).select('id').single();
  if (error) throw new Error(`mkAsset(${user.tag}): ${error.message}`);
  // Only the FIRST asset becomes the member's default. A later one silently
  // repointing user.assetId is how the asset-deletion block below ended up
  // deleting the spare instead of the one on the group seat.
  user.assetId ??= data.id;
  return data.id;
}

async function mkUserWithAsset(tag, opts = {}) {
  const u = await mkUser(tag, opts);
  await mkAsset(u);
  return u;
}

const rpc = async (client, fn, args) => {
  const { data, error } = await client.rpc(fn, args);
  return { data, error };
};

async function newGroup(owner, { name = null, visibility = 'private', track = null, maxMembers = null } = {}) {
  const { data, error } = await rpc(owner.client, 'create_group', {
    p_name: name ?? `Group ${owner.tag} ${rand}`,
    p_asset_id: owner.assetId,
    p_kind: 'feedback',
    p_track: track,
    p_visibility: visibility,
    p_max_members: maxMembers,
    p_acting_user_id: null,
  });
  if (error) throw new Error(`create_group(${owner.tag}): ${error.message}`);
  tempGroupIds.push(data.group_id);
  return data.group_id;
}

const readTree = (dir, acc = {}) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) readTree(full, acc);
    else if (/\.(js|jsx|mjs)$/.test(entry)) acc[full] = readFileSync(full, 'utf8');
  }
  return acc;
};

try {
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[schema]');
  {
    for (const table of ['groups', 'group_members']) {
      const { error } = await admin.from(table).select('id').limit(1);
      expect(`${table} exists`, !error, error?.message ?? '');
    }

    const cols = await sql(`select column_name from information_schema.columns
      where table_schema='public' and table_name='matches' and column_name in ('in_group_id','discord_thread_id')`);
    expect('matches carries in_group_id and discord_thread_id',
      cols.body.includes('in_group_id') && cols.body.includes('discord_thread_id'), cols.body.slice(0, 200));

    const track = await sql(`select column_name from information_schema.columns
      where table_schema='public' and table_name='user_profiles' and column_name='track'`);
    expect('user_profiles carries track', track.body.includes('track'), track.body.slice(0, 200));

    const cons = await sql(`select conname, pg_get_constraintdef(oid) def from pg_constraint
      where conrelid='public.matches'::regclass and conname in ('matches_source_check','matches_group_source_agrees','matches_in_group_id_fkey')`);
    expect("source now allows 'group'", cons.body.includes("'group'"), cons.body.slice(0, 300));
    expect('source and in_group_id cannot drift apart',
      cons.body.includes('matches_group_source_agrees'), cons.body.slice(0, 300));
    expect('in_group_id is ON DELETE RESTRICT (a group is closed, never deleted)',
      /ON DELETE RESTRICT/.test(cons.body), cons.body.slice(0, 300));

    const sizes = await sql(`select pg_get_constraintdef(oid) def from pg_constraint
      where conrelid='public.groups'::regclass and conname='groups_max_members_by_kind'`);
    expect('group sizes are constrained by kind (feedback 4–6, challenge 2–12)',
      sizes.body.includes('4') && sizes.body.includes('12'), sizes.body.slice(0, 300));

    // No table-level "active implies an asset" CHECK: it cannot coexist with
    // ON DELETE SET NULL, and the alternative FK action made account deletion
    // depend on cascade-trigger ordering. The requirement lives in the RPCs,
    // and is asserted behaviourally further down.
    const assetFk = await sql(`select pg_get_constraintdef(oid) def from pg_constraint
      where conrelid='public.group_members'::regclass and conname='group_members_asset_id_fkey'`);
    expect('group_members.asset_id is ON DELETE SET NULL, so no seat can block a deletion',
      /ON DELETE SET NULL/.test(assetFk.body), assetFk.body.slice(0, 300));

    const succ = await sql(`select pg_get_triggerdef(t.oid) def from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      where c.relname='group_members' and t.tgname='trg_group_members_succeed_owner'`);
    expect('the ownership-succession trigger is FOR EACH ROW (the Phase 21 lesson)',
      /FOR EACH ROW/.test(succ.body) && /AFTER DELETE/.test(succ.body), succ.body.slice(0, 300));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[the three gates]');
  {
    const { data: gates, error } = await admin
      .from('plan_feature_gates')
      .select('plan_code, feature_key, enabled, limit_int')
      .in('feature_key', ['max_concurrent_matchups', 'max_concurrent_groups', 'feedback_groups_per_month']);
    expect('all three gates are seeded for all three plans',
      !error && gates?.length === 9, error?.message ?? String(gates?.length));

    const at = (plan, key) => gates?.find((g) => g.plan_code === plan && g.feature_key === key)?.limit_int;
    expect('sprout caps are 1 / 1 / 1',
      at('sprout', 'max_concurrent_matchups') === 1 && at('sprout', 'max_concurrent_groups') === 1
      && at('sprout', 'feedback_groups_per_month') === 1);
    expect('bloom caps are 3 / 3 / 3',
      at('bloom', 'max_concurrent_matchups') === 3 && at('bloom', 'max_concurrent_groups') === 3
      && at('bloom', 'feedback_groups_per_month') === 3);
    expect('the dormant flourish tier is seeded as a twin of bloom, not left undefined',
      at('flourish', 'max_concurrent_matchups') === 3 && at('flourish', 'max_concurrent_groups') === 3
      && at('flourish', 'feedback_groups_per_month') === 3);

    // Phase 21b whitelisted the keys and wrote the labels in advance, so the
    // cards pick these up with no code change. Assert the wiring, not the copy.
    const { data: pub } = await admin.rpc('public_plan_caps');
    const keys = new Set((pub ?? []).map((r) => r.feature_key));
    expect('public_plan_caps() publishes all three to the logged-out pricing page',
      ['max_concurrent_matchups', 'max_concurrent_groups', 'feedback_groups_per_month'].every((k) => keys.has(k)));

    const plans = readFileSync(new URL('./src/lib/fivestarz/plans.js', import.meta.url), 'utf8');
    expect('plans.js has a label for each of them',
      plans.includes('max_concurrent_matchups') && plans.includes('max_concurrent_groups')
      && plans.includes('feedback_groups_per_month'));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[track]');
  {
    const member = await mkUser('track-a');
    const other = await mkUser('track-b');

    const { data: setOwn, error: ownErr } = await rpc(member.client, 'set_member_track',
      { p_track: 'ai_builders', p_user_id: null });
    expect('a member can set their own track', !ownErr && setOwn?.status === 'changed', ownErr?.message ?? JSON.stringify(setOwn));

    const { data: again } = await rpc(member.client, 'set_member_track', { p_track: 'ai_builders', p_user_id: null });
    expect('re-setting the same track writes nothing', again?.status === 'unchanged', JSON.stringify(again));

    const { error: badTrack } = await rpc(member.client, 'set_member_track', { p_track: 'growth_hackers', p_user_id: null });
    expect('an unknown track is refused', !!badTrack && /track must be/i.test(badTrack.message), badTrack?.message ?? 'succeeded');

    const { error: theirs } = await rpc(member.client, 'set_member_track', { p_track: 'creators', p_user_id: other.id });
    expect("a member cannot set someone else's track",
      !!theirs && /only set your own/i.test(theirs.message), theirs?.message ?? 'succeeded');

    const { error: direct } = await member.client.from('user_profiles').update({ track: 'creators' }).eq('user_id', member.id);
    const { data: still } = await admin.from('user_profiles').select('track').eq('user_id', member.id).single();
    expect('and cannot write the column through PostgREST either',
      still?.track === 'ai_builders', `error=${direct?.message ?? 'none'} track=${still?.track}`);

    const { data: cleared } = await rpc(member.client, 'set_member_track', { p_track: null, p_user_id: null });
    expect('passing null clears it (cross-track is a valid answer)', cleared?.track === null, JSON.stringify(cleared));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[creating a group]');
  let owner, groupId;
  {
    owner = await mkUserWithAsset('owner', { plan: 'bloom', track: 'ai_builders' });
    const assetless = await mkUser('assetless');

    const { error: noAsset } = await rpc(assetless.client, 'create_group',
      { p_name: 'No asset', p_asset_id: null, p_kind: 'feedback', p_track: null, p_visibility: 'private', p_max_members: null, p_acting_user_id: null });
    expect('a group cannot be created without an asset to be reviewed',
      !!noAsset && /bring an asset/i.test(noAsset.message), noAsset?.message ?? 'succeeded');

    groupId = await newGroup(owner, { visibility: 'private', track: 'ai_builders' });
    expect('the owner creates a private group', !!groupId);

    const { data: g } = await admin.from('groups').select('*').eq('id', groupId).single();
    expect('it starts at forming, private, 6 seats, feedback kind',
      g?.status === 'forming' && g?.visibility === 'private' && g?.max_members === 6 && g?.kind === 'feedback',
      JSON.stringify(g));

    const { data: seat } = await admin.from('group_members').select('*').eq('group_id', groupId).single();
    expect('the creator takes the first seat as owner, joined_via created, with their asset',
      seat?.role === 'owner' && seat?.status === 'active' && seat?.joined_via === 'created' && seat?.asset_id === owner.assetId,
      JSON.stringify(seat));

    const { error: badSize } = await rpc(owner.client, 'create_group',
      { p_name: 'Too big', p_asset_id: owner.assetId, p_kind: 'feedback', p_track: null, p_visibility: 'private', p_max_members: 9, p_acting_user_id: null });
    expect('a feedback group cannot be sized outside 4–6', !!badSize, 'succeeded');

    const { error: notAdmin } = await rpc(owner.client, 'create_group',
      { p_name: 'Cohort', p_asset_id: owner.assetId, p_kind: 'challenge', p_track: null, p_visibility: 'open', p_max_members: 12, p_acting_user_id: null });
    expect('a member cannot create a challenge cohort (D5 owns those)',
      !!notAdmin && /admin/i.test(notAdmin.message), notAdmin?.message ?? 'succeeded');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[group caps, enforced by the database]');
  {
    const free = await mkUserWithAsset('free-groups');
    const g1 = await newGroup(free);
    expect('a free member creates their first group', !!g1);

    const { error: second } = await rpc(free.client, 'create_group',
      { p_name: 'Second', p_asset_id: free.assetId, p_kind: 'feedback', p_track: null, p_visibility: 'private', p_max_members: null, p_acting_user_id: null });
    expect('their second is refused at max_concurrent_groups = 1',
      !!second && /limit on your plan/i.test(second.message), second?.message ?? 'succeeded');

    // Leaving frees the concurrency seat but NOT the monthly allowance: the
    // month counts memberships that became active, including ones since left,
    // or join/leave/join would be an unlimited loop.
    const { error: leaveErr } = await rpc(free.client, 'leave_group', { p_group_id: g1, p_acting_user_id: null });
    expect('they can leave', !leaveErr, leaveErr?.message ?? '');
    expect('the open-group count drops to zero',
      (await admin.rpc('member_open_group_count', { p_user_id: free.id })).data === 0);
    expect('but the month still counts the join',
      (await admin.rpc('member_groups_joined_this_month', { p_user_id: free.id })).data === 1);

    const { error: third } = await rpc(free.client, 'create_group',
      { p_name: 'Third', p_asset_id: free.assetId, p_kind: 'feedback', p_track: null, p_visibility: 'private', p_max_members: null, p_acting_user_id: null });
    expect('so a third attempt is refused at feedback_groups_per_month = 1',
      !!third && /this month/i.test(third.message), third?.message ?? 'succeeded');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[invite, accept, decline, remove]');
  let member1;
  {
    member1 = await mkUserWithAsset('member1', { plan: 'bloom', track: 'ai_builders' });
    const decliner = await mkUserWithAsset('decliner', { plan: 'bloom' });
    const outsider = await mkUserWithAsset('outsider', { plan: 'bloom' });

    const { error: notOwner } = await rpc(outsider.client, 'invite_to_group',
      { p_group_id: groupId, p_user_id: member1.id, p_joined_via: 'invite', p_acting_user_id: null });
    expect('a non-owner cannot invite',
      !!notOwner && /only the group owner/i.test(notOwner.message), notOwner?.message ?? 'succeeded');

    const { data: inv, error: invErr } = await rpc(owner.client, 'invite_to_group',
      { p_group_id: groupId, p_user_id: member1.id, p_joined_via: 'invite', p_acting_user_id: null });
    expect('the owner invites a member', !invErr && inv?.status === 'invited', invErr?.message ?? JSON.stringify(inv));

    const { data: twice } = await rpc(owner.client, 'invite_to_group',
      { p_group_id: groupId, p_user_id: member1.id, p_joined_via: 'invite', p_acting_user_id: null });
    expect('inviting twice is idempotent, not a second row', twice?.status === 'already_invited', JSON.stringify(twice));

    const { data: mine } = await rpc(member1.client, 'my_groups', { p_acting_user_id: null });
    expect('the invitation shows up in my_groups',
      mine?.some((g) => g.group_id === groupId && g.my_status === 'invited'), JSON.stringify(mine));

    const { data: acc, error: accErr } = await rpc(member1.client, 'respond_to_group_invite',
      { p_group_id: groupId, p_accept: true, p_asset_id: member1.assetId, p_acting_user_id: null });
    expect('they accept and take a seat', !accErr && acc?.status === 'joined', accErr?.message ?? JSON.stringify(acc));
    expect('the room now holds two',
      (await admin.rpc('group_active_member_count', { p_group_id: groupId })).data === 2);

    await rpc(owner.client, 'invite_to_group',
      { p_group_id: groupId, p_user_id: decliner.id, p_joined_via: 'invite', p_acting_user_id: null });
    const { data: dec } = await rpc(decliner.client, 'respond_to_group_invite',
      { p_group_id: groupId, p_accept: false, p_asset_id: null, p_acting_user_id: null });
    expect('a declined invite answers declined', dec?.status === 'declined', JSON.stringify(dec));
    const { data: decRow } = await admin.from('group_members')
      .select('status').eq('group_id', groupId).eq('user_id', decliner.id).single();
    expect('and leaves an auditable row rather than disappearing', decRow?.status === 'declined', JSON.stringify(decRow));

    const { error: rosterDenied } = await rpc(outsider.client, 'group_roster',
      { p_group_id: groupId, p_acting_user_id: null });
    expect('an outsider cannot read the roster',
      !!rosterDenied && /cannot see/i.test(rosterDenied.message), rosterDenied?.message ?? 'succeeded');

    const { data: roster } = await rpc(member1.client, 'group_roster', { p_group_id: groupId, p_acting_user_id: null });
    expect('a member can, and sees each seat with its asset',
      roster?.length === 3 && roster.every((r) => r.member_status !== 'active' || r.asset_id), JSON.stringify(roster?.length));

    const { error: selfRemove } = await rpc(owner.client, 'remove_group_member',
      { p_group_id: groupId, p_user_id: owner.id, p_acting_user_id: null });
    expect('remove_group_member refuses to remove yourself',
      !!selfRemove && /leave_group/i.test(selfRemove.message), selfRemove?.message ?? 'succeeded');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[the request gate on a listed group]');
  {
    const host = await mkUserWithAsset('host', { plan: 'bloom' });
    const asker = await mkUserWithAsset('asker', { plan: 'bloom' });
    const listed = await newGroup(host, { visibility: 'listed', name: `Listed ${rand}` });
    const privateGroup = await newGroup(host, { visibility: 'private', name: `Hidden ${rand}` });
    const openGroup = await newGroup(host, { visibility: 'open', name: `Open ${rand}` });

    const { data: req, error: reqErr } = await rpc(asker.client, 'join_group',
      { p_group_id: listed, p_asset_id: asker.assetId, p_acting_user_id: null });
    expect('joining a listed group lands at requested, not active',
      !reqErr && req?.status === 'requested', reqErr?.message ?? JSON.stringify(req));
    expect('which takes no seat yet',
      (await admin.rpc('group_active_member_count', { p_group_id: listed })).data === 1);

    const { data: dup } = await rpc(asker.client, 'join_group',
      { p_group_id: listed, p_asset_id: asker.assetId, p_acting_user_id: null });
    expect('asking twice says so rather than queueing twice', dup?.status === 'already_requested', JSON.stringify(dup));

    const { error: notHost } = await rpc(asker.client, 'review_group_join_request',
      { p_group_id: listed, p_user_id: asker.id, p_approve: true, p_acting_user_id: null });
    expect('the requester cannot approve their own request',
      !!notHost && /only the group owner/i.test(notHost.message), notHost?.message ?? 'succeeded');

    const { data: appr, error: apprErr } = await rpc(host.client, 'review_group_join_request',
      { p_group_id: listed, p_user_id: asker.id, p_approve: true, p_acting_user_id: null });
    expect('the owner lets them in', !apprErr && appr?.status === 'joined', apprErr?.message ?? JSON.stringify(appr));

    const { error: privErr } = await rpc(asker.client, 'join_group',
      { p_group_id: privateGroup, p_asset_id: asker.assetId, p_acting_user_id: null });
    expect('a private group cannot be joined at all',
      !!privErr && /invite only/i.test(privErr.message), privErr?.message ?? 'succeeded');

    // asker is now in one group; bloom allows three, so the open group is reachable.
    const { data: openJoin, error: openErr } = await rpc(asker.client, 'join_group',
      { p_group_id: openGroup, p_asset_id: asker.assetId, p_acting_user_id: null });
    expect('an open group joins straight away', !openErr && openJoin?.status === 'joined',
      openErr?.message ?? JSON.stringify(openJoin));

    console.log('\n[discovery on the site]');
    const seeker = await mkUserWithAsset('seeker', { plan: 'bloom' });
    const { data: found, error: foundErr } = await rpc(seeker.client, 'discoverable_groups',
      { p_limit: 50, p_acting_user_id: null });
    const ids = new Set((found ?? []).map((g) => g.group_id));
    expect('listed and open groups are discoverable', !foundErr && ids.has(listed) && ids.has(openGroup),
      foundErr?.message ?? JSON.stringify([...ids]));
    expect('private ones are not', !ids.has(privateGroup));
    const listedRow = (found ?? []).find((g) => g.group_id === listed);
    expect('a listed group announces that joining means asking', listedRow?.joins_by_request === true, JSON.stringify(listedRow));
    expect('and advertises its seats', listedRow?.active_member_count === 2 && listedRow?.max_members === 6, JSON.stringify(listedRow));

    const { data: hostSees } = await rpc(host.client, 'discoverable_groups', { p_limit: 50, p_acting_user_id: null });
    expect('groups you are already in are left out of discovery',
      !(hostSees ?? []).some((g) => g.group_id === listed || g.group_id === openGroup));

    // The free tier: discovery still lists the rooms, with the reason it
    // cannot be taken up, because "you are at your cap" is more useful than
    // a page that quietly omits everything.
    const capped = await mkUserWithAsset('capped', { plan: 'sprout' });
    await rpc(capped.client, 'join_group', { p_group_id: openGroup, p_asset_id: capped.assetId, p_acting_user_id: null });
    const { data: cappedSees } = await rpc(capped.client, 'discoverable_groups', { p_limit: 50, p_acting_user_id: null });
    const cappedListed = (cappedSees ?? []).find((g) => g.group_id === listed);
    expect('a capped member is shown the room with can_join false and a reason',
      cappedListed && cappedListed.can_join === false && /plan allows/i.test(cappedListed.blocked_reason ?? ''),
      JSON.stringify(cappedListed));

    const { error: cappedJoin } = await rpc(capped.client, 'join_group',
      { p_group_id: listed, p_asset_id: capped.assetId, p_acting_user_id: null });
    expect('and the database refuses the attempt regardless of what the page said',
      !!cappedJoin && /limit on your plan/i.test(cappedJoin.message), cappedJoin?.message ?? 'succeeded');

    console.log('\n[the demo wall]');
    const demo = await mkUserWithAsset('demo', { plan: 'bloom', demo: true });
    const { error: demoJoin } = await rpc(demo.client, 'join_group',
      { p_group_id: openGroup, p_asset_id: demo.assetId, p_acting_user_id: null });
    expect('a demo account cannot join a real members group',
      !!demoJoin && /demo accounts/i.test(demoJoin.message), demoJoin?.message ?? 'succeeded');
    const { data: demoSees } = await rpc(demo.client, 'discoverable_groups', { p_limit: 50, p_acting_user_id: null });
    expect('and is not shown it either', !(demoSees ?? []).some((g) => g.group_id === openGroup));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[the recommender]');
  let recOwner, recGroupId, sameTrack, otherTrack, noTrack, connected;
  {
    recOwner = await mkUserWithAsset('rec-owner', { plan: 'bloom', track: 'ai_builders' });
    sameTrack = await mkUserWithAsset('rec-same', { plan: 'bloom', track: 'ai_builders' });
    otherTrack = await mkUserWithAsset('rec-other', { plan: 'bloom', track: 'creators' });
    noTrack = await mkUserWithAsset('rec-none', { plan: 'bloom' });
    connected = await mkUserWithAsset('rec-connected', { plan: 'bloom', track: 'ai_builders' });
    const second = await mkUserWithAsset('rec-second', { plan: 'bloom', track: 'ai_builders' });

    recGroupId = await newGroup(recOwner, { track: 'ai_builders', name: `Rec ${rand}` });

    const { error: notOwnerRec } = await rpc(sameTrack.client, 'recommend_group_members',
      { p_group_id: recGroupId, p_limit: 10, p_acting_user_id: null });
    expect('only the owner sees recommendations',
      !!notOwnerRec && /only the group owner/i.test(notOwnerRec.message), notOwnerRec?.message ?? 'succeeded');

    const { data: recs, error: recErr } = await rpc(recOwner.client, 'recommend_group_members',
      { p_group_id: recGroupId, p_limit: 50, p_acting_user_id: null });
    const recIds = new Set((recs ?? []).map((r) => r.candidate_user_id));
    expect('the recommender answers', !recErr && Array.isArray(recs), recErr?.message ?? '');
    expect("it suggests a candidate on the group's Track", recIds.has(sameTrack.id), JSON.stringify([...recIds]));
    expect('it drops a candidate on a different Track', !recIds.has(otherTrack.id));
    expect('a candidate with no Track set is not filtered out (unset degrades to today)', recIds.has(noTrack.id));
    expect('the owner is never suggested to themselves', !recIds.has(recOwner.id));

    // Step 3: anyone already in or on their way in is dropped.
    await rpc(recOwner.client, 'invite_to_group',
      { p_group_id: recGroupId, p_user_id: sameTrack.id, p_joined_via: 'recommender', p_acting_user_id: null });
    const { data: recs2 } = await rpc(recOwner.client, 'recommend_group_members',
      { p_group_id: recGroupId, p_limit: 50, p_acting_user_id: null });
    expect('an invited candidate stops being recommended',
      !(recs2 ?? []).some((r) => r.candidate_user_id === sameTrack.id));
    const { data: viaRow } = await admin.from('group_members')
      .select('joined_via').eq('group_id', recGroupId).eq('user_id', sameTrack.id).single();
    expect("the invite records that it came from the recommendations", viaRow?.joined_via === 'recommender', JSON.stringify(viaRow));

    // Step 4 — THE NEW RULE. `connected` is one degree from `second`; once
    // `second` is in the room, `connected` must drop out even though the
    // OWNER has no connection to them at all. A four-person group needs all
    // six pairs to pass, where a two-person match had one.
    expect('before the edge exists, the connected candidate is recommended',
      (recs ?? []).some((r) => r.candidate_user_id === connected.id), JSON.stringify([...recIds]));

    const edge = await sql(`insert into public.matches
      (member_a_user_id, member_b_user_id, member_a_asset_id, member_b_asset_id, source, status, separation_degree_used)
      values ('${connected.id}','${second.id}','${connected.assetId}','${second.assetId}','browse','matched',1)`);
    expect('a direct match between two candidates is written (fixture)', edge.ok, edge.body.slice(0, 200));

    const { data: pairOk } = await admin.rpc('pair_respects_separation_preferences',
      { p_user_a: connected.id, p_user_b: second.id });
    expect('they are now inside each other\'s separation threshold', pairOk === false, String(pairOk));

    await rpc(recOwner.client, 'invite_to_group',
      { p_group_id: recGroupId, p_user_id: second.id, p_joined_via: 'invite', p_acting_user_id: null });
    await rpc(second.client, 'respond_to_group_invite',
      { p_group_id: recGroupId, p_accept: true, p_asset_id: second.assetId, p_acting_user_id: null });

    const { data: recs3, error: rec3Err } = await rpc(recOwner.client, 'recommend_group_members',
      { p_group_id: recGroupId, p_limit: 50, p_acting_user_id: null });
    expect('the recommender still answers with two members in the room', !rec3Err, rec3Err?.message ?? '');
    expect('ALL PAIRS: a candidate too close to a non-owner member is dropped',
      !(recs3 ?? []).some((r) => r.candidate_user_id === connected.id),
      JSON.stringify((recs3 ?? []).map((r) => r.candidate_display_name)));
    expect('while unconnected candidates survive',
      (recs3 ?? []).some((r) => r.candidate_user_id === noTrack.id));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TRAP 1. The whole reason match_candidates_for exists.
  console.log('\n[surface gate — the trap that would surface as a D3 bug]');
  {
    const flip = await setSurface('discord');
    gateFlipped = true;
    expect('the match_surface gate can be flipped to discord (as D3 will)', flip.ok, flip.body.slice(0, 200));

    const { error: gated } = await rpc(sameTrack.client, 'eligible_match_candidates',
      { p_my_asset_id: sameTrack.assetId, p_limit: 5, p_offset: 0 });
    expect('eligible_match_candidates now refuses members, as designed',
      !!gated && /handled in Discord/i.test(gated.message), gated?.message ?? 'succeeded');

    const { data: stillRecs, error: stillErr } = await rpc(recOwner.client, 'recommend_group_members',
      { p_group_id: recGroupId, p_limit: 10, p_acting_user_id: null });
    expect('BUT recommend_group_members still answers — the recommender survives D3',
      !stillErr && Array.isArray(stillRecs) && stillRecs.length > 0,
      stillErr?.message ?? `rows=${stillRecs?.length}`);

    const restore = await setSurface('web');
    gateFlipped = !restore.ok;
    expect('the gate is restored to web', restore.ok, restore.body.slice(0, 200));

    const { error: ungated } = await rpc(sameTrack.client, 'eligible_match_candidates',
      { p_my_asset_id: sameTrack.assetId, p_limit: 5, p_offset: 0 });
    expect('and the member-facing RPC works again', !ungated, ungated?.message ?? '');

    // The ungated core takes a member as an argument and checks nothing, so it
    // must be unreachable by members. Supabase's default privileges grant
    // EXECUTE to anon and authenticated on every new function, so this needs
    // an explicit revoke by role name — `revoke from public` does not do it.
    const { error: leak } = await rpc(sameTrack.client, 'match_candidates_for',
      { p_for_user_id: recOwner.id, p_asset_id: recOwner.assetId, p_limit: 5, p_offset: 0 });
    expect('match_candidates_for is not executable by a member (it would leak the graph)',
      !!leak && /permission denied|does not exist|not find/i.test(leak.message), leak?.message ?? 'succeeded');

    const acl = await sql(`select coalesce(proacl::text,'') acl from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='match_candidates_for'`);
    expect('its ACL names neither anon nor authenticated',
      !/\banon=/.test(acl.body) && !/\bauthenticated=/.test(acl.body), acl.body.slice(0, 200));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[the concurrency cap]');
  {
    const a = await mkUserWithAsset('conc-a', { plan: 'bloom' });
    const freeB = await mkUserWithAsset('conc-free', { plan: 'sprout' });
    const c = await mkUserWithAsset('conc-c', { plan: 'bloom' });
    const d = await mkUserWithAsset('conc-d', { plan: 'bloom' });
    const e = await mkUserWithAsset('conc-e', { plan: 'bloom' });
    const f = await mkUserWithAsset('conc-f', { plan: 'bloom' });

    const match = (from, to) => rpc(from.client, 'create_match', {
      p_other_user_id: to.id, p_my_asset_id: from.assetId, p_their_asset_id: to.assetId, p_source: 'browse',
    });

    const { error: m1 } = await match(a, freeB);
    expect('a paid member opens a match-up with a free member', !m1, m1?.message ?? '');
    expect('the free member is now at 1 open match-up',
      (await admin.rpc('member_concurrent_matchup_count', { p_user_id: freeB.id })).data === 1);

    // THE "DONE WHEN": a free member stopped at their cap by the database.
    // Reached through the other side, which is the path that exists today:
    // sprout has no browse quota of its own, so someone else asking is how a
    // free member's concurrency cap actually binds.
    const { error: m2 } = await match(c, freeB);
    expect('a second member is refused: the free member is at max_concurrent_matchups = 1',
      !!m2 && /open match-ups as their plan allows/i.test(m2.message), m2?.message ?? 'succeeded');

    const { error: m3 } = await match(a, d);
    const { error: m4 } = await match(a, e);
    expect('the paid member opens their 2nd and 3rd', !m3 && !m4, `${m3?.message ?? ''} ${m4?.message ?? ''}`);
    expect('and is counted at 3',
      (await admin.rpc('member_concurrent_matchup_count', { p_user_id: a.id })).data === 3);

    const { error: m5 } = await match(a, f);
    expect('their 4th is refused by their own cap of 3, before any monthly limit',
      !!m5 && /open match-up\(s\), which is the limit/i.test(m5.message), m5?.message ?? 'succeeded');

    const { data: usage } = await admin.from('user_monthly_usage')
      .select('browse_matches_initiated').eq('user_id', a.id).single();
    expect('the monthly quota was nowhere near spent (3 of 6 browse), so the cap did the work',
      usage?.browse_matches_initiated === 3, JSON.stringify(usage));

    // Completing one frees a slot: the cap is about what is open, not a total.
    await admin.from('matches').update({ status: 'completed' })
      .or(`and(member_a_user_id.eq.${a.id},member_b_user_id.eq.${e.id})`);
    expect('completing a match-up frees the slot',
      (await admin.rpc('member_concurrent_matchup_count', { p_user_id: a.id })).data === 2);
    const { error: m6 } = await match(a, f);
    expect('and the next one is allowed', !m6, m6?.message ?? '');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[a group pairing does not consume match quota]');
  let payer, partner, pairGroupId, pairMatchId;
  {
    payer = await mkUserWithAsset('pair-a', { plan: 'sprout' });
    partner = await mkUserWithAsset('pair-b', { plan: 'sprout' });
    pairGroupId = await newGroup(payer, { visibility: 'open', name: `Pairing ${rand}` });
    const { data: joined, error: joinErr } = await rpc(partner.client, 'join_group',
      { p_group_id: pairGroupId, p_asset_id: partner.assetId, p_acting_user_id: null });
    expect('a second free member joins the open group and is seated',
      !joinErr && joined?.status === 'joined'
      && (await admin.rpc('group_active_member_count', { p_group_id: pairGroupId })).data === 2,
      joinErr?.message ?? JSON.stringify(joined));

    const usageBefore = (await admin.from('user_monthly_usage').select('*').eq('user_id', payer.id).maybeSingle()).data;
    const concBefore = (await admin.rpc('member_concurrent_matchup_count', { p_user_id: payer.id })).data;

    const { data: id, error: pairErr } = await rpc(payer.client, 'pair_in_group',
      { p_group_id: pairGroupId, p_other_user_id: partner.id, p_previous_match_id: null });
    pairMatchId = id;
    expect('two free members in a group can pair up, despite sprout having no browse quota',
      !pairErr && !!id, pairErr?.message ?? '');

    const { data: row } = await admin.from('matches')
      .select('source, in_group_id, status, member_a_asset_id, member_b_asset_id').eq('id', id).single();
    expect("the match is labelled source = 'group' and carries in_group_id",
      row?.source === 'group' && row?.in_group_id === pairGroupId, JSON.stringify(row));
    expect('both assets came off the group_members rows, no picker needed',
      row?.member_a_asset_id === payer.assetId && row?.member_b_asset_id === partner.assetId, JSON.stringify(row));

    const usageAfter = (await admin.from('user_monthly_usage').select('*').eq('user_id', payer.id).maybeSingle()).data;
    expect('monthly usage did not move',
      (usageAfter?.total_matches_started ?? 0) === (usageBefore?.total_matches_started ?? 0)
      && (usageAfter?.browse_matches_initiated ?? 0) === (usageBefore?.browse_matches_initiated ?? 0),
      `${JSON.stringify(usageBefore)} → ${JSON.stringify(usageAfter)}`);
    expect('and the concurrency count did not move either (sprout\'s cap is 1)',
      (await admin.rpc('member_concurrent_matchup_count', { p_user_id: payer.id })).data === concBefore,
      String(concBefore));

    console.log('\n[in_group_id is not a self-service quota exemption]');
    const stranger = await mkUserWithAsset('stranger', { plan: 'bloom' });
    const { error: notIn } = await rpc(stranger.client, 'create_match', {
      p_other_user_id: partner.id, p_my_asset_id: stranger.assetId, p_their_asset_id: partner.assetId,
      p_source: 'group', p_in_group_id: pairGroupId,
    });
    expect('naming a group you are not in is refused',
      !!notIn && /not an active member of that group/i.test(notIn.message), notIn?.message ?? 'succeeded');

    const outsider2 = await mkUserWithAsset('outsider2', { plan: 'bloom' });
    const { error: themNotIn } = await rpc(payer.client, 'create_match', {
      p_other_user_id: outsider2.id, p_my_asset_id: payer.assetId, p_their_asset_id: outsider2.assetId,
      p_source: 'group', p_in_group_id: pairGroupId,
    });
    expect('pairing with someone who is not in the group is refused',
      !!themNotIn && /not an active member/i.test(themNotIn.message), themNotIn?.message ?? 'succeeded');

    const { error: mislabelled } = await rpc(stranger.client, 'create_match', {
      p_other_user_id: outsider2.id, p_my_asset_id: stranger.assetId, p_their_asset_id: outsider2.assetId,
      p_source: 'browse', p_in_group_id: pairGroupId,
    });
    expect("source and in_group_id must agree inside create_match",
      !!mislabelled && /must have source group/i.test(mislabelled.message), mislabelled?.message ?? 'succeeded');

    const drift = await sql(`insert into public.matches
      (member_a_user_id, member_b_user_id, member_a_asset_id, member_b_asset_id, source, status, separation_degree_used)
      values ('${stranger.id}','${outsider2.id}','${stranger.assetId}','${outsider2.assetId}','group','matched',1)`);
    expect("and the table itself refuses source = 'group' with a null in_group_id",
      !drift.ok && /matches_group_source_agrees/.test(drift.body), `${drift.status} ${drift.body.slice(0, 200)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[writes go through the RPCs and nowhere else]');
  {
    const prober = await mkUserWithAsset('prober', { plan: 'bloom' });

    const { error: insG } = await prober.client.from('groups')
      .insert({ name: 'Smuggled', kind: 'feedback', visibility: 'open', max_members: 6 });
    expect('a member cannot insert into groups', !!insG, 'succeeded');

    const { error: updG } = await prober.client.from('groups').update({ max_members: 6 }).eq('id', groupId);
    const { data: stillSix } = await admin.from('groups').select('max_members, visibility').eq('id', groupId).single();
    expect('or update one', stillSix?.visibility === 'private', `error=${updG?.message ?? 'none'}`);

    const { error: insGM } = await prober.client.from('group_members')
      .insert({ group_id: groupId, user_id: prober.id, joined_via: 'apply', status: 'active', asset_id: prober.assetId });
    const { data: notThere } = await admin.from('group_members')
      .select('id').eq('group_id', groupId).eq('user_id', prober.id).maybeSingle();
    expect('or seat themselves in a private group', !notThere, `error=${insGM?.message ?? 'none'}`);

    const { error: promote } = await prober.client.from('group_members')
      .update({ role: 'owner' }).eq('group_id', pairGroupId).eq('user_id', prober.id);
    expect('or promote themselves to owner', !!promote, 'succeeded');

    const { data: hidden } = await prober.client.from('groups').select('id').eq('id', groupId);
    expect('and cannot even read a private group they have no row for', (hidden ?? []).length === 0, JSON.stringify(hidden));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TRAP 2. Phase 21's lesson, applied to the new foreign keys.
  console.log('\n[account deletion still works]');
  {
    const { error: delErr } = await admin.auth.admin.deleteUser(payer.id);
    expect('deleting a member who owns a group and has group pairings succeeds', !delErr, delErr?.message ?? '');
    tempUserIds.splice(tempUserIds.indexOf(payer.id), 1);

    const { data: groupStill } = await admin.from('groups').select('created_by, status').eq('id', pairGroupId).single();
    expect('the group survives with a null creator rather than evaporating',
      groupStill && groupStill.created_by === null, JSON.stringify(groupStill));

    const { data: gone } = await admin.from('matches').select('id').eq('id', pairMatchId).maybeSingle();
    expect('their matches cascaded, so in_group_id ON DELETE RESTRICT never had to fire', !gone);

    const { data: seats } = await admin.from('group_members').select('user_id, role').eq('group_id', pairGroupId);
    expect('the remaining member keeps their seat', seats?.length === 1 && seats[0].user_id === partner.id, JSON.stringify(seats));
    // The cascade never calls leave_group, so succession has to happen on the
    // DELETE. Without the trigger the room is left with members and no owner:
    // nobody who can invite, approve, recommend or close.
    expect('and is promoted to owner by the succession trigger', seats?.[0]?.role === 'owner', JSON.stringify(seats));

    const { data: closed } = await rpc(partner.client, 'close_group', { p_group_id: pairGroupId, p_acting_user_id: null });
    const { data: afterClose } = await admin.from('groups').select('status').eq('id', pairGroupId).single();
    expect('so the surviving owner can still close the room',
      afterClose?.status === 'closed', `${JSON.stringify(closed)} ${JSON.stringify(afterClose)}`);
  }

  console.log('\n[an asset deleted out from under a seat]');
  {
    const u = await mkUserWithAsset('asset-gone', { plan: 'bloom' });
    const seatAsset = u.assetId;
    const g = await newGroup(u, { visibility: 'private', name: `AssetGone ${rand}` });
    const spare = await mkAsset(u, `Spare ${rand}`);

    const { error: delAsset } = await admin.from('assets').delete().eq('id', seatAsset);
    expect('deleting an asset is not blocked by the group seat holding it', !delAsset, delAsset?.message ?? '');

    const { data: seat } = await admin.from('group_members')
      .select('status, asset_id').eq('group_id', g).eq('user_id', u.id).single();
    expect('the seat survives with a null asset rather than the member being ejected',
      seat?.status === 'active' && seat?.asset_id === null, JSON.stringify(seat));

    const partner2 = await mkUserWithAsset('asset-gone-b', { plan: 'bloom' });
    await rpc(u.client, 'invite_to_group', { p_group_id: g, p_user_id: partner2.id, p_joined_via: 'invite', p_acting_user_id: null });
    await rpc(partner2.client, 'respond_to_group_invite', { p_group_id: g, p_accept: true, p_asset_id: partner2.assetId, p_acting_user_id: null });

    const { error: pairEmpty } = await rpc(u.client, 'pair_in_group',
      { p_group_id: g, p_other_user_id: partner2.id, p_previous_match_id: null });
    expect('but an empty seat cannot be paired, and says why',
      !!pairEmpty && /no asset on it/i.test(pairEmpty.message), pairEmpty?.message ?? 'succeeded');

    const { data: refilled, error: refillErr } = await rpc(u.client, 'set_group_asset',
      { p_group_id: g, p_asset_id: spare, p_acting_user_id: null });
    expect('set_group_asset refills it', !refillErr && refilled?.status === 'set', refillErr?.message ?? JSON.stringify(refilled));

    const { error: pairNow } = await rpc(u.client, 'pair_in_group',
      { p_group_id: g, p_other_user_id: partner2.id, p_previous_match_id: null });
    expect('and pairing works again', !pairNow, pairNow?.message ?? '');

    const outsider3 = await mkUserWithAsset('asset-outsider', { plan: 'bloom' });
    const { error: noSeat } = await rpc(outsider3.client, 'set_group_asset',
      { p_group_id: g, p_asset_id: outsider3.assetId, p_acting_user_id: null });
    expect('someone with no seat cannot set an asset on one',
      !!noSeat && /no seat in this group/i.test(noSeat.message), noSeat?.message ?? 'succeeded');
  }

  console.log('\n[ownership succession]');
  {
    const o = await mkUserWithAsset('succ-owner', { plan: 'bloom' });
    const m = await mkUserWithAsset('succ-member', { plan: 'bloom' });
    const g = await newGroup(o, { visibility: 'open', name: `Succession ${rand}` });
    await rpc(m.client, 'join_group', { p_group_id: g, p_asset_id: m.assetId, p_acting_user_id: null });

    const { data: left } = await rpc(o.client, 'leave_group', { p_group_id: g, p_acting_user_id: null });
    expect('an owner who leaves hands the room to the longest-standing member',
      left?.new_owner_user_id === m.id && left?.group_closed === false, JSON.stringify(left));
    const { data: now } = await admin.from('group_members').select('role').eq('group_id', g).eq('user_id', m.id).single();
    expect('and that member is the owner', now?.role === 'owner', JSON.stringify(now));

    const { data: lastOut } = await rpc(m.client, 'leave_group', { p_group_id: g, p_acting_user_id: null });
    expect('the last member leaving closes the group rather than orphaning it',
      lastOut?.group_closed === true, JSON.stringify(lastOut));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[the act-as path D3 needs]');
  {
    const botUser = await mkUserWithAsset('act-as', { plan: 'bloom' });
    const victim = await mkUserWithAsset('act-as-victim', { plan: 'bloom' });

    const { error: impersonate } = await rpc(botUser.client, 'create_group', {
      p_name: 'Impersonated', p_asset_id: victim.assetId, p_kind: 'feedback',
      p_track: null, p_visibility: 'private', p_max_members: null, p_acting_user_id: victim.id,
    });
    expect('a member cannot pass someone else as p_acting_user_id',
      !!impersonate && /cannot act on behalf/i.test(impersonate.message), impersonate?.message ?? 'succeeded');

    const { data: own, error: ownErr } = await rpc(botUser.client, 'my_groups', { p_acting_user_id: botUser.id });
    expect('passing their own id is simply a no-op', !ownErr && Array.isArray(own), ownErr?.message ?? '');

    const { data: asService, error: svcErr } = await admin.rpc('create_group', {
      p_name: `Bot group ${rand}`, p_asset_id: botUser.assetId, p_kind: 'feedback',
      p_track: null, p_visibility: 'private', p_max_members: null, p_acting_user_id: botUser.id,
    });
    if (asService?.group_id) tempGroupIds.push(asService.group_id);
    expect('the service role can act for a member (this is how D3 calls these)',
      !svcErr && asService?.status === 'created', svcErr?.message ?? JSON.stringify(asService));
    const { data: botSeat } = await admin.from('group_members')
      .select('user_id, role').eq('group_id', asService?.group_id ?? '00000000-0000-0000-0000-000000000000').single();
    expect('and the seat belongs to the member, not to the bot',
      botSeat?.user_id === botUser.id && botSeat?.role === 'owner', JSON.stringify(botSeat));

    const { error: unnamed } = await admin.rpc('my_groups', { p_acting_user_id: null });
    expect('a service-role call that names nobody is refused',
      !!unnamed && /must name the member/i.test(unnamed.message), unnamed?.message ?? 'succeeded');

    const { error: memberRoom } = await rpc(botUser.client, 'set_group_discord_ids',
      { p_group_id: asService?.group_id, p_thread_id: '123', p_channel_id: null });
    expect('a member cannot point a group at a Discord thread',
      !!memberRoom && /only the bot or an admin/i.test(memberRoom.message), memberRoom?.message ?? 'succeeded');

    const { data: recorded } = await admin.rpc('set_group_discord_ids',
      { p_group_id: asService?.group_id, p_thread_id: `thread-${rand}`, p_channel_id: null });
    const { data: threadRow } = await admin.from('groups')
      .select('discord_thread_id').eq('id', asService?.group_id).single();
    expect('the bot can', threadRow?.discord_thread_id === `thread-${rand}`,
      `${JSON.stringify(recorded)} ${JSON.stringify(threadRow)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[wiring]');
  {
    const data = readFileSync(new URL('./src/lib/fivestarz/data.js', import.meta.url), 'utf8');
    for (const fn of ['createGroup', 'inviteToGroup', 'joinGroup', 'respondToGroupInvite',
      'reviewGroupJoinRequest', 'leaveGroup', 'closeGroup', 'recommendGroupMembers',
      'listMyGroups', 'listDiscoverableGroups', 'getGroupRoster', 'pairInGroup', 'setMemberTrack', 'setGroupAsset']) {
      expect(`data.js exports ${fn}`, data.includes(`export async function ${fn}(`));
    }

    const port = readFileSync(new URL('./src/lib/community/port.js', import.meta.url), 'utf8');
    expect('port.js now requires the four D2 operations',
      ['createGroup', 'inviteMember', 'joinGroup', 'recommendMembers']
        .every((op) => new RegExp(`"${op}"`).test(port)));

    const adapter = readFileSync(new URL('./src/lib/community/proofsignals/adapter.js', import.meta.url), 'utf8');
    expect('the ProofSignals adapter implements them',
      ['createGroup', 'inviteMember', 'joinGroup', 'recommendMembers']
        .every((op) => adapter.includes(`async ${op}(`)));
    expect('and passes p_acting_user_id, because a bot has no auth.uid()',
      adapter.includes('p_acting_user_id: userId'));

    const dash = readFileSync(new URL('./src/components/fivestarz/DashboardPage.jsx', import.meta.url), 'utf8');
    expect('the dashboard has a Groups tab', dash.includes('"groups"') && dash.includes('GroupsTab'));

    const tab = readFileSync(new URL('./src/components/fivestarz/GroupsTab.jsx', import.meta.url), 'utf8');
    expect('the tab offers create, recommend, invite, join and close',
      ['createGroup', 'recommendGroupMembers', 'inviteToGroup', 'joinGroup', 'closeGroup']
        .every((fn) => tab.includes(fn)));
    expect('and says that a group pairing does not spend match quota',
      /does not count against your monthly match quota/i.test(tab));

    const account = readFileSync(new URL('./src/app/account/page.jsx', import.meta.url), 'utf8');
    expect('the Track picker is on /account, not behind the archived matching surface',
      account.includes('TrackCard'));
    const prefs = readFileSync(new URL('./src/app/account/preferences/page.jsx', import.meta.url), 'utf8');
    expect('/account/preferences still redirects on the Discord surface (why the Track is not there)',
      prefs.includes('MATCH_SURFACE_WEB') && prefs.includes('redirect'));
  }

  console.log('\n[the two seams still hold]');
  {
    const discordTree = readTree('src/lib/discord');
    const communityTree = readTree('src/lib/community');

    const botTouchesDb = Object.entries(discordTree).filter(
      ([, src]) => /from\s+["']@supabase\//.test(src) || /from\s+["']@\/lib\/supabase/.test(src)
        || /from\s+["']@\/lib\/community\/proofsignals/.test(src),
    );
    expect('no file under src/lib/discord imports Supabase or the adapter',
      botTouchesDb.length === 0, botTouchesDb.map(([f]) => f).join(', '));

    const rulesTouchDiscord = Object.entries(communityTree).filter(
      ([, src]) => /from\s+["']@\/lib\/discord/.test(src),
    );
    expect('no file under src/lib/community imports Discord',
      rulesTouchDiscord.length === 0, rulesTouchDiscord.map(([f]) => f).join(', '));
  }
} catch (err) {
  bad('harness', err.stack ?? err.message);
} finally {
  // The gate is shared live configuration. If anything above threw while it
  // was flipped, put it back before anything else.
  if (gateFlipped) {
    const restored = await setSurface('web');
    console.log(restored.ok ? '\n  (match_surface restored to web)' : `\n  !! match_surface LEFT AT discord: ${restored.body}`);
  }
  // Users first: that cascades their matches, which is what frees the groups
  // from matches.in_group_id ON DELETE RESTRICT.
  //
  // Reported rather than swallowed. deleteUser resolves with { error } instead
  // of throwing, so an earlier `.catch(() => {})` here silently left 27 test
  // accounts and nine orphaned groups in the live database across three runs.
  const residue = [];
  for (const id of tempUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) residue.push(`user ${id}: ${error.message}`);
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
