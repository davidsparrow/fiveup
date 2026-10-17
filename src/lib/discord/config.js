// Discord environment, read in one place and reported honestly.
//
// The app has to boot and the site has to work with none of these set —
// during setup that is the normal state, and on a preview deploy it is the
// permanent one. So nothing throws here: callers ask what is available and
// degrade. The interactions endpoint returns 503 when it cannot verify a
// signature, which is also D1's rollback switch.

export function getDiscordConfig() {
  const appId = process.env.DISCORD_APP_ID || null;
  const publicKey = process.env.DISCORD_PUBLIC_KEY || null;
  const botToken = process.env.DISCORD_BOT_TOKEN || null;
  const guildId = process.env.DISCORD_GUILD_ID || null;
  const memberRoleId = process.env.DISCORD_MEMBER_ROLE_ID || null;
  const inviteUrl = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || null;

  return {
    appId,
    publicKey,
    botToken,
    guildId,
    memberRoleId,
    inviteUrl,

    // Enough to answer a signed interaction: the endpoint can verify and
    // reply. Role grants may still be unavailable.
    canVerify: Boolean(publicKey),

    // Enough to call the Discord API as the bot and move a member's roles.
    canGrantRoles: Boolean(botToken && guildId && memberRoleId),

    // Whether to offer the one-click OAuth path on /account. Separate from
    // everything above because it depends on the Discord provider being
    // enabled in Supabase, which this process cannot see.
    oauthEnabled: process.env.NEXT_PUBLIC_DISCORD_OAUTH_ENABLED === "true",
  };
}

// What is missing, for a setup message rather than a stack trace.
export function missingDiscordEnv() {
  const config = getDiscordConfig();
  const missing = [];

  if (!config.appId) missing.push("DISCORD_APP_ID");
  if (!config.publicKey) missing.push("DISCORD_PUBLIC_KEY");
  if (!config.botToken) missing.push("DISCORD_BOT_TOKEN");
  if (!config.guildId) missing.push("DISCORD_GUILD_ID");
  if (!config.memberRoleId) missing.push("DISCORD_MEMBER_ROLE_ID");

  return missing;
}
