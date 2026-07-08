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
    .select("id, name, visibility, moderation_status, public_slug")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <PageShell>
      <PublicSettingsPage initialProfile={profile ?? {}} features={features} initialAssets={assets ?? []} />
    </PageShell>
  );
}
