import { redirect } from "next/navigation";

import PageShell from "@/components/fivestarz/PageShell";
import ProfileCardEditor from "@/components/fivestarz/profile-card/ProfileCardEditor";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Design your profile card | ProofSignals",
  robots: { index: false, follow: false },
};

const PROFILE_COLS = [
  "display_name",
  "bio",
  "location_text",
  "avatar_url",
  "tagline",
  "profile_style",
  "headline_feedback_source_type",
  "headline_feedback_source_id",
  "public_username",
  "profile_public_enabled",
  "show_logo",
  "show_location",
  "show_stats",
  "show_feedback_excerpts",
  "feedback_rating_avg",
  "feedback_rating_count",
  "proof_lab_rating_avg",
  "proof_lab_rating_count",
  "plan_code",
].join(", ");

export default async function ProfileCardEditorRoute() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account/profile");
  }

  // Read current state server-side (RLS as the member) so the editor opens
  // settled. Every mutation goes through a definer RPC from the client.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select(PROFILE_COLS)
    .eq("user_id", user.id)
    .single();

  // The headline picker lists only reviews the member has already approved
  // for public display — the same set the card can show.
  const hasText = (s) => typeof s === "string" && s.trim().length > 0;
  const [matchRes, engagedRes, permsRes, linksRes] = await Promise.all([
    supabase
      .from("feedback_submissions")
      .select("id, written_feedback, stars, submitted_at")
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
    supabase
      .from("profile_external_links")
      .select("id, url, label, sort_order, moderation_status")
      .eq("user_id", user.id)
      .eq("moderation_status", "ok")
      .order("sort_order", { ascending: true }),
  ]);

  const approved = new Set(
    (permsRes.data ?? []).filter((p) => p.approved).map((p) => `${p.source_type}:${p.source_id}`),
  );
  const approvedReviews = [
    ...(matchRes.data ?? [])
      .filter((f) => hasText(f.written_feedback) && approved.has(`match_feedback:${f.id}`))
      .map((f) => ({ source_type: "match_feedback", id: f.id, body: f.written_feedback, stars: f.stars, created_at: f.submitted_at })),
    ...(engagedRes.data ?? [])
      .filter((r) => hasText(r.written_review) && approved.has(`engaged_review:${r.id}`))
      .map((r) => ({ source_type: "engaged_review", id: r.id, body: r.written_review, stars: r.stars, created_at: r.created_at })),
  ];

  return (
    <PageShell>
      <ProfileCardEditor
        userId={user.id}
        initialProfile={profile ?? {}}
        approvedReviews={approvedReviews}
        links={linksRes.data ?? []}
      />
    </PageShell>
  );
}
