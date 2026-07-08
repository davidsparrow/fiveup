// Absolute site origin used for canonical URLs, the sitemap, robots, and OG
// image URLs. Set NEXT_PUBLIC_SITE_URL in the production environment; falls
// back to a placeholder so dev/build works before the domain is configured.
export function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "https://proofsignals.com";
  return raw.replace(/\/+$/, "");
}

export const SITE_NAME = "ProofSignals";
