// Capture the /demo slideshow screenshots (public/demo/*.jpg) — Phase 12b.
//
// Recapture whenever the inner-app UI changes:
//   1. node seed-demo.mjs --password 'YourShotPw1!'
//   2. npm run dev   (port 3210)
//   3. DEMO_SEED_PASSWORD='YourShotPw1!' node capture-demo-shots.mjs
//   4. node seed-demo.mjs        # restore a pristine demo world afterwards
//
// Stages temp state via service role (an in-flight maya↔sam match so the
// "Leave Feedback" / rate / request-post UI renders, plus a temp browse
// visitor so the whole demo cast shows as candidates) and cleans it up.
//
// Gotcha: PageShell makes <body> the scroll container — window.scrollTo is a
// no-op; reset document.body.scrollTop instead.

import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env.local`, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.BASE_URL || 'http://localhost:3210';
const PASSWORD = process.env.DEMO_SEED_PASSWORD;
if (!PASSWORD) { console.error('✗ set DEMO_SEED_PASSWORD to the password used with seed-demo.mjs --password'); process.exit(1); }
const OUT = `${ROOT}/public/demo`;
mkdirSync(OUT, { recursive: true });

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const log = (m) => console.log(m);

async function handleId(handle) {
  const { data, error } = await admin.from('user_profiles').select('user_id').eq('public_username', handle).single();
  if (error) throw new Error(`${handle}: ${error.message}`);
  return data.user_id;
}
async function assetOf(userId, nameLike) {
  const { data, error } = await admin.from('assets').select('id').eq('owner_user_id', userId).ilike('name', `%${nameLike}%`).single();
  if (error) throw new Error(`asset(${nameLike}): ${error.message}`);
  return data.id;
}
async function memberClient(email) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return c;
}

// ── Stage temp state ────────────────────────────────────────────────────────
const mayaId = await handleId('demo-maya');
const samId = await handleId('demo-sam');
const mayaCourse = await assetOf(mayaId, 'Inbox Engine');
const samCoaching = await assetOf(samId, 'Founder Clarity Coaching');

// Fresh in-flight match for the story (maya ↔ sam are 2° apart, so insert the
// way the auto-matcher would rather than via create_match).
const { data: tempMatch, error: mErr } = await admin.from('matches').insert({
  member_a_user_id: mayaId, member_b_user_id: samId,
  member_a_asset_id: mayaCourse, member_b_asset_id: samCoaching,
  source: 'auto', status: 'matched', separation_degree_used: 2,
}).select('id').single();
if (mErr) throw new Error(`temp match: ${mErr.message}`);

// Sam leaves feedback first, so once Maya submits hers the rate/request-post UI shows.
const sam = await memberClient('demo-sam@proofsignals.net');
const { error: fbErr } = await sam.rpc('submit_feedback', {
  p_match_id: tempMatch.id, p_stars: 5,
  p_written_feedback: 'Took the first module over a weekend. The welcome-sequence teardown is worth the price alone — I rewrote my onboarding email mid-lesson. Module 3 could be tighter, but this is the most actionable course I have reviewed here.',
});
if (fbErr) throw new Error(`sam feedback: ${fbErr.message}`);

// Temp visitor: unconnected bloom member with one asset, so the whole demo
// cast shows up as eligible browse candidates.
const { data: visitor, error: vErr } = await admin.auth.admin.createUser({
  email: 'demo-shot-visitor@proofsignals.net', password: PASSWORD, email_confirm: true,
});
if (vErr) throw new Error(`visitor: ${vErr.message}`);
await admin.from('user_profiles').update({ plan_code: 'bloom', display_name: 'Jordan Rivera' }).eq('user_id', visitor.user.id);
const vc = await memberClient('demo-shot-visitor@proofsignals.net');
await vc.rpc('create_asset', {
  p_name: 'RevFlow — Consulting Site', p_public_url: 'https://example.com/revflow',
  p_asset_type: 'service_consulting', p_description: 'Marketing consulting for early-stage teams.',
  p_channels: ['LinkedIn'], p_feedback_formats: ['stars', 'written'],
});

// ── Shoot (1440×900 logical, 1.25 scale → 1800px-wide jpg) ─────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 });
const page = await ctx.newPage();
const scrollTop = () => page.evaluate(() => { document.body.scrollTop = 0; window.scrollTo(0, 0); });
const shot = async (name) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 });
  log(`  📸 ${name}`);
};

async function login(email) {
  await ctx.clearCookies();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL('**/account**', { timeout: 30000 }), page.click('button[type="submit"]')]);
}

try {
  // ── create-asset deck (as maya) ──
  await login('demo-maya@proofsignals.net');
  await page.goto(`${BASE}/assets/new`);
  await page.waitForLoadState('networkidle');
  const inputs = page.locator('main input[type="text"], main input:not([type])');
  await inputs.nth(0).fill('Inbox Engine — Email List Course');
  await inputs.nth(1).fill('https://example.com/inbox-engine');
  await page.getByText('Digital Product', { exact: false }).first().click();
  await page.locator('textarea').first().fill('A 6-module course for bootstrapped founders: build an email list from zero and write a welcome sequence that sells without being pushy.');
  await scrollTop();
  await shot('create-asset-01');
  await page.getByRole('button', { name: /continue/i }).first().click();
  await page.waitForTimeout(500);
  for (const ch of ['Teachable', 'Trustpilot']) {
    const el = page.getByText(ch, { exact: true }).first();
    if (await el.isVisible().catch(() => false)) await el.click();
  }
  await scrollTop();
  await shot('create-asset-02');
  await page.getByRole('button', { name: /continue/i }).first().click();
  await page.waitForTimeout(500);
  const written = page.getByText('Written Review', { exact: true }).first();
  if (await written.isVisible().catch(() => false)) await written.click();
  await scrollTop();
  await shot('create-asset-03');

  // ── matching deck ──
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState('networkidle');
  await shot('matching-02'); // maya's matches incl. the fresh match with Sam

  await login('demo-shot-visitor@proofsignals.net');
  await page.goto(`${BASE}/browse`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  const maya = page.getByText('Maya Chen', { exact: true }).first();
  if (await maya.isVisible().catch(() => false)) {
    await maya.scrollIntoViewIfNeeded();
    await page.evaluate(() => { document.body.scrollTop -= 140; });
  }
  await shot('matching-01'); // browse candidates, demo cast in view

  // ── feedback deck (as maya, fresh match with sam) ──
  await login('demo-maya@proofsignals.net');
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /leave feedback/i }).first().click();
  await page.waitForTimeout(400);
  const stars = page.locator('text=☆');
  for (let i = 0; i < 5 && (await stars.count()) > 0; i++) await stars.first().click();
  for (const b of await page.locator('button:has-text("5")').all()) { try { await b.click({ timeout: 500 }); } catch {} }
  await page.locator('textarea').last().fill('Booked a clarity session to review this properly. The weekly decision framework is the opposite of fluffy — week one forced a call I had been dodging for a month. If your to-do list runs you, start here.');
  await shot('feedback-01');
  await page.getByRole('button', { name: /submit feedback/i }).click();
  await page.waitForTimeout(1200);
  await shot('feedback-02'); // confirmation
  const done = page.getByRole('button', { name: /^done$/i }).first();
  if (await done.isVisible().catch(() => false)) await done.click();
  await page.waitForTimeout(800);

  // ── rate + request-post deck ──
  await scrollTop();
  await shot('rate-01'); // their feedback + "Rate their feedback" widget
  const reqPost = page.getByRole('button', { name: /request post/i }).first();
  if (await reqPost.isVisible().catch(() => false)) {
    await reqPost.click();
    await page.waitForTimeout(400);
    await shot('rate-02'); // PostModal: pick the channel
  }
  await page.goto(`${BASE}/account/public`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  await shot('rate-03'); // publishing settings

  // ── proof lab deck ──
  await page.goto(`${BASE}/proof-lab`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await shot('prooflab-01'); // member marketplace with demo listings

  await login('demo-priya@proofsignals.net');
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState('networkidle');
  const plTab = page.getByRole('button', { name: /proof lab/i }).first();
  if (await plTab.isVisible().catch(() => false)) { await plTab.click(); await page.waitForTimeout(2000); }
  await shot('prooflab-02'); // priya's listings dashboard
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(visitor.user.id);
  await admin.from('matches').delete().eq('id', tempMatch.id);
  log('cleaned up temp visitor + temp match — run seed-demo.mjs to restore the pristine world');
}
log('done');
