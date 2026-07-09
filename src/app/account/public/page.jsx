import { redirect } from "next/navigation";

import PageShell from "@/components/fivestarz/PageShell";
import PublicSettingsPage from "@/components/fivestarz/PublicSettingsPage";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Public profile settings | ProofSignals",
  robots: { index: false, follow: false },
};

const PROFILE_COLS = [
  "public_username",
  "profile_public_enabled",
  "searchable_public_profile",
  "show_logo",
  "show_location",
  "show_stats",
  "show_feedback_excerpts",
  "show_public_videos",
  "show_marketplace_offers",
  "show_external_links",
  "plan_code",
].join(", ");

export default async function PublicSettingsRoute() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account/public");
  }

  // Read current state server-side (RLS as the member) so the page renders with
  // no loading flicker and is HTTP-verifiable. Mutations happen client-side.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select(PROFILE_COLS)
    .eq("user_id", user.id)
    .single();

  const { data: gates } = await supabase
    .from("plan_feature_gates")
    .select("feature_key, enabled")
    .eq("plan_code", profile?.plan_code ?? "sprout");
  const features = Object.fromEntries((gates ?? []).map((g) => [g.feature_key, g.enabled]));

  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, visibility, moderation_status, public_slug, brand_visibility")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: links } = await supabase
    .from("profile_external_links")
    .select("id, url, label, sort_order, moderation_status")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  // Received feedback the member can approve for public display, plus current
  // approval state from public_feedback_permissions.
  const [matchRes, engagedRes, permsRes] = await Promise.all([
    supabase
      .from("feedback_submissions")
      .select("id, written_feedback, stars, media_url, submitted_at")
      .eq("reviewee_user_id", user.id)
      .eq("moderation_status", "ok")
      .order("submitted_at", { ascending: false }),
    supabase
      .from("proof_lab_reviews")
      .select("id, written_review, stars, created_at")
      .eq("reviewee_user_id", user.id)
      .eq("moderation_status", "ok")
      .order("created_at", { ascending: false }),
    supabase.from("public_feedback_permissions").select("source_type, source_id, approved").eq("owner_user_id", user.id),
  ]);

  const approved = new Set(
    (permsRes.data ?? []).filter((p) => p.approved).map((p) => `${p.source_type}:${p.source_id}`),
  );
  const hasText = (s) => typeof s === "string" && s.trim().length > 0;
  const feedback = [
    ...(matchRes.data ?? [])
      .filter((f) => hasText(f.written_feedback) || hasText(f.media_url))
      .map((f) => ({
        source_type: "match_feedback",
        id: f.id,
        body: f.written_feedback,
        stars: f.stars,
        media_url: f.media_url,
        created_at: f.submitted_at,
        approved: approved.has(`match_feedback:${f.id}`),
      })),
    ...(engagedRes.data ?? [])
      .filter((r) => hasText(r.written_review))
      .map((r) => ({
        source_type: "engaged_review",
        id: r.id,
        body: r.written_review,
        stars: r.stars,
        media_url: null,
        created_at: r.created_at,
        approved: approved.has(`engaged_review:${r.id}`),
      })),
  ];

  return (
    <PageShell>
      <PublicSettingsPage
        initialProfile={profile ?? {}}
        features={features}
        initialAssets={assets ?? []}
        initialFeedback={feedback}
        initialLinks={links ?? []}
      />
    </PageShell>
  );
}
