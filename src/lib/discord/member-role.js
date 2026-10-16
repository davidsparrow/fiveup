// Grant the Member role, and say what happened.
//
// Shared by the bot (/link) and the two site routes that finish a link,
// because the same three outcomes matter on both roads: granted, the member
// has not joined the server yet, or the server is not wired up. Recording
// the grant in the database is left to the caller — the bot marks it as the
// service role, the site marks it as the member.

import { getDiscordConfig } from "@/lib/discord/config";
import { addGuildMemberRole } from "@/lib/discord/rest";
import { describeRoleGrant } from "@/lib/community/rules/identity";

export async function grantMemberRole(discordUserId, config = getDiscordConfig()) {
  if (!config.canGrantRoles) {
    const described = describeRoleGrant({ granted: false, reason: "not_configured" });
    return { ...described, granted: false, reason: "not_configured" };
  }

  const result = await addGuildMemberRole({
    botToken: config.botToken,
    guildId: config.guildId,
    userId: discordUserId,
    roleId: config.memberRoleId,
  });

  if (!result.granted && result.detail) {
    // A 403 here is a setup mistake nobody would otherwise see: the bot's
    // role sits below the role it is granting.
    console.error("Discord Member role grant failed:", result.reason, result.detail);
  }

  const described = describeRoleGrant({
    granted: result.granted,
    reason: result.reason,
    inviteUrl: config.inviteUrl,
  });

  return { ...described, granted: result.granted, reason: result.reason ?? null };
}
