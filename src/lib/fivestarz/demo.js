// Demo-world constants shared by the seed script (seed-demo.mjs), the /demo
// tour page, and the demo banner on public pages. Pure JS — no Next.js or
// React imports — so the root .mjs scripts can import it directly.
//
// Demo personas are ordinary member accounts (paid plans, publishing toggles
// on) whose handles all start with "demo-". They are never searchable
// (searchable_public_profile stays false), so their pages stay noindex and
// out of the sitemap; the on-page DemoBanner discloses the sample data.

export const DEMO_HANDLES = [
  "demo-maya",
  "demo-diego",
  "demo-priya",
  "demo-sam",
  "demo-noor",
];

export function isDemoHandle(handle) {
  return !!handle && DEMO_HANDLES.includes(String(handle).toLowerCase());
}

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
