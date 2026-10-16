// Live verification for Phase 20 / Discord D1 — member identities.
//
// Asserts both roads into one row and every rule that guards them: the bot
// is the only caller that can mint a link code, the member is the only
// caller that can redeem one, a snowflake belongs to exactly one member and
// keeps belonging to them across an unlink, the OAuth road reads the id out
// of auth.identities rather than client input, the Ed25519 verification
// accepts only what Discord could have signed, and the two architectural
// seams hold.
//
//   node verify-phase20.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

import {
  LINK_CODE_ALPHABET,
  LINK_CODE_LENGTH,
  formatLinkCode,
  isWellFormedLinkCode,
  normalizeLinkCode,
} from './src/lib/community/rules/link-codes.js';
import { verifyDiscordRequest } from './src/lib/discord/verify.js';

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
const snowflakes = [];

async function mkUser(tag, plan = 'bloom') {
  const email = `verify20-${tag}-${rand}@example.com`;
  const password = 'Verify20!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = created.user.id;
  tempUserIds.push(id);
  await admin.from('user_profiles').update({ plan_code: plan }).eq('user_id', id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn(${tag}): ${sErr.message}`);
  return { id, email, client };
}

// The OAuth road reads auth.identities, which PostgREST does not expose. The
// Management API is the same path the migrations take.
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`management api ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

// auth.identities gained a NOT NULL provider_id in later Supabase versions;
// build the insert around whichever shape this project has.
async function attachDiscordIdentity(userId, sub, username) {
  await sql(`
    do $$
    declare v_has_provider_id boolean;
    begin
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
      ) into v_has_provider_id;

      if v_has_provider_id then
        execute format(
          'insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
           values (gen_random_uuid(), %L, %L, %L::jsonb, %L, now(), now())',
          ${lit(sub)}, ${lit(userId)}, ${lit(JSON.stringify({ sub, provider_id: sub, user_name: username, name: username, email: 'd@example.com' }))}, 'discord');
      else
        execute format(
          'insert into auth.identities (id, user_id, identity_data, provider, created_at, updated_at)
           values (gen_random_uuid(), %L, %L::jsonb, %L, now(), now())',
          ${lit(userId)}, ${lit(JSON.stringify({ sub, provider_id: sub, user_name: username, name: username, email: 'd@example.com' }))}, 'discord');
      end if;
    end $$;
  `);
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const newSnowflake = () => {
  const id = String(10n ** 17n + BigInt(Math.floor(Math.random() * 1e15)));
  snowflakes.push(id);
  return id;
};

const identityRow = async (userId) =>
  (await admin.from('member_identities').select('*').eq('user_id', userId).eq('provider', 'discord').maybeSingle()).data;

const issue = (externalId, handle = 'tester') =>
  admin.rpc('issue_member_link_code', { p_provider: 'discord', p_external_id: externalId, p_external_handle: handle });

// Walk a source tree and return every file's text, keyed by path.
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

try {
  console.log('\n[schema]');
  {
    const { error: identities } = await admin.from('member_identities').select('id').limit(1);
    expect('member_identities exists', !identities, identities?.message ?? '');

    const { error: codes } = await admin.from('member_link_codes').select('id').limit(1);
    expect('member_link_codes exists', !codes, codes?.message ?? '');
  }

  console.log('\n[code shape — SQL and JS agree]');
  {
    const messy = ['fp3k-9h2m', 'FP3K 9H2M', ' fp3k9h2m ', 'oil11111', 'AbCd-EfGh', 'x'];
    const rows = await sql(
      `select raw, public.normalize_member_link_code(raw) as normalized
       from (values ${messy.map((m) => `(${lit(m)})`).join(',')}) as t(raw)`
    );
    const disagreements = rows.filter((r) => (r.normalized ?? null) !== normalizeLinkCode(r.raw));
    expect('normalisation matches the JS rules on messy input', disagreements.length === 0,
      JSON.stringify(disagreements));

    expect('alphabet excludes I, L, O and U', !/[ILOU]/.test(LINK_CODE_ALPHABET), LINK_CODE_ALPHABET);
    expect('a typed O reads as 0 and I/L as 1', normalizeLinkCode('oil') === '011', normalizeLinkCode('oil'));
    expect('formatLinkCode splits in half', formatLinkCode('FP3K9H2M') === 'FP3K-9H2M', formatLinkCode('FP3K9H2M'));
    expect('a 7-character code is not well formed', !isWellFormedLinkCode('FP3K9H2'), 'accepted');
  }

  console.log('\n[road 2 — the bot issues, the member redeems]');
  const a = await mkUser('a');
  const snowA = newSnowflake();
  let codeA;
  {
    const { error } = await a.client.rpc('issue_member_link_code', {
      p_provider: 'discord', p_external_id: snowA, p_external_handle: 'impostor',
    });
    expect('a member cannot mint a link code', !!error && /bot only/i.test(error.message),
      error?.message ?? 'succeeded');

    const { data, error: iErr } = await issue(snowA, 'tester_a');
    expect('the service role can issue one', !iErr && data?.status === 'issued', iErr?.message ?? JSON.stringify(data));
    codeA = data?.code;
    expect(`issued code is ${LINK_CODE_LENGTH} characters of the agreed alphabet`,
      isWellFormedLinkCode(codeA), String(codeA));
  }

  {
    const { data, error } = await a.client.rpc('redeem_member_link_code', { p_code: formatLinkCode(codeA) });
    expect('the member redeems it (formatted, with the dash)', !error && data?.status === 'linked',
      error?.message ?? JSON.stringify(data));

    const row = await identityRow(a.id);
    expect('row records the snowflake and the handle',
      row?.external_id === snowA && row?.handle === 'tester_a', JSON.stringify(row));
    expect("linked_via is 'code'", row?.linked_via === 'code', row?.linked_via);
    expect('role_granted_at starts null', row?.role_granted_at === null, String(row?.role_granted_at));

    const { error: again } = await a.client.rpc('redeem_member_link_code', { p_code: codeA });
    expect('a code works once', !!again && /not valid or has expired/i.test(again.message),
      again?.message ?? 'succeeded twice');
  }

  console.log('\n[code hygiene]');
  {
    const snowB = newSnowflake();
    const { data: first } = await issue(snowB);
    const { data: second } = await issue(snowB);
    expect('issuing again invalidates the previous code', first.code !== second.code, 'same code reissued');

    const b = await mkUser('b');
    const { error: stale } = await b.client.rpc('redeem_member_link_code', { p_code: first.code });
    expect('the superseded code is dead', !!stale && /not valid or has expired/i.test(stale.message),
      stale?.message ?? 'succeeded');

    await admin.from('member_link_codes').update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('code', second.code);
    const { error: expired } = await b.client.rpc('redeem_member_link_code', { p_code: second.code });
    expect('an expired code is refused', !!expired && /not valid or has expired/i.test(expired.message),
      expired?.message ?? 'succeeded');

    const { error: unknown } = await b.client.rpc('redeem_member_link_code', { p_code: 'ZZZZZZZZ' });
    expect('an unknown code gives the same message as an expired one',
      !!unknown && /not valid or has expired/i.test(unknown.message), unknown?.message ?? 'succeeded');
  }

  console.log('\n[one snowflake, one member]');
  {
    const c = await mkUser('c');
    const { data: forA } = await issue(snowA);
    expect('issuing against a linked snowflake reports it rather than minting',
      forA?.status === 'already_linked' && forA?.user_id === a.id, JSON.stringify(forA));

    // Force a code against the already-linked snowflake to prove redemption
    // refuses it even when a code exists.
    const forced = 'VERFY123';
    await admin.from('member_link_codes').insert({
      code: forced, provider: 'discord', external_id: snowA,
      expires_at: new Date(Date.now() + 600000).toISOString(),
    });
    const { error } = await c.client.rpc('redeem_member_link_code', { p_code: forced });
    expect('another member cannot claim a linked Discord account',
      !!error && /already linked to another/i.test(error.message), error?.message ?? 'succeeded');
    await admin.from('member_link_codes').delete().eq('code', forced);

    const otherSnow = newSnowflake();
    const { data: codeForA } = await issue(otherSnow);
    const { error: twoAccounts } = await a.client.rpc('redeem_member_link_code', { p_code: codeForA.code });
    expect('a member cannot hold two Discord accounts',
      !!twoAccounts && /already linked to a different/i.test(twoAccounts.message),
      twoAccounts?.message ?? 'succeeded');
  }

  console.log('\n[road 1 — OAuth, id read from auth.identities]');
  const d = await mkUser('d');
  const snowD = newSnowflake();
  {
    const { error } = await d.client.rpc('link_discord_from_auth_identity');
    expect('refused when no Discord identity is attached',
      !!error && /no Discord identity/i.test(error.message), error?.message ?? 'succeeded');

    await attachDiscordIdentity(d.id, snowD, 'tester_d');
    const { data, error: linkErr } = await d.client.rpc('link_discord_from_auth_identity');
    expect('links once the provider has attached one', !linkErr && data?.status === 'linked',
      linkErr?.message ?? JSON.stringify(data));
    expect('external_id came from the identity, not the caller', data?.external_id === snowD,
      `${data?.external_id} vs ${snowD}`);

    const row = await identityRow(d.id);
    expect("linked_via is 'oauth'", row?.linked_via === 'oauth', row?.linked_via);
    expect('handle read off the identity', row?.handle === 'tester_d', String(row?.handle));

    const { error: idempotent } = await d.client.rpc('link_discord_from_auth_identity');
    expect('re-running it is idempotent', !idempotent, idempotent?.message ?? '');
  }

  {
    // Supabase's own unique (provider_id, provider) stops one Discord
    // identity attaching to two auth users, so the reachable collision is
    // the cross-road one: linked by code, then OAuthed by someone else.
    const codeHolder = await mkUser('e1');
    const oauthClaimer = await mkUser('e2');
    const snowE = newSnowflake();

    const { data: codeForHolder } = await issue(snowE, 'tester_e');
    await codeHolder.client.rpc('redeem_member_link_code', { p_code: codeForHolder.code });

    await attachDiscordIdentity(oauthClaimer.id, snowE, 'tester_e');
    const { error } = await oauthClaimer.client.rpc('link_discord_from_auth_identity');
    expect('a snowflake linked by code cannot be claimed through OAuth',
      !!error && /already linked to another/i.test(error.message), error?.message ?? 'succeeded');
  }

  console.log('\n[the bot’s lookups]');
  {
    const { error } = await a.client.rpc('member_for_external_identity', {
      p_provider: 'discord', p_external_id: snowA,
    });
    expect('a member cannot look up an identity', !!error && /bot only/i.test(error.message),
      error?.message ?? 'succeeded');

    const { data, error: svcErr } = await admin.rpc('member_for_external_identity', {
      p_provider: 'discord', p_external_id: snowA,
    });
    expect('the service role resolves snowflake → member',
      !svcErr && data?.status === 'linked' && data?.user_id === a.id, svcErr?.message ?? JSON.stringify(data));
    expect('lookup carries the plan and account status',
      data?.plan_code === 'bloom' && data?.account_status === 'active', JSON.stringify(data));

    const { data: miss } = await admin.rpc('member_for_external_identity', {
      p_provider: 'discord', p_external_id: '999999999999999999',
    });
    expect('an unknown snowflake reads as unlinked', miss?.status === 'unlinked', JSON.stringify(miss));
  }

  console.log('\n[role grants are recorded]');
  {
    const { error } = await a.client.rpc('mark_member_role_granted', {
      p_provider: 'discord', p_external_id: snowA,
    });
    expect('the member can record their own grant', !error, error?.message ?? '');
    expect('role_granted_at is set', !!(await identityRow(a.id))?.role_granted_at);

    const { error: other } = await d.client.rpc('mark_member_role_granted', {
      p_provider: 'discord', p_external_id: snowA,
    });
    expect('a member cannot record a grant on someone else’s identity',
      !!other && /no linked identity/i.test(other.message), other?.message ?? 'succeeded');
  }

  console.log('\n[unlink keeps the claim]');
  {
    const { error } = await a.client.rpc('unlink_member_identity', { p_provider: 'discord' });
    expect('a member can unlink', !error, error?.message ?? '');

    const row = await identityRow(a.id);
    expect("status becomes 'unlinked'", row?.status === 'unlinked', row?.status);
    expect('the row survives', !!row?.id);
    expect('unlinked_at is set and role_granted_at cleared',
      !!row?.unlinked_at && row?.role_granted_at === null, JSON.stringify(row));

    const { error: twice } = await a.client.rpc('unlink_member_identity', { p_provider: 'discord' });
    expect('unlinking twice raises', !!twice && /no linked/i.test(twice.message), twice?.message ?? 'succeeded');

    const f = await mkUser('f');
    const { data: codeForF } = await issue(snowA);
    const { error: poach } = await f.client.rpc('redeem_member_link_code', { p_code: codeForF.code });
    expect('nobody else can claim the snowflake in the gap',
      !!poach && /already linked to another/i.test(poach.message), poach?.message ?? 'succeeded');

    const { data: relink, error: relinkErr } = await a.client.rpc('redeem_member_link_code', { p_code: codeForF.code });
    expect('the original member can re-link it', !relinkErr && relink?.status === 'linked',
      relinkErr?.message ?? JSON.stringify(relink));
    expect('re-linking restores the row rather than adding one',
      (await admin.from('member_identities').select('id').eq('external_id', snowA)).data.length === 1);
  }

  console.log('\n[RLS]');
  {
    const { data: mine } = await a.client.from('member_identities').select('user_id');
    expect('a member sees only their own identity rows',
      Array.isArray(mine) && mine.length === 1 && mine[0].user_id === a.id, JSON.stringify(mine));

    const { data: codes, error } = await a.client.from('member_link_codes').select('code');
    expect('pending link codes are unreadable as a member',
      !!error || (codes ?? []).length === 0, JSON.stringify(codes));
  }

  console.log('\n[admin reassignment]');
  {
    const g = await mkUser('g');
    const { error } = await g.client.rpc('admin_reassign_member_identity', {
      p_provider: 'discord', p_external_id: snowA, p_to_user_id: g.id,
    });
    expect('a member cannot reassign an identity', !!error && /admin only/i.test(error.message),
      error?.message ?? 'succeeded');

    const { error: svc } = await admin.rpc('admin_reassign_member_identity', {
      p_provider: 'discord', p_external_id: snowA, p_to_user_id: g.id,
    });
    expect('the service role can', !svc, svc?.message ?? '');
    expect('the identity moved', (await identityRow(g.id))?.external_id === snowA);
    expect('the previous holder lost it', (await identityRow(a.id)) === null);
  }

  console.log('\n[Ed25519 verification]');
  {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    // Discord publishes the 32 raw bytes; strip the 12-byte SPKI header.
    const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
    const body = JSON.stringify({ type: 1 });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = cryptoSign(null, Buffer.from(timestamp + body, 'utf8'), privateKey).toString('hex');

    expect('a correctly signed body verifies',
      verifyDiscordRequest({ rawBody: body, signature, timestamp, publicKey: raw }) === true);
    expect('a tampered body fails',
      verifyDiscordRequest({ rawBody: body + ' ', signature, timestamp, publicKey: raw }) === false);
    expect('a replaced timestamp fails',
      verifyDiscordRequest({ rawBody: body, signature, timestamp: '1', publicKey: raw }) === false);

    const other = generateKeyPairSync('ed25519');
    const otherRaw = other.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
    expect('another key fails',
      verifyDiscordRequest({ rawBody: body, signature, timestamp, publicKey: otherRaw }) === false);

    expect('a malformed signature returns false rather than throwing',
      verifyDiscordRequest({ rawBody: body, signature: 'not-hex', timestamp, publicKey: raw }) === false);
    expect('a missing public key returns false',
      verifyDiscordRequest({ rawBody: body, signature, timestamp, publicKey: null }) === false);
  }

  console.log('\n[seams — the part that makes this extractable]');
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

    const rulesOnly = Object.entries(communityTree).filter(([f]) => f.includes('/rules/'));
    expect('the rules modules import no backend at all',
      rulesOnly.length > 0 && rulesOnly.every(([, src]) => !/@supabase|@\/lib\/supabase/.test(src)),
      rulesOnly.map(([f]) => f).join(', '));

    const route = readFileSync('src/app/api/discord/interactions/route.js', 'utf8');
    expect('the interactions route is the composition root',
      route.includes('@/lib/community/proofsignals/adapter') && route.includes('@/lib/discord/router'));
  }

  console.log('\n[wiring]');
  {
    const route = readFileSync('src/app/api/discord/interactions/route.js', 'utf8');
    expect("the endpoint pins the Node runtime", /export const runtime = "nodejs"/.test(route));
    expect('it verifies over the raw body', route.includes('await request.text()'));
    expect('it answers an unverified request with 401', /status: 401/.test(route));
    expect('it returns 503 when Discord is not configured', /status: 503/.test(route));
    expect('deferred work runs after the response', route.includes('after(async () =>'));

    const definitions = readFileSync('src/lib/discord/commands/definitions.js', 'utf8');
    expect('only /link is registered at D1',
      definitions.includes('name: "link"') && !/name: "(assist|claim|points|board)"/.test(definitions));

    const data = readFileSync('src/lib/fivestarz/data.js', 'utf8');
    expect('data.js reads member_identities through RLS',
      data.includes('export async function listMyMemberIdentities') && data.includes('member_identities'));

    const account = readFileSync('src/app/account/page.jsx', 'utf8');
    expect('/account renders the Discord card', account.includes('<DiscordLinkCard'));

    const card = readFileSync('src/components/fivestarz/DiscordLinkCard.jsx', 'utf8');
    expect('the card offers both roads',
      card.includes('linkIdentity') && card.includes('/api/discord/link'));
    expect('the card never asks for a Discord id',
      !/discord_user_id|snowflake/i.test(card));
  }
} catch (err) {
  bad('harness', err.stack ?? err.message);
} finally {
  for (const id of tempUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
  for (const snow of snowflakes) {
    try {
      await admin.from('member_link_codes').delete().eq('external_id', snow);
      await admin.from('member_identities').delete().eq('external_id', snow);
    } catch {
      // Best-effort fixture cleanup; a leftover row fails nothing.
    }
  }
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
