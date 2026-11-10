// /me — who you are here, and what you have left.
//
// One round trip, because every number in it comes from member_overview():
// plan_feature_limit and the three count helpers are revoked from
// `authenticated` by design, so there is no way to assemble this caller-side
// and no reason to make four calls.
//
// It is also where a member finds out why web pairing stopped working. When
// the match surface is flipped to `discord`, create_match refuses web callers
// and the site simply offers them less; saying so once, here, is cheaper than
// a support conversation.
//
// This file must not import Supabase or the ProofSignals adapter: that is
// seam 1, and the interactions route is where the two meet.

import { formatOverview } from "@/lib/community/rules/groups";
import { hasOperation } from "@/lib/community/port";
import { deferEphemeral, ephemeral, interactionUser } from "@/lib/discord/respond";

export async function handleMe({ interaction, port, siteUrl }) {
  const user = interactionUser(interaction);

  if (!user) {
    return { response: ephemeral("Could not read your Discord account. Try the command again.") };
  }

  return {
    response: deferEphemeral(),
    deferredWork: async () => {
      const member = await port.resolveMember({ provider: "discord", externalId: user.id });

      if (member.status !== "linked") {
        return [
          "Your Discord is not linked to a ProofSignals account yet.",
          "Run `/link` and I will give you a one-time code to paste on",
          siteUrl ? `${siteUrl}/account.` : "your account page.",
        ].join(" ");
      }

      if (!hasOperation(port, "memberOverview")) {
        // Degrades to what resolveMember already knows rather than failing.
        return [
          `You are linked as ${member.displayName ?? user.handle ?? "a member"}.`,
          siteUrl ? `Your account: ${siteUrl}/account` : null,
        ]
          .filter(Boolean)
          .join(" ");
      }

      const overview = await port.memberOverview({ userId: member.userId });
      return formatOverview(overview, { siteUrl, handle: user.handle });
    },
  };
}
