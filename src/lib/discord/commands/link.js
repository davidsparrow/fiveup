// /link — road 2 of identity linking.
//
// The command mints a one-time code against the caller's Discord snowflake
// and tells them to paste it on /account. It never writes an identity row:
// that happens under the member's own session on the site, which is the only
// place a ProofSignals account can actually be proved.
//
// Running /link when already linked is the retry path for a failed role
// grant — a member who linked before joining the server runs it again after
// joining and gets their Member role, with no admin involved.
//
// This file imports the port's shape through its argument and the Discord
// side directly. It must not import Supabase or the ProofSignals adapter:
// that is seam 1, and the interactions route is where the two meet.

import { describeIssuedCode } from "@/lib/community/rules/identity";
import { grantMemberRole } from "@/lib/discord/member-role";
import { deferEphemeral, ephemeral, interactionUser } from "@/lib/discord/respond";

export async function handleLink({ interaction, port, config, siteUrl }) {
  const user = interactionUser(interaction);

  // Inline, because it needs no IO: a reply Discord gets immediately.
  if (!user) {
    return { response: ephemeral("Could not read your Discord account. Try the command again.") };
  }

  const accountUrl = `${siteUrl}/account`;

  return {
    response: deferEphemeral(),
    deferredWork: async () => {
      const existing = await port.resolveMember({ provider: "discord", externalId: user.id });

      if (existing.status === "linked") {
        // Already linked. The only thing left to do is make sure the role
        // actually landed.
        if (existing.roleGrantedAt) {
          return `Your Discord is already linked to ProofSignals. Your account page is ${accountUrl}.`;
        }

        const grant = await grantMemberRole(user.id, config);
        if (grant.granted) {
          await port.markRoleGranted({ provider: "discord", externalId: user.id });
          return `Your Discord is already linked. Member role granted — welcome in. ${accountUrl}`;
        }

        return `Your Discord is already linked. ${grant.message}`;
      }

      const issued = await port.issueLinkCode({
        provider: "discord",
        externalId: user.id,
        handle: user.handle,
      });

      // The race where someone links on the site between the two calls
      // above: the RPC reports it rather than minting a dead code.
      if (issued.status === "already_linked") {
        return `Your Discord is already linked to ProofSignals. Your account page is ${accountUrl}.`;
      }

      return describeIssuedCode(issued, { provider: "discord", accountUrl }).message;
    },
  };
}
