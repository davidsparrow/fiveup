import { notFound } from "next/navigation";

import DemoBanner from "@/components/fivestarz/DemoBanner";
import PageShell from "@/components/fivestarz/PageShell";
import PublicAssetPage from "@/components/fivestarz/PublicAssetPage";
import { createClient } from "@/lib/supabase/server";
import { isDemoHandle } from "@/lib/fivestarz/demo";
import { SITE_NAME } from "@/lib/fivestarz/site";

/**
 * Resolve a public asset by slug. Returns null unless the slug maps to a
 * public, moderation-clean asset whose owner is not suspended/removed — the
 * RPC ANDs in every gate, so an empty result is authoritative (→ 404).
 * Gating is on the ASSET, independent of whether the owner's profile is public.
 */
async function fetchAsset(supabase, slug) {
  const { data, error } = await supabase.rpc("get_public_asset", { p_slug: slug });
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const supabase = await createClient();

  let asset = null;
  try {
    asset = await fetchAsset(supabase, slug);
  } catch {
    asset = null;
  }

  if (!asset) {
    return {
      title: "Asset not found | ProofSignals",
      robots: { index: false, follow: false },
    };
  }

  // Indexable only when the owner opted this asset in AND has the paid indexing
  // feature (get_public_asset computes `indexable`). Canonical + OG always ship.
  const canonical = `/a/${asset.public_slug}`;
  const title = `${asset.name} | ${SITE_NAME}`;
  const description = asset.description ? asset.description.slice(0, 160) : `${asset.name} on ${SITE_NAME}.`;
  const indexable = Boolean(asset.indexable);
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: indexable, follow: indexable },
    // og:image / twitter:image come from opengraph-image.jsx.
    openGraph: { type: "article", title, description, url: canonical, siteName: SITE_NAME },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PublicAssetRoute({ params }) {
  const { slug } = await params;
  const supabase = await createClient();

  const asset = await fetchAsset(supabase, slug);
  if (!asset) {
    notFound();
  }

  // Approved per-asset commentary (same asset-publishability gate re-applied
  // inside the RPC). Reviewer stays anonymous — a coarse label renders instead.
  const commentaryRes = await supabase.rpc("get_public_asset_feedback", { p_slug: slug });

  return (
    <PageShell>
      {isDemoHandle(asset.owner_username) && <DemoBanner />}
      <PublicAssetPage asset={asset} commentary={commentaryRes.data ?? []} />
    </PageShell>
  );
}
