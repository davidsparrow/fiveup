// Seed the demo world for the anonymous /demo tour — Phase 12a.
//
// Creates 5 demo member accounts (paid plans, publishing toggles on), their
// public assets, a cross-feedback web of reciprocal matches, one review-post
// workflow, Proof Lab listings and one completed deal + review. Everything
// goes through the real writer RPCs (signed-in per-persona clients) so the
// production gate chain is exercised; service-role writes are used only where
// no RPC exists (plan_code, slug pinning, created_at backdating).
//
// Re-runnable: a normal run tears down any existing demo users first (auth
// user delete cascades through all owned rows) and recreates from scratch.
//
//   node seed-demo.mjs                      # (re)seed
//   node seed-demo.mjs --teardown           # remove all demo data
//   node seed-demo.mjs --password 'Pw123!'  # seed with a known password so
//                                           # you can log in for screenshots
//                                           # (or DEMO_SEED_PASSWORD env)

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { DEMO_HANDLES, DEMO_ASSET_SLUGS } from './src/lib/fivestarz/demo.js';

const env = Object.fromEntries(
  readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3210';

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const TEARDOWN_ONLY = args.includes('--teardown');
const pwFlag = args.indexOf('--password');
const PASSWORD = pwFlag >= 0 ? args[pwFlag + 1] : (process.env.DEMO_SEED_PASSWORD || `Demo!${randomUUID()}`);

const daysAgo = (n) => new Date(Date.now() - n * 86400e3).toISOString();
const log = (m) => console.log(m);
const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };

// Every RPC call in the seed must succeed — fail loudly, never seed half a world.
async function rpc(client, fn, params, who) {
  const { data, error } = await client.rpc(fn, params);
  if (error) die(`${who}: ${fn}(${JSON.stringify(params)}) → ${error.message}`);
  return data;
}

// ── The cast ────────────────────────────────────────────────────────────────
// Handles/slugs come from src/lib/fivestarz/demo.js so UI and seed can't drift.
const S = DEMO_ASSET_SLUGS;
const PERSONAS = [
  {
    handle: 'demo-maya', name: 'Maya Chen', plan: 'bloom', memberDays: 88,
    bio: 'Course creator teaching bootstrapped founders how to grow an email list that actually converts. Building Inbox Engine in public.',
    location: 'Portland, OR',
    links: [
      { url: 'https://example.com/inbox-engine', label: 'Course site' },
      { url: 'https://example.com/maya-newsletter', label: 'Newsletter' },
    ],
    assets: [{
      key: 'mayaCourse', slug: S.mayaCourse,
      name: 'Inbox Engine — Email List Course', type: 'digital_product_saas',
      url: 'https://example.com/inbox-engine',
      description: 'A 6-module course for bootstrapped founders: build an email list from zero and write a welcome sequence that sells without being pushy.',
      channels: ['Teachable', 'Trustpilot'], formats: ['stars', 'written'],
    }],
    offers: [], showOffers: false,
  },
  {
    handle: 'demo-diego', name: 'Diego Ramos', plan: 'bloom', memberDays: 74,
    bio: 'Founder of LaunchBoard — a lightweight launch-planning tool for indie SaaS teams. Ex-PM, first-time founder, sharpening my pitch one honest review at a time.',
    location: 'Austin, TX',
    links: [{ url: 'https://example.com/launchboard', label: 'LaunchBoard' }],
    assets: [
      {
        key: 'diegoLanding', slug: S.diegoLanding,
        name: 'LaunchBoard — SaaS Landing Page', type: 'digital_product_saas',
        url: 'https://example.com/launchboard',
        description: 'Landing page for LaunchBoard. I want brutal honesty on the hero copy and whether the pricing section answers the obvious objections.',
        channels: ['G2', 'Trustpilot'], formats: ['stars', 'written'],
      },
      {
        key: 'diegoPitch', slug: S.diegoPitch,
        name: 'Investor Pitch Deck', type: 'advisory_skills',
        url: 'https://example.com/launchboard-deck',
        description: '12-slide seed deck. Does the problem slide land? Is the ask clear? Tell me where you stopped believing it.',
        channels: ['LinkedIn'], formats: ['written'],
      },
    ],
    offers: [], showOffers: false,
  },
  {
    handle: 'demo-priya', name: 'Priya Shah', plan: 'flourish', memberDays: 65,
    bio: 'Positioning and messaging consultant for B2B SaaS. I help founders say what they do in one sentence people actually remember.',
    location: 'London, UK',
    links: [{ url: 'https://example.com/priya-consulting', label: 'Consulting site' }],
    assets: [{
      key: 'priyaAudit', slug: S.priyaAudit,
      name: 'Positioning & Messaging Audit', type: 'service_consulting',
      url: 'https://example.com/priya-audit',
      description: 'A one-week audit of your homepage, onboarding emails, and sales deck. You get a rewritten one-liner, a message map, and a 30-minute walkthrough call.',
      channels: ['Clutch.co', 'LinkedIn'], formats: ['stars', 'written'],
    }],
    offers: [
      {
        title: 'Positioning & Messaging Audit', category: 'copywriting',
        description: 'One week, one deliverable: a message map and rewritten homepage copy your customers actually understand. Includes a 30-minute walkthrough call.',
        retail: 120000, member: 75000, unit: 'per project', badge: 'Popular',
      },
      {
        title: '30-Day Content Plan for Founders', category: 'email_marketing',
        description: 'A month of email and LinkedIn content mapped to your positioning — written in your voice, ready to schedule.',
        retail: 60000, member: 40000, unit: 'per project',
      },
    ],
    showOffers: true,
  },
  {
    handle: 'demo-sam', name: 'Sam Okafor', plan: 'bloom', memberDays: 52,
    bio: 'Executive coach for first-time founders. Clarity before hustle — we fix the week before we fix the roadmap.',
    location: 'Toronto, ON',
    links: [{ url: 'https://example.com/sam-coaching', label: 'Coaching practice' }],
    assets: [{
      key: 'samCoaching', slug: S.samCoaching,
      name: 'Founder Clarity Coaching', type: 'advisory_skills',
      url: 'https://example.com/sam-coaching',
      description: 'A 6-week 1:1 coaching sprint for founders drowning in their own to-do list. Weekly calls, one decision framework, no fluff.',
      channels: ['Google Business Profile', 'LinkedIn'], formats: ['stars', 'written'],
    }],
    offers: [{
      title: 'Founder Clarity Intro Session', category: 'pitch_coaching',
      description: 'A free 45-minute working session: bring your messiest problem, leave with one decision made. No pitch, no follow-up sequence.',
      retail: 25000, member: 0, unit: 'per session',
    }],
    showOffers: true,
  },
  {
    handle: 'demo-noor', name: 'Noor Haddad', plan: 'bloom', memberDays: 41,
    bio: 'I run Saffron & Salt, a small-batch spice shop. Learning marketing one honest review at a time.',
    location: 'Dearborn, MI',
    links: [{ url: 'https://example.com/saffron-and-salt', label: 'Shop' }],
    assets: [{
      key: 'noorShop', slug: S.noorShop,
      name: 'Saffron & Salt — Spice Shop', type: 'ecommerce_store',
      url: 'https://example.com/saffron-and-salt',
      description: 'Small-batch spice blends, sourced direct. I want feedback on the product pages — do the photos and descriptions make you trust the food?',
      channels: ['Google Business Profile', 'Amazon'], formats: ['stars', 'written'],
    }],
    offers: [], showOffers: false,
  },
];

// ── The cross-feedback web ──────────────────────────────────────────────────
// Each entry = one reciprocal match. `by` initiates (create_match), reviewing
// `other`'s asset while `other` reviews `by`'s asset. Order matters: every
// pair must be separation-clean (no path, or path > 2°) at creation time;
// with this order the only connected pair is sam↔noor at 4°, which passes.
const MATCHES = [
  {
    by: 'demo-maya', myAsset: 'mayaCourse', other: 'demo-diego', theirAsset: 'diegoLanding', matchDays: 30,
    feedback: [
      {
        from: 'demo-diego', about: 'mayaCourse', stars: 5, days: 24, rating: 5,
        text: 'I went through modules 1–3 as a founder with a 400-person list. The welcome-sequence teardown in module 2 is the best thing here — I rewrote mine the same evening and replies doubled. Module 3 drags: two of the lessons repeat the same segmentation idea, and I’d cut the tool-comparison video entirely. Worth it for module 2 alone.',
      },
      {
        from: 'demo-maya', about: 'diegoLanding', stars: 4, days: 23, rating: 5,
        text: 'Your hero says “ship your launch faster” but nothing above the fold says who it’s for — I assumed it was for PMs at big companies until the third scroll. The pricing page is genuinely good. Biggest fix: lead with the indie-team angle, it’s your sharpest edge and it’s buried.',
      },
    ],
    reviewPost: { requester: 'demo-maya', feedbackFrom: 'demo-diego', channel: 'Teachable' },
  },
  {
    by: 'demo-priya', myAsset: 'priyaAudit', other: 'demo-maya', theirAsset: 'mayaCourse', matchDays: 26,
    feedback: [
      {
        from: 'demo-priya', about: 'mayaCourse', stars: 5, days: 20, rating: 5,
        text: 'Positioning lens: your sales page promises “grow your list” but the course actually teaches conversion, which is rarer and more valuable. Rename the outcome, keep the content. The module structure is tight and the examples are real — I’d happily send clients here after an audit.',
      },
      {
        from: 'demo-maya', about: 'priyaAudit', stars: 5, days: 19, rating: 4,
        text: 'Priya audited my course sales page as the exchange. The message map alone reframed how I describe the course — “conversion, not collection” is now my first line. The walkthrough call was direct without being harsh. If I could change one thing: the written report is long; a one-page summary up top would help.',
      },
    ],
  },
  {
    by: 'demo-diego', myAsset: 'diegoPitch', other: 'demo-sam', theirAsset: 'samCoaching', matchDays: 21,
    feedback: [
      {
        from: 'demo-sam', about: 'diegoPitch', stars: 4, days: 16, rating: 5,
        text: 'Slides 1–4 are strong; I believed the problem. I stopped believing at slide 7 — the go-to-market is a list of channels, not a plan. Your traction slide undersells you: 900 paying users at month eight is the headline, put it on slide 2. The ask is clear. Fix 7 and this deck works.',
      },
      {
        from: 'demo-diego', about: 'samCoaching', stars: 5, days: 15, rating: 5,
        text: 'I came in skeptical of coaching. The weekly decision framework is the opposite of fluffy — week two forced me to kill a feature I’d been dragging for a month. Sam asks uncomfortable questions and then just waits, which is exactly what I was paying for. The sprint format fits founder brain.',
      },
    ],
  },
  {
    by: 'demo-noor', myAsset: 'noorShop', other: 'demo-priya', theirAsset: 'priyaAudit', matchDays: 14,
    feedback: [
      {
        from: 'demo-noor', about: 'priyaAudit', stars: 5, days: 9, rating: 5,
        text: 'I’m a tiny e-commerce shop, not SaaS, and the audit still worked. Priya rewrote my “about” story into two sentences that now open every product page, and my abandoned-cart email. Clear process, fast turnaround, and she told me what NOT to spend money on, which I respect.',
      },
      {
        from: 'demo-priya', about: 'noorShop', stars: 4, days: 8, rating: 5,
        text: 'The photography already sells trust — don’t touch it. The product descriptions bury the origin story that makes you different; “sourced from one farm in Kashan” should be the first line, not the last. Shipping info took me three clicks to find. Fix those two things and the site converts.',
      },
    ],
  },
  {
    by: 'demo-sam', myAsset: 'samCoaching', other: 'demo-noor', theirAsset: 'noorShop', matchDays: 10,
    feedback: [
      {
        from: 'demo-noor', about: 'samCoaching', stars: 5, days: 5, rating: 4,
        text: 'I booked the intro session expecting a sales pitch and got a working session instead. We mapped my week and found six hours going to tasks my supplier portal already automates. I signed up for the sprint after. If you’re a solo owner doing everything yourself, start here.',
      },
      {
        from: 'demo-sam', about: 'noorShop', stars: 4, days: 4, rating: 5,
        text: 'Bought the harissa blend to review this properly — it’s excellent, and the unboxing card with the farm story is the best marketing you have. The site undersells the gift angle: I’d buy this as a gift before I’d buy it for myself, and there’s no gift set on the homepage. That’s revenue on the table.',
      },
    ],
  },
];

// One completed Proof Lab deal: Noor buys Priya's audit, then reviews it.
const DEAL = {
  buyer: 'demo-noor', seller: 'demo-priya', listingTitle: 'Positioning & Messaging Audit',
  stars: 5, days: 6,
  review: 'Hired Priya through the Proof Lab after our match. The audit paid for itself in the first week — clearer copy, better cart emails, and a straight answer on where not to spend. Exactly what the reviews said it would be.',
};

// ── Teardown ────────────────────────────────────────────────────────────────
async function teardown() {
  const ids = new Set();
  const { data: byHandle, error } = await admin
    .from('user_profiles').select('user_id').in('public_username', DEMO_HANDLES);
  if (error) die(`teardown lookup: ${error.message}`);
  for (const r of byHandle ?? []) ids.add(r.user_id);

  // Also catch half-seeded users that never claimed a handle (fixed emails).
  const emails = new Set(DEMO_HANDLES.map((h) => `${h}@proofsignals.net`));
  for (let page = 1; page <= 20; page++) {
    const { data, error: lErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (lErr) die(`teardown listUsers: ${lErr.message}`);
    for (const u of data.users) if (emails.has(u.email)) ids.add(u.id);
    if (data.users.length < 200) break;
  }

  for (const id of ids) {
    const { error: dErr } = await admin.auth.admin.deleteUser(id);
    if (dErr) die(`teardown deleteUser(${id}): ${dErr.message}`);
  }
  log(`teardown: removed ${ids.size} demo user(s)`);
}

// ── Seed ────────────────────────────────────────────────────────────────────
async function seed() {
  const world = {}; // handle → { id, client, assets: { key → assetId }, feedbackIds: Map }

  log('\n[1/5] personas');
  for (const p of PERSONAS) {
    const email = `${p.handle}@proofsignals.net`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
      user_metadata: { display_name: p.name },
    });
    if (error) die(`createUser(${p.handle}): ${error.message}`);
    const id = created.user.id;

    const { error: planErr } = await admin.from('user_profiles')
      .update({ plan_code: p.plan, is_demo: true, created_at: daysAgo(p.memberDays) }).eq('user_id', id);
    if (planErr) die(`plan(${p.handle}): ${planErr.message}`);

    const client = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error: sErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (sErr) die(`signIn(${p.handle}): ${sErr.message}`);

    await rpc(client, 'update_my_profile', { p_display_name: p.name, p_bio: p.bio, p_location_text: p.location }, p.handle);
    await rpc(client, 'claim_public_username', { p_username: p.handle }, p.handle);
    for (const l of p.links) await rpc(client, 'add_external_link', { p_url: l.url, p_label: l.label }, p.handle);

    const assets = {};
    for (const a of p.assets) {
      const assetId = await rpc(client, 'create_asset', {
        p_name: a.name, p_public_url: a.url, p_asset_type: a.type,
        p_description: a.description, p_channels: a.channels, p_feedback_formats: a.formats,
      }, p.handle);
      await rpc(client, 'set_asset_visibility', { p_asset_id: assetId, p_visibility: 'public' }, p.handle);
      // Pin the stable demo slug (the generated slug embeds a random id fragment).
      const { error: slugErr } = await admin.from('assets')
        .update({ public_slug: a.slug, created_at: daysAgo(p.memberDays - 2) }).eq('id', assetId);
      if (slugErr) die(`slug(${a.slug}): ${slugErr.message}`);
      assets[a.key] = assetId;
    }

    await rpc(client, 'update_publishing_settings', {
      p_profile_public_enabled: true,
      p_show_location: true,
      p_show_stats: true,
      p_show_feedback_excerpts: true,
      p_show_external_links: true,
      ...(p.showOffers ? { p_show_marketplace_offers: true } : {}),
    }, p.handle);

    world[p.handle] = { id, client, assets, feedbackIds: new Map() };
    log(`  ✓ ${p.handle} (${p.plan}) — ${p.assets.length} asset(s)`);
  }

  log('\n[2/5] matches + feedback');
  for (const m of MATCHES) {
    const me = world[m.by], them = world[m.other];
    // The demo web is a 5-cycle whose final pair sits at exactly 4° — the
    // Phase 13 create_match fix (degree capped at 3 on insert) makes this
    // work through the real RPC.
    const matchId = await rpc(me.client, 'create_match', {
      p_other_user_id: them.id,
      p_my_asset_id: me.assets[m.myAsset],
      p_their_asset_id: them.assets[m.theirAsset],
    }, m.by);
    await admin.from('matches').update({ created_at: daysAgo(m.matchDays) }).eq('id', matchId);

    for (const f of m.feedback) {
      const reviewer = world[f.from];
      const recipientHandle = m.feedback.find((x) => x !== f).from;
      const recipient = world[recipientHandle];
      const fbId = await rpc(reviewer.client, 'submit_feedback', {
        p_match_id: matchId, p_stars: f.stars, p_written_feedback: f.text,
      }, f.from);
      await admin.from('feedback_submissions').update({ created_at: daysAgo(f.days) }).eq('id', fbId);
      // Recipient rates the feedback, then approves it for public display.
      await rpc(recipient.client, 'rate_member_feedback', { p_feedback_submission_id: fbId, p_stars: f.rating }, recipientHandle);
      await rpc(recipient.client, 'approve_public_feedback', { p_source_type: 'match_feedback', p_source_id: fbId }, recipientHandle);
      reviewer.feedbackIds.set(`${f.from}→${recipientHandle}`, fbId);
    }

    if (m.reviewPost) {
      const requester = world[m.reviewPost.requester];
      const reviewerHandle = m.reviewPost.feedbackFrom;
      const fbId = world[reviewerHandle].feedbackIds.get(`${reviewerHandle}→${m.reviewPost.requester}`);
      const reqId = await rpc(requester.client, 'request_review_post', {
        p_feedback_submission_id: fbId, p_requested_channel_name: m.reviewPost.channel,
      }, m.reviewPost.requester);
      await rpc(world[reviewerHandle].client, 'respond_review_post_request', { p_request_id: reqId, p_accept: true }, reviewerHandle);
    }
    log(`  ✓ ${m.by} ⇄ ${m.other}`);
  }

  log('\n[3/5] Proof Lab listings');
  const listingIds = {}; // title → id
  for (const p of PERSONAS) {
    for (const o of p.offers) {
      const listingId = await rpc(world[p.handle].client, 'create_proof_lab_listing', {
        p_title: o.title, p_description: o.description, p_category_slug: o.category,
        p_retail_price_cents: o.retail, p_member_price_cents: o.member,
        p_price_unit: o.unit, ...(o.badge ? { p_badge: o.badge } : {}),
      }, p.handle);
      listingIds[o.title] = listingId;
      log(`  ✓ ${p.handle}: "${o.title}"`);
    }
  }

  log('\n[4/5] Proof Lab deal + review');
  {
    const buyer = world[DEAL.buyer], seller = world[DEAL.seller];
    const listingId = listingIds[DEAL.listingTitle];
    const dealId = await rpc(buyer.client, 'request_proof_lab_deal', {
      p_listing_id: listingId, p_requester_email: `${DEAL.buyer}@proofsignals.net`,
      p_note: 'Loved the audit we exchanged in our match — I want the full engagement for the shop.',
    }, DEAL.buyer);
    await rpc(seller.client, 'accept_proof_lab_deal', { p_deal_id: dealId }, DEAL.seller);
    await rpc(seller.client, 'mark_proof_lab_deal_fulfilled', { p_deal_id: dealId }, DEAL.seller);
    await rpc(buyer.client, 'confirm_proof_lab_deal', { p_deal_id: dealId }, DEAL.buyer);
    await rpc(seller.client, 'confirm_proof_lab_deal', { p_deal_id: dealId }, DEAL.seller);
    const reviewId = await rpc(buyer.client, 'create_proof_lab_review', {
      p_deal_id: dealId, p_stars: DEAL.stars, p_written: DEAL.review,
    }, DEAL.buyer);
    await admin.from('proof_lab_reviews').update({ created_at: daysAgo(DEAL.days) }).eq('id', reviewId);
    // Seller approves the engaged review for her public profile.
    await rpc(seller.client, 'approve_public_feedback', { p_source_type: 'engaged_review', p_source_id: reviewId }, DEAL.seller);
    log(`  ✓ ${DEAL.buyer} → ${DEAL.seller}: deal completed + reviewed`);
  }

  log('\n[5/5] summary');
  log(`  password: ${pwFlag >= 0 || process.env.DEMO_SEED_PASSWORD ? '(as provided)' : '(random — rerun with --password to log in)'}`);
  for (const p of PERSONAS) log(`  ${SITE}/u/${p.handle}`);
  for (const [k, slug] of Object.entries(DEMO_ASSET_SLUGS)) log(`  ${SITE}/a/${slug}  (${k})`);
}

await teardown();
if (!TEARDOWN_ONLY) await seed();
log('\ndone');
