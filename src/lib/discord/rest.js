// Discord REST calls made as the bot.
//
// D1 needs exactly one: grant the Member role. It is worth its own module
// because the failure modes are specific and the right answer differs for
// each — a 404 means the member has not joined the server yet (ordinary,
// and the member should be told to join), while a 403 means the bot's role
// sits below the role it is trying to grant (a setup mistake, and silent if
// nobody looks).

const API_BASE = "https://discord.com/api/v10";

async function botFetch(path, { method = "GET", botToken, body } = {}) {
  if (!botToken) {
    throw new Error("DISCORD_BOT_TOKEN is not set.");
  }

  return fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bot ${botToken}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Returns { granted, reason } rather than throwing, because every caller
// turns the outcome into a sentence for a member who is already linked. The
// row is written either way; the role is the part that can lag.
export async function addGuildMemberRole({ botToken, guildId, userId, roleId }) {
  if (!botToken || !guildId || !roleId) {
    return { granted: false, reason: "not_configured" };
  }

  let response;
  try {
    response = await botFetch(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
      method: "PUT",
      botToken,
    });
  } catch (err) {
    return { granted: false, reason: "network", detail: String(err?.message ?? err) };
  }

  if (response.status === 204 || response.ok) {
    return { granted: true };
  }

  if (response.status === 404) {
    return { granted: false, reason: "not_in_guild" };
  }

  if (response.status === 403) {
    return {
      granted: false,
      reason: "forbidden",
      detail:
        "Discord refused the role grant. Drag the bot's own role above Member in Server Settings → Roles.",
    };
  }

  if (response.status === 429) {
    return { granted: false, reason: "rate_limited" };
  }

  return {
    granted: false,
    reason: "failed",
    detail: `${response.status} ${await response.text().catch(() => "")}`.trim(),
  };
}

export async function getGuildMember({ botToken, guildId, userId }) {
  const response = await botFetch(`/guilds/${guildId}/members/${userId}`, { botToken });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Discord member lookup failed (${response.status}).`);
  }
  return response.json();
}

// Unlinking takes the Member role back. The role is the whole incentive to
// link, so leaving it behind after an unlink would quietly make linking
// optional.
export async function removeGuildMemberRole({ botToken, guildId, userId, roleId }) {
  if (!botToken || !guildId || !roleId) {
    return { removed: false, reason: "not_configured" };
  }

  let response;
  try {
    response = await botFetch(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
      method: "DELETE",
      botToken,
    });
  } catch (err) {
    return { removed: false, reason: "network", detail: String(err?.message ?? err) };
  }

  // 404 means they are not in the server, which is the same end state.
  if (response.status === 204 || response.ok || response.status === 404) {
    return { removed: true };
  }

  return {
    removed: false,
    reason: "failed",
    detail: `${response.status} ${await response.text().catch(() => "")}`.trim(),
  };
}
