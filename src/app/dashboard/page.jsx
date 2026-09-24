import { redirect } from "next/navigation";

import PageShell from "@/components/fivestarz/PageShell";
import DashboardPage from "@/components/fivestarz/DashboardPage";
import MatchActions from "@/archive/web-matching/MatchActions";
import { MATCH_SURFACE_WEB, getDiscordInviteUrl, resolveMatchSurface } from "@/lib/fivestarz/match-surface";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Dashboard | FiveStarz",
  description: "Manage your matches, assets, and feedback history on FiveStarz.",
};

export default async function DashboardRoutePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  // Phase A: the dashboard keeps its read-only match history and the
  // feedback / rating / post-request flow on every surface. Only the
  // match-initiating entry point (archived) is gated here, so the archive
  // folder is imported by this route and never by the dashboard component.
  const surface = await resolveMatchSurface(supabase);
  const matchActions = surface === MATCH_SURFACE_WEB ? <MatchActions /> : null;

  return (
    <PageShell>
      <DashboardPage
        userId={user.id}
        matchSurface={surface}
        matchActions={matchActions}
        discordInviteUrl={process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ? getDiscordInviteUrl() : null}
      />
    </PageShell>
  );
}
