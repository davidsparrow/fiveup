// Demo-world constants shared by the seed script (seed-demo.mjs) and the
// /demo tour page. Pure JS — no Next.js or React imports — so the root .mjs
// scripts can import it directly.
//
// Demo personas are ordinary member accounts (paid plans, publishing toggles
// on) with user_profiles.is_demo = true — the DB column is the single source
// of truth: the DemoBanner on public pages keys off is_demo/owner_is_demo
// returned by the public-read RPCs, and claim_public_username reserves the
// demo- handle prefix for demo accounts. They are never searchable
// (searchable_public_profile stays false), so their pages stay noindex and
// out of the sitemap.

export const DEMO_HANDLES = [
  "demo-maya",
  "demo-diego",
  "demo-priya",
  "demo-sam",
  "demo-noor",
];

// Public slugs are pinned by the seed script (the default slug generator
// appends a random id fragment; the seeder overwrites it with these stable
// values so the tour can link to them).
export const DEMO_ASSET_SLUGS = {
  mayaCourse: "demo-inbox-engine-course",
  diegoLanding: "demo-launchboard-landing",
  diegoPitch: "demo-investor-pitch-deck",
  priyaAudit: "demo-positioning-audit",
  samCoaching: "demo-founder-clarity-coaching",
  noorShop: "demo-saffron-and-salt",
};
