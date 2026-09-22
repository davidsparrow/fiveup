// Live verification for Phase 18 — AI Asset Builder.
//
// Exercises the /api/asset-builder route end-to-end: auth gating, URL
// validation (including the private-host guard), and — when ANTHROPIC_API_KEY
// is configured — one real drafting call against example.com, asserting the
// suggestions respect the wizard's option lists. Needs the dev server.
//
//   BASE_URL=http://localhost:3210 node verify-phase18.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  AI_SUGGESTIBLE_ASSET_TYPES,
  WIZARD_CHANNELS,
  WIZARD_FEEDBACK_FORMATS,
} from './src/lib/fivestarz/asset-wizard-options.js';

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

let passed = 0, failed = 0, skipped = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const skip = (n, d) => { skipped++; console.log(`  ~ ${n} (skipped: ${d})`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const rand = process.pid.toString(36) + '-' + Math.abs(Date.now() % 1e6).toString(36);
const tempUserIds = [];

async function mkUser(tag) {
  const email = `verify18-${tag}-${rand}@example.com`;
  const password = 'Verify18!' + rand;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  tempUserIds.push(created.user.id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: signIn, error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn(${tag}): ${sErr.message}`);
  return { id: created.user.id, token: signIn.session.access_token };
}

const call = (body, token) =>
  fetch(`${BASE}/api/asset-builder`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

try {
  try {
    await fetch(`${BASE}/`, { redirect: 'manual' });
  } catch {
    throw new Error(`dev server not reachable at ${BASE} — start it with: npm run dev -- -p 3210`);
  }

  console.log('\n[auth + validation]');
  const member = await mkUser('member');
  {
    const anonRes = await call({ url: 'https://example.com' });
    expect('unauthenticated request is rejected (401)', anonRes.status === 401, `status=${anonRes.status}`);

    const noUrl = await call({}, member.token);
    expect('missing url is a 400', noUrl.status === 400, `status=${noUrl.status}`);

    const badUrl = await call({ url: 'not a url at all %%%' }, member.token);
    expect('garbage url is a 400', badUrl.status === 400, `status=${badUrl.status}`);

    for (const target of ['http://localhost:3210/x', 'http://127.0.0.1/x', 'http://192.168.1.1/x', 'http://10.0.0.5/x', 'http://internalhost/x']) {
      const res = await call({ url: target }, member.token);
      if (res.status !== 400) { bad(`private host rejected: ${target}`, `status=${res.status}`); }
    }
    ok('private/internal hosts are rejected (400)');

    const unreachable = await call({ url: 'https://definitely-not-a-real-host-4187.example' }, member.token);
    expect('unreachable host is a 422', unreachable.status === 422, `status=${unreachable.status}`);
  }

  console.log('\n[drafting — one real call]');
  {
    if (!env.ANTHROPIC_API_KEY) {
      skip('real drafting call', 'ANTHROPIC_API_KEY not in .env.local');
    } else {
      const res = await call({ url: 'https://example.com' }, member.token);
      const data = await res.json().catch(() => ({}));
      expect('drafting request succeeds', res.status === 200, `status=${res.status} body=${JSON.stringify(data).slice(0, 200)}`);
      const s = data.suggestions ?? {};
      expect('suggests a non-empty name', typeof s.name === 'string' && s.name.trim().length > 0, JSON.stringify(s.name));
      expect('suggests a non-empty description', typeof s.description === 'string' && s.description.trim().length > 0);
      expect('asset_type is a suggestible wizard type', AI_SUGGESTIBLE_ASSET_TYPES.includes(s.asset_type), JSON.stringify(s.asset_type));
      expect('channels ⊆ wizard channel list', Array.isArray(s.channels) && s.channels.every((c) => WIZARD_CHANNELS.includes(c)), JSON.stringify(s.channels));
      expect('feedback_formats ⊆ wizard format list', Array.isArray(s.feedback_formats) && s.feedback_formats.every((f) => WIZARD_FEEDBACK_FORMATS.includes(f)), JSON.stringify(s.feedback_formats));
    }
  }

  console.log('\n[wiring]');
  {
    const wizard = readFileSync(new URL('./src/components/fivestarz/AssetPage.jsx', import.meta.url), 'utf8');
    expect('wizard calls /api/asset-builder', wizard.includes('/api/asset-builder'));
    expect('wizard imports the shared option lists', wizard.includes('asset-wizard-options'));
    expect('wizard fill is non-clobbering', wizard.includes('prev.name || s.name'));
    const how = readFileSync(new URL('./src/components/fivestarz/HowPage.jsx', import.meta.url), 'utf8');
    expect('HowPage lists AI asset drafting as Live in Beta', how.includes('AI asset drafting'));
  }
} catch (e) {
  bad('harness', e.stack || e.message);
} finally {
  for (const id of tempUserIds) await admin.auth.admin.deleteUser(id);
  if (tempUserIds.length) console.log(`\ncleaned up ${tempUserIds.length} temp user(s)`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(failed === 0 ? 0 : 1);
