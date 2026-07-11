import { notFound } from "next/navigation";

import DemoBanner from "@/components/fivestarz/DemoBanner";
import PageShell from "@/components/fivestarz/PageShell";
import PublicProfilePage from "@/components/fivestarz/PublicProfilePage";
import { createClient } from "@/lib/supabase/server";
import { isDemoHandle } from "@/lib/fivestarz/demo";
import { getSiteUrl, SITE_NAME } from "@/lib/fivestarz/site";

/**
 * Fetch the public profile projection for a handle. Returns null when the
 * profile is not publishable (unpublished, suspended, removed, or no such
 * handle) — the RPC already ANDs in every Phase-7 suppression rule, so an
 * empty result is authoritative. 8c is strict-404: no owner preview.
 */
async function fetchProfile(supabase, username) {
  const { data, error } = await supabase.rpc("get_public_profile", { p_username: username });
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

export async function generateMetadata({ params }) {
  const { username } = await params;
  const supabase = await createClient();

  let profile = null;
  try {
    profile = await fetchProfile(supabase, username);
  } catch {
    profile = null;
  }

  if (!profile) {
    // Unresolvable handle: default to noindex, generic title.
    return {
      title: "Profile not found | ProofSignals",
      robots: { index: false, follow: false },
    };
  }

  // Default to noindex; only searchable (paid + opted-in) profiles are indexed.
  const searchable = Boolean(profile.searchable);
  const canonical = `/u/${profile.public_username}`;
  const title = `${profile.display_name} (@${profile.public_username}) | ${SITE_NAME}`;
  const description = profile.bio ? profile.bio.slice(0, 160) : `${profile.display_name} on ${SITE_NAME}.`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: searchable, follow: searchable },
    // og:image / twitter:image are added automatically from opengraph-image.jsx.
    openGraph: { type: "profile", title, description, url: canonical, siteName: SITE_NAME },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PublicProfileRoute({ params }) {
  const { username } = await params;
  const supabase = await createClient();

  const profile = await fetchProfile(supabase, username);
  if (!profile) {
    notFound();
  }

  // The profile exists and is public — fetch the rest of the approved
  // projection in parallel. Each RPC re-applies the same publishability gate.
  const [feedbackRes, assetsRes, offersRes, linksRes] = await Promise.all([
    supabase.rpc("get_public_feedback", { p_username: username }),
    supabase.rpc("get_public_assets", { p_username: username }),
    supabase.rpc("get_public_offers", { p_username: username }),
    supabase.rpc("get_public_links", { p_username: username }),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.display_name,
    url: `${getSiteUrl()}/u/${profile.public_username}`,
    ...(profile.bio ? { description: profile.bio } : {}),
    ...(profile.avatar_url ? { image: profile.avatar_url } : {}),
  };

  return (
    <PageShell>
      {isDemoHandle(profile.public_username) && <DemoBanner />}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicProfilePage
        profile={profile}
        feedback={feedbackRes.data ?? []}
        assets={assetsRes.data ?? []}
        offers={offersRes.data ?? []}
        links={linksRes.data ?? []}
      />
    </PageShell>
  );
}
