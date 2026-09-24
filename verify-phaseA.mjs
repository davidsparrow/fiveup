// Verification for Phase A — shelve and switch (Discord refactor).
//
// No DB, no dev server. Asserts composition, wiring and source-level
// invariants: the Proof Lab → Proof Market rename and redirect, the archive
// folder's import discipline, the match_surface gate in the two RPCs, the
// gated routes, and the email-sender move. The restore flip (set the gate
// to 'web' on a preview deploy) is a manual check recorded in
// docs/archive/web-matching.md.
//
//   node verify-phaseA.mjs

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const root = new URL('.', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const exists = (p) => existsSync(join(root, p));

function walk(dir, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(jsx?|tsx?|mjs)$/.test(name)) out.push(rel);
  }
  return out;
}

const MIGRATION = 'supabase/migrations/20260925120000_phaseA_match_surface_gate.sql';
const GUARD = "raise exception 'matching is handled in Discord'";
const GUARD_COND = "public.match_surface() = 'web' or auth.role() = 'service_role' or public.is_admin()";

console.log('\n[A4 — Proof Market rename + redirect]');
{
  expect('src/app/proof-market/page.jsx exists', exists('src/app/proof-market/page.jsx'));
  expect('old route folder holds only the redirect', exists('src/app/proof-lab/page.jsx') && readdirSync(join(root, 'src/app/proof-lab')).length === 1);
  const redirect = exists('src/app/proof-lab/page.jsx') ? read('src/app/proof-lab/page.jsx') : '';
  expect('redirect is permanent and targets /proof-market', /permanentRedirect\(["']\/proof-market["']\)/.test(redirect));
  expect('renamed components exist', exists('src/components/fivestarz/ProofMarketPage.jsx') && exists('src/components/fivestarz/ProofMarketTeaser.jsx'));
  expect('old component files are gone', !exists('src/components/fivestarz/ProofLabPage.jsx') && !exists('src/components/fivestarz/ProofLabTeaser.jsx'));

  const offenders = [];
  for (const f of [...walk('src/components'), ...walk('src/app')]) {
    if (f === 'src/app/proof-lab/page.jsx') continue; // the redirect may name the old label in its comment
    const src = read(f);
    if (src.includes('Proof Lab')) offenders.push(`${f}: "Proof Lab"`);
    const routeHits = src.replace(/\/api\/proof-lab/g, '').match(/\/proof-lab/g);
    if (routeHits) offenders.push(`${f}: "/proof-lab" route reference`);
  }
  expect('no remaining "Proof Lab" strings or /proof-lab links in src/components + src/app', offenders.length === 0, offenders.join('; '));
  expect('internal API route path kept (src/app/api/proof-lab/notify-seller)', exists('src/app/api/proof-lab/notify-seller/route.js'));
  expect('sitemap lists /proof-market', read('src/app/sitemap.js').includes('"/proof-market"') && !read('src/app/sitemap.js').includes('"/proof-lab"'));
  expect('notify-seller email copy says Proof Market', /New Proof Market deal request/.test(read('src/app/api/proof-lab/notify-seller/route.js')));
  expect('moderation email labels say Proof Market', /proof_lab_listing:\s*"Proof Market listing"/.test(read('src/lib/fivestarz/moderation-email.js')));
  expect('proof_lab_* table/RPC identifiers are untouched in data.js', /from\("proof_lab_listings"\)/.test(read('src/lib/fivestarz/data.js')) && /rpc\("create_proof_lab_listing"/.test(read('src/lib/fivestarz/data.js')));
}

console.log('\n[A3 — archive folder + import discipline]');
{
  for (const f of ['BrowsePage.jsx', 'MatchPreferencesPage.jsx', 'MatchActions.jsx']) {
    expect(`src/archive/web-matching/${f} exists`, exists(`src/archive/web-matching/${f}`));
  }
  expect('archived pages are no longer under src/components', !exists('src/components/fivestarz/BrowsePage.jsx') && !exists('src/components/fivestarz/MatchPreferencesPage.jsx'));

  const allowed = new Set(['src/app/browse/page.jsx', 'src/app/account/preferences/page.jsx', 'src/app/dashboard/page.jsx']);
  const importers = walk('src').filter((f) => !f.startsWith('src/archive/') && /from ["'](@\/archive\/web-matching|\.\.?\/.*archive\/web-matching)/.test(read(f)));
  const stray = importers.filter((f) => !allowed.has(f));
  expect('archive folder is imported only by the gated routes', stray.length === 0 && importers.length === allowed.size, `importers: ${importers.join(', ')}`);
  expect('DashboardPage component does not import the archive directly', !read('src/components/fivestarz/DashboardPage.jsx').includes('archive/web-matching'));

  const data = read('src/lib/fivestarz/data.js');
  for (const fn of ['getBrowseQuota', 'getEligibleCandidates', 'requestMatch']) {
    const idx = data.indexOf(`export async function ${fn}(`);
    const before = idx === -1 ? '' : data.slice(Math.max(0, idx - 140), idx);
    expect(`${fn} kept and marked ARCHIVED`, idx !== -1 && /\/\/ ARCHIVED: web matching surface/.test(before));
  }
  expect('getMatchSurface calls the match_surface RPC', /export async function getMatchSurface\(/.test(data) && /rpc\("match_surface"\)/.test(data));
}

console.log('\n[A2 — migration: gate row, RPC guard, source convention]');
{
  expect('migration file exists', exists(MIGRATION));
  const sql = exists(MIGRATION) ? read(MIGRATION) : '';
  for (const plan of ['sprout', 'bloom', 'flourish']) {
    expect(`seeds match_surface for ${plan} as discord`, new RegExp(`\\('${plan}',\\s*'match_surface'[^\\n]*"surface":"discord"`).test(sql));
  }
  expect('seed never overwrites an existing row (on conflict do nothing)', /on conflict \(plan_code, feature_key\) do nothing/.test(sql));
  expect('match_surface() is stable security definer with search_path', /create or replace function public\.match_surface\(\)[\s\S]*?stable[\s\S]*?security definer[\s\S]*?set search_path = public/.test(sql));
  expect("match_surface() falls back to 'web'", /\), 'web'\);/.test(sql));
  expect('match_surface() granted to anon + authenticated', /grant execute on function public\.match_surface\(\) to anon, authenticated/.test(sql));

  const fnBody = (name) => {
    const start = sql.indexOf(`create or replace function public.${name}(`);
    if (start === -1) return null;
    const end = sql.indexOf('\n$$;', start);
    return sql.slice(start, end);
  };
  for (const name of ['create_match', 'eligible_match_candidates']) {
    const body = fnBody(name);
    expect(`${name} is re-created in place`, body !== null);
    if (!body) continue;
    expect(`${name} carries the guard text`, body.includes(GUARD) && body.includes(GUARD_COND));
    const beginIdx = body.indexOf('\nbegin\n');
    const guardIdx = body.indexOf(GUARD_COND);
    const authIdx = body.indexOf("raise exception 'authentication required'");
    expect(`${name} guard is the first statement`, beginIdx !== -1 && guardIdx > beginIdx && guardIdx < authIdx, `begin@${beginIdx} guard@${guardIdx} auth@${authIdx}`);
    expect(`${name} keeps security definer + search_path`, /security definer/.test(body) && /set search_path = public/.test(body));
  }
  expect("create_match still refuses member sources other than browse/queued", /p_source not in \('browse', 'queued'\)/.test(sql));
  expect("matches.source check now allows 'discord'", /check \(source in \('auto', 'browse', 'queued', 'discord'\)\)/.test(sql));
  expect('source convention documented in header', /'discord' — created by the Discord bot/.test(sql));
  expect('no table drops', !/drop table/i.test(sql));
}

console.log('\n[A3 — gated routes + nav]');
{
  const helper = read('src/lib/fivestarz/match-surface.js');
  expect('helper reads NEXT_PUBLIC_DISCORD_INVITE_URL with an internal fallback', /NEXT_PUBLIC_DISCORD_INVITE_URL/.test(helper) && /\|\| "\/dashboard"/.test(helper));
  expect('helper fails open to web on RPC error', /return MATCH_SURFACE_WEB;/.test(helper) && /catch/.test(helper));

  for (const route of ['src/app/browse/page.jsx', 'src/app/account/preferences/page.jsx']) {
    const src = read(route);
    expect(`${route} resolves the gate before rendering`, /resolveMatchSurface\(supabase\)/.test(src));
    expect(`${route} redirects to the Discord invite when not web`, /surface !== MATCH_SURFACE_WEB/.test(src) && /redirect\(getDiscordInviteUrl\(\)\)/.test(src));
    expect(`${route} still renders the archived component on web`, /@\/archive\/web-matching\//.test(src) && /<PageShell>/.test(src));
  }
  const dash = read('src/app/dashboard/page.jsx');
  expect('dashboard route passes the archived MatchActions only on web', /surface === MATCH_SURFACE_WEB \? <MatchActions \/> : null/.test(dash));
  const dashPage = read('src/components/fivestarz/DashboardPage.jsx');
  expect('DashboardPage keeps the feedback / post / rating flow', /<FeedbackModal/.test(dashPage) && /<PostModal/.test(dashPage) && /<RateFeedbackWidget/.test(dashPage));
  expect('DashboardPage shows a Discord notice when the surface is not web', /matchSurface !== "web"/.test(dashPage) && /Discord/.test(dashPage));

  const shell = read('src/components/fivestarz/PageShell.jsx');
  expect('PageShell provides the surface via useMatchSurface', /export function useMatchSurface/.test(shell) && /getMatchSurface\(createClient\(\)\)/.test(shell));
  const nav = read('src/components/fivestarz/SiteNav.jsx');
  expect('SiteNav hides Browse Members unless surface is web', /webMatchingOnly/.test(nav) && /matchSurface === "web"/.test(nav) && /useMatchSurface\(\)/.test(nav));
  const footer = read('src/components/fivestarz/Footer.jsx');
  expect('Footer hides Browse Members unless surface is web', /webMatchingOnly/.test(footer) && /matchSurface === "web"/.test(footer));
}

console.log('\n[Section 4 — email sender]');
{
  const files = ['src/app/api/proof-lab/notify-seller/route.js', 'src/lib/fivestarz/moderation-email.js', 'src/app/api/beta-signup/route.js'];
  for (const f of files) {
    expect(`${f} uses RESEND_FROM with the ProofSignals default`, /process\.env\.RESEND_FROM \?\? "ProofSignals <noreply@notify\.indieops\.co>"/.test(read(f)));
  }
  const leftovers = walk('src').filter((f) => read(f).includes('bendersaas.ai'));
  expect('no hard-coded bendersaas.ai sender left in src', leftovers.length === 0, leftovers.join(', '));
  expect('.env.example documents RESEND_FROM and the Discord invite', exists('.env.example') && /RESEND_FROM=/.test(read('.env.example')) && /NEXT_PUBLIC_DISCORD_INVITE_URL=/.test(read('.env.example')));
}

console.log('\n[docs]');
{
  expect('docs/archive/web-matching.md documents the restore', exists('docs/archive/web-matching.md') && /match_surface/.test(read('docs/archive/web-matching.md')) && /"surface":"web"/.test(read('docs/archive/web-matching.md')));
  expect('docs/fiveup-continuation-phaseA.md exists', exists('docs/fiveup-continuation-phaseA.md'));
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
