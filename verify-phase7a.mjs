// Live verification for Phase 7a — blocklist + automated flagging on write.
// Creates a temp user, exercises the moderated write RPCs as that authenticated
// user, asserts block/flag/clean behaviour + moderation_flags side effects,
// then deletes the temp user (cascade cleans assets + flags).
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

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
const ok = (name) => { passed++; console.log(`  ✓ ${name}`); };
const bad = (name, detail) => { failed++; console.log(`  ✗ ${name}\n      ${detail}`); };
function expect(name, cond, detail = '') { cond ? ok(name) : bad(name, detail); }

const rand = process.pid.toString(36) + '-' + process.ppid.toString(36);
const email = `verify7a-${rand}@example.com`;
const password = 'Verify7a!' + rand;
let userId = null;

try {
  // ── temp user (trigger creates user_profiles) ──────────────────────────
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (cErr) throw new Error('createUser: ' + cErr.message);
  userId = created.user.id;
  console.log(`temp user ${email} (${userId})`);

  // authenticated client (auth.uid() = userId)
  const user = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await user.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error('signIn: ' + sErr.message);

  const flagsFor = async () => {
    const { data } = await admin
      .from('moderation_flags')
      .select('*')
      .eq('content_owner_user_id', userId)
      .order('created_at', { ascending: true });
    return data ?? [];
  };

  console.log('\n[scanner via authenticated .rpc]');
  {
    const { data: b } = await user.rpc('scan_text_for_blocked_phrases', { p_text: 'go kys now' });
    expect('scan blocks a block phrase', b === 'block', `got ${b}`);
    const { data: f } = await user.rpc('scan_text_for_blocked_phrases', { p_text: 'free money here' });
    expect('scan flags a flag phrase', f === 'flag', `got ${f}`);
    const { data: c } = await user.rpc('scan_text_for_blocked_phrases', { p_text: 'lovely portfolio' });
    expect('scan passes clean text', c === null, `got ${c}`);
  }

  console.log('\n[update_my_profile]');
  {
    const before = (await flagsFor()).length;

    const { error: blockErr } = await user.rpc('update_my_profile', { p_bio: 'you should kill yourself' });
    expect('block phrase rejects the write', !!blockErr && /prohibited language/.test(blockErr.message),
      `err=${blockErr && blockErr.message}`);
    expect('rejected write created no flag', (await flagsFor()).length === before, 'flag count changed');

    const { error: flagErr } = await user.rpc('update_my_profile', { p_bio: 'dm me for a crypto giveaway' });
    expect('flag phrase allows the write', !flagErr, `err=${flagErr && flagErr.message}`);
    const afterFlag = await flagsFor();
    const pf = afterFlag.find((r) => r.content_type === 'profile_bio');
    expect('flagged write created a profile_bio flag', !!pf, 'no profile_bio flag row');
    expect('auto flag is system (reporter null)', pf && pf.reporter_user_id === null, `reporter=${pf && pf.reporter_user_id}`);
    expect('auto flag status pending', pf && pf.status === 'pending', `status=${pf && pf.status}`);
    expect('auto flag severity flag', pf && pf.auto_severity === 'flag', `sev=${pf && pf.auto_severity}`);
    expect('flag content_id is the user id', pf && pf.content_id === userId, `content_id=${pf && pf.content_id}`);

    const countBeforeClean = (await flagsFor()).length;
    const { error: cleanErr } = await user.rpc('update_my_profile', { p_bio: 'seasoned product designer, 10y' });
    expect('clean write succeeds', !cleanErr, `err=${cleanErr && cleanErr.message}`);
    expect('clean write created no flag', (await flagsFor()).length === countBeforeClean, 'flag count changed on clean write');

    const { data: prof } = await admin.from('user_profiles').select('bio').eq('user_id', userId).single();
    expect('bio persisted from clean write', prof && prof.bio === 'seasoned product designer, 10y', `bio=${prof && prof.bio}`);
  }

  console.log('\n[create_asset]');
  {
    const { error: blockErr } = await user.rpc('create_asset', {
      p_name: 'kys landing page', p_public_url: 'https://ex.com/a', p_asset_type: 'digital_product_saas',
    });
    expect('block phrase rejects asset create', !!blockErr && /prohibited language/.test(blockErr.message),
      `err=${blockErr && blockErr.message}`);

    const { data: assetId, error: flagErr } = await user.rpc('create_asset', {
      p_name: 'my scam-free shop', p_public_url: 'https://ex.com/b', p_asset_type: 'digital_product_saas',
      p_description: 'this is a scam',
    });
    expect('flag phrase allows asset create', !flagErr && !!assetId, `err=${flagErr && flagErr.message}`);
    const assetFlag = (await flagsFor()).find((r) => r.content_type === 'asset' && r.content_id === assetId);
    expect('flagged asset created an asset flag', !!assetFlag, 'no asset flag row');
    expect('asset auto flag is system severity flag', assetFlag && assetFlag.reporter_user_id === null && assetFlag.auto_severity === 'flag',
      `reporter=${assetFlag && assetFlag.reporter_user_id} sev=${assetFlag && assetFlag.auto_severity}`);

    // free the sprout plan's single asset slot so the clean-create isn't
    // rejected by the quota (unrelated to moderation).
    await admin.from('assets').update({ status: 'archived' }).eq('id', assetId);
    const { data: cleanAsset, error: cleanErr } = await user.rpc('create_asset', {
      p_name: 'portfolio site', p_public_url: 'https://ex.com/c', p_asset_type: 'digital_product_saas',
    });
    expect('clean asset create succeeds', !cleanErr && !!cleanAsset, `err=${cleanErr && cleanErr.message}`);
    expect('clean asset created no flag',
      !(await flagsFor()).some((r) => r.content_type === 'asset' && r.content_id === cleanAsset), 'unexpected flag');
  }

  console.log('\n[moderation_flags RLS]');
  {
    const { data: asUser } = await user.from('moderation_flags').select('id');
    expect('non-admin member cannot read the queue', (asUser ?? []).length === 0, `saw ${(asUser ?? []).length} rows`);
    const { data: asAdmin } = await admin.from('moderation_flags').select('id').eq('content_owner_user_id', userId);
    expect('service role (admin path) can read flags', (asAdmin ?? []).length >= 2, `saw ${(asAdmin ?? []).length} rows`);
  }
} catch (e) {
  bad('harness', e.message);
} finally {
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
    console.log(`\ncleaned up ${userId}`);
  }
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
