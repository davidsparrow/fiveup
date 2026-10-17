// Absolute origin of the *app*, used for canonical URLs, the sitemap,
// robots, OG image URLs, and every link the Discord bot posts.
//
// Decided 2026-10-15: proofsignals.net (the apex) is a WordPress site on
// SiteGround, and this Next app lives on app.proofsignals.net. So the
// fallback here is the app host, not the apex — a canonical tag or a bot
// link pointing at the marketing site would send members to a page that
// cannot sign them in.
//
// Set NEXT_PUBLIC_SITE_URL in each environment; the fallback only covers a
// build before the env var is configured.
export function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "https://app.proofsignals.net";
  return raw.replace(/\/+$/, "");
}

// The apex, for linking back to the marketing site. Only used where the
// destination really is marketing rather than the product.
export function getMarketingUrl() {
  const raw = process.env.NEXT_PUBLIC_MARKETING_URL || "https://proofsignals.net";
  return raw.replace(/\/+$/, "");
}

export const SITE_NAME = "ProofSignals";
