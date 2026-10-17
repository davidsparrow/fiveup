import { getSiteUrl } from "@/lib/fivestarz/site";
import { createClient } from "@/lib/supabase/server";

// Every search-indexable public profile and asset (list_searchable_profiles
// applies the same gating as the `searchable` flag).
//
// The app's marketing routes are deliberately NOT here. proofsignals.net is a
// WordPress site that carries the same copy, and submitting both would have
// two hosts competing for one set of keywords; those pages now carry
// MARKETING_ROBOTS instead. What the app publishes is the record — the public
// profiles and asset pages Skool and the apex link into.
export const dynamic = "force-dynamic";

export default async function sitemap() {
  const base = getSiteUrl();

  // Proof Market stays: it is a product surface with its own public teaser,
  // not something the marketing site duplicates.
  const appRoutes = ["/proof-market"].map((route) => ({
    url: `${base}${route}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  let profiles = [];
  let assets = [];
  try {
    const supabase = await createClient();
    const [profRes, assetRes] = await Promise.all([
      supabase.rpc("list_searchable_profiles"),
      supabase.rpc("list_searchable_assets"),
    ]);
    profiles = (profRes.data ?? []).map((p) => ({
      url: `${base}/u/${p.public_username}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
      changeFrequency: "weekly",
      priority: 0.8,
    }));
    assets = (assetRes.data ?? []).map((a) => ({
      url: `${base}/a/${a.public_slug}`,
      lastModified: a.updated_at ? new Date(a.updated_at) : undefined,
      changeFrequency: "monthly",
      priority: 0.6,
    }));
  } catch {
    profiles = [];
    assets = [];
  }

  return [...appRoutes, ...profiles, ...assets];
}
