// Live verification for Phase 21b — the /pricing lander.
//
// The page's job is to feed the two Skool groups, and its caps have to be the
// numbers the database enforces rather than copy that can drift. So this
// asserts the published reader works for an anonymous visitor, exposes only
// what was whitelisted, and that the formatting rules match what the gates
// actually mean.
//
//   node verify-phase21b.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

import { capsForPlan, formatCap, indexCaps, PLAN_TIERS, getSkoolUrls } from './src/lib/fivestarz/plans.js';

const env = Object.fromEntries(
  readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

// Deliberately anonymous: almost everyone who reads a pricing page is.
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { failed++; console.log(`  ✗ ${n}\n      ${d}`); };
const expect = (n, c, d = '') => (c ? ok(n) : bad(n, d));
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

try {
  console.log('\n[the published reader, as an anonymous visitor]');
  const { data: rows, error } = await anon.rpc('public_plan_caps');
  expect('public_plan_caps is callable by anon', !error, error?.message ?? '');
  expect('and returns rows', (rows ?? []).length > 0, String((rows ?? []).length));

  {
    const plans = new Set((rows ?? []).map((r) => r.plan_code));
    expect('only sprout and bloom come back',
      plans.has('sprout') && plans.has('bloom') && !plans.has('flourish'), [...plans].join(','));

    const keys = new Set((rows ?? []).map((r) => r.feature_key));
    expect('internal switches stay private (match_surface absent)',
      !keys.has('match_surface'), 'match_surface leaked');
    expect('the published caps are present',
      keys.has('auto_matches_per_month') && keys.has('max_assets'), [...keys].join(','));
  }

  {
    // The whitelist is the only thing protecting the rest of the table, so
    // the underlying policy must still be closed to anon.
    const { data: direct } = await anon.from('plan_feature_gates').select('feature_key').limit(5);
    expect('plan_feature_gates itself is still not anon-readable',
      (direct ?? []).length === 0, `anon read ${(direct ?? []).length} gate rows directly`);
  }

  console.log('\n[caps say what the gates mean]');
  {
    const byPlan = indexCaps(rows);
    const sprout = capsForPlan(byPlan, 'sprout');
    const bloom = capsForPlan(byPlan, 'bloom');

    const find = (list, label) => list.find((c) => c.label === label)?.value;

    expect('sprout shows its real auto-match cap', find(sprout, 'Monthly auto-matches') === '4',
      find(sprout, 'Monthly auto-matches'));
    expect('bloom shows its own', find(bloom, 'Monthly auto-matches') === '6',
      find(bloom, 'Monthly auto-matches'));
    expect('a zero-limit cap reads as a dash, not 0',
      find(sprout, 'Browse & select matches') === '—', find(sprout, 'Browse & select matches'));
    expect('an enabled gate with no limit reads Unlimited',
      find(bloom, 'Channels per asset') === 'Unlimited', find(bloom, 'Channels per asset'));
    expect('a fixed degrees gate says so',
      find(sprout, 'Degrees-of-separation control') === '1° fixed',
      find(sprout, 'Degrees-of-separation control'));
    expect('an adjustable one shows the range',
      find(bloom, 'Degrees-of-separation control') === '1–3°',
      find(bloom, 'Degrees-of-separation control'));

    expect('an off switch is omitted rather than shown as a dash',
      find(sprout, 'Advisory Skills asset type') === undefined,
      String(find(sprout, 'Advisory Skills asset type')));
    expect('an on switch is a tick on the paid card',
      find(bloom, 'Advisory Skills asset type') === '✓',
      String(find(bloom, 'Advisory Skills asset type')));
    expect('the free card is not a wall of dashes',
      sprout.filter((c) => c.value === '—').length <= 2,
      `${sprout.filter((c) => c.value === '—').length} dash rows`);

    expect('unreadable gates degrade to no table, not a crash',
      capsForPlan({}, 'sprout').length === 0 && capsForPlan(null, 'bloom').length === 0);
    expect('a missing gate row renders nothing', formatCap(undefined, 'boolean') === null);
  }

  console.log('\n[the tiers are the two Skool groups]');
  {
    expect('exactly two tiers', PLAN_TIERS.length === 2, String(PLAN_TIERS.length));
    const [free, paid] = PLAN_TIERS;
    expect('sprout is the free Proof Lab',
      free.planCode === 'sprout' && free.name === 'IndieOps Proof Lab' && free.price === 'Free',
      JSON.stringify(free.name));
    expect('bloom is the paid Incubator',
      paid.planCode === 'bloom' && paid.name === 'IndieOps Incubator', JSON.stringify(paid.name));
    expect('the paid tier leads with the all-access pass',
      /all-access pass/i.test(paid.includes[0]) && /all-access/i.test(paid.pitch), paid.includes[0]);
    expect('no tier mentions the retired flourish or its old prices',
      !PLAN_TIERS.some((t) => /flourish/i.test(JSON.stringify(t)) || /\$29|\$79/.test(JSON.stringify(t))));
    expect('the Incubator carries its real price', paid.price === '$99' && paid.priceSub === '/ month',
      `${paid.price} ${paid.priceSub}`);
    expect('the free tier has no price at all', free.price === 'Free');

    // Real destinations as defaults, not env-only: a deploy that forgets an
    // env var must not send people to a placeholder.
    const urls = getSkoolUrls();
    expect('the free CTA points at the Proof Lab Skool group',
      /skool\.com\/indieops-proof-lab/.test(urls.free), urls.free);
    expect('the paid CTA points at the Incubator application',
      /indieops\.co\/incubator\/apply/.test(urls.paid), urls.paid);
  }

  console.log('\n[wiring]');
  {
    const mock = read('./src/lib/fivestarz/mock-data.js');
    expect('PLANS has left mock-data.js', !/export const PLANS\b/.test(mock));
    expect('mock-data.js explains what it is',
      /FAKE SAMPLE DATA/.test(mock) && /REAL CONFIGURATION/.test(mock));

    const route = read('./src/app/pricing/page.jsx');
    expect('/pricing reads caps server-side',
      route.includes('getPublicPlanCaps') && route.includes('capsForPlan'));

    const page = read('./src/components/fivestarz/PricingPage.jsx');
    expect('the lander takes caps as props, never hardcodes them',
      page.includes('capsByPlan') && !/\$29|\$79/.test(page));
    expect('the CTA sits at the bottom of the card, after the caps',
      page.indexOf('Caps on this tier') < page.indexOf('tier.ctaLabel'));
    expect('the Stripe-shaped FAQ rows are gone',
      !/billing period|7-day refund|14-Day Trial/i.test(page));
    expect('the FAQ states the price and that Skool bills it',
      /\$99 a month/.test(page) && /billed through Skool/.test(page));
    expect('the house rule is stated on the page',
      /never asks you to post a public review/i.test(page));

    const home = read('./src/components/fivestarz/HomePage.jsx');
    expect('the homepage teaser uses the same two tiers',
      home.includes('PLAN_TIERS') && !/\bPLANS\b/.test(home));

    const ui = read('./src/components/fivestarz/ui.jsx');
    expect('FeatureText returns one flex item, not a bare fragment',
      !/return <>\{text\}<\/>/.test(ui) && ui.includes('return <span>{text}</span>'));
  }
} catch (err) {
  bad('harness', err.stack ?? err.message);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
