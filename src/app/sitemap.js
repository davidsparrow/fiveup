import { getSiteUrl } from "@/lib/fivestarz/site";
import { createClient } from "@/lib/supabase/server";

// Public marketing routes + every search-indexable public profile
// (list_searchable_profiles applies the same gating as the `searchable` flag).
// Asset pages stay noindex and are intentionally omitted (see phase 9 doc).
export const dynamic = "force-dynamic";

export default async function sitemap() {
  const base = getSiteUrl();

  const staticRoutes = ["", "/how-it-works", "/pricing", "/community", "/safety", "/proof-lab", "/demo"].map((route) => ({
    url: `${base}${route}`,
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.6,
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

  return [...staticRoutes, ...profiles, ...assets];
}
