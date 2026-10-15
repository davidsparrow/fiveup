import { redirect } from "next/navigation";

import PageShell from "@/components/fivestarz/PageShell";
import BrowsePage from "@/archive/web-matching/BrowsePage";
import { MATCH_SURFACE_WEB, getDiscordInviteUrl, resolveMatchSurface } from "@/lib/fivestarz/match-surface";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Browse Members | ProofSignals",
  description: "Browse ProofSignals members and request a match to exchange honest feedback.",
};

// Phase A: the web Browse flow is archived behind the match_surface gate.
// When the surface is Discord this route redirects to the invite (never a
// 404 — old links keep working); when it is web the archived page renders
// exactly as before.
export default async function BrowseMembersPage() {
  const supabase = await createClient();

  const surface = await resolveMatchSurface(supabase);
  if (surface !== MATCH_SURFACE_WEB) {
    redirect(getDiscordInviteUrl());
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/browse");
  }

  return (
    <PageShell>
      <BrowsePage userId={user.id} />
    </PageShell>
  );
}
