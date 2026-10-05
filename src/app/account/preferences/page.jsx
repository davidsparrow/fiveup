import { redirect } from "next/navigation";

import PageShell from "@/components/fivestarz/PageShell";
import MatchPreferencesPage from "@/archive/web-matching/MatchPreferencesPage";
import { MATCH_SURFACE_WEB, getDiscordInviteUrl, resolveMatchSurface } from "@/lib/fivestarz/match-surface";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Matching preferences | ProofSignals",
  robots: { index: false, follow: false },
};

// Phase A: match preferences belong to the archived web matching surface.
// Discord surface → redirect to the invite (no 404); web surface → the
// archived page renders exactly as before.
export default async function MatchPreferencesRoute() {
  const supabase = await createClient();

  const surface = await resolveMatchSurface(supabase);
  if (surface !== MATCH_SURFACE_WEB) {
    redirect(getDiscordInviteUrl());
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account/preferences");
  }

  // Read current state server-side (RLS as the member) so the page renders
  // with no loading flicker. Mutations happen client-side via
  // update_match_preferences.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("degrees_of_separation, allow_semi_duplicate_matches, allow_semi_duplicate_with_free, plan_code")
    .eq("user_id", user.id)
    .single();

  const { data: gateRows } = await supabase
    .from("plan_feature_gates")
    .select("feature_key, enabled, limit_int, config")
    .eq("plan_code", profile?.plan_code ?? "sprout")
    .in("feature_key", ["degrees_of_separation_control", "semi_duplicate_matching"]);

  const byKey = Object.fromEntries((gateRows ?? []).map((g) => [g.feature_key, g]));
  const degrees = byKey.degrees_of_separation_control;
  const semiDup = byKey.semi_duplicate_matching;
  const gates = {
    degreesEnabled: Boolean(degrees?.enabled),
    maxDegree: degrees?.limit_int ?? 1,
    canDisableSemiDup: Boolean(semiDup?.config?.can_disable),
    canToggleWithFree: Boolean(semiDup?.config?.allow_paid_free_toggle),
  };

  return (
    <PageShell>
      <MatchPreferencesPage initialProfile={profile ?? {}} gates={gates} />
    </PageShell>
  );
}
