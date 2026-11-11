// Discord REST calls made as the bot.
//
// D1 needed exactly one: grant the Member role. It is worth its own module
// because the failure modes are specific and the right answer differs for
// each — a 404 means the member has not joined the server yet (ordinary,
// and the member should be told to join), while a 403 means the bot's role
// sits below the role it is trying to grant (a setup mistake, and silent if
// nobody looks).
//
// D3 adds the group room: a private thread per group, off one configured
// channel. Same convention throughout — these return { ok, reason } rather
// than throwing, because the caller's job is to turn the outcome into one
// sentence for a member, and because a room is an enhancement: a group whose
// thread could not be created is still a group, and saying so beats losing
// the group to an exception.

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

// ── D3 · group rooms ────────────────────────────────────────────────────────

// Thread types, from Discord's channel-type enum.
const PRIVATE_THREAD = 12;

// Seven days, the longest Discord allows. A feedback group that goes quiet
// for a week has stalled anyway, and an archived thread un-archives when
// someone posts, so this costs nothing.
const AUTO_ARCHIVE_MINUTES = 10080;

// A private thread off the configured groups channel.
//
// `invitable: false` means only the bot and moderators can add people —
// without it any thread member can pull in anyone, which would route around
// invite_to_group and the caps behind it. The thread is a view of the
// group's membership, and the database stays the thing that decides it.
export async function createGroupThread({ botToken, channelId, name }) {
  if (!botToken || !channelId) {
    return { ok: false, reason: "not_configured" };
  }

  let response;
  try {
    response = await botFetch(`/channels/${channelId}/threads`, {
      method: "POST",
      botToken,
      body: {
        // Discord caps a channel name at 100 characters.
        name: String(name ?? "group").slice(0, 100),
        type: PRIVATE_THREAD,
        invitable: false,
        auto_archive_duration: AUTO_ARCHIVE_MINUTES,
      },
    });
  } catch (err) {
    return { ok: false, reason: "network", detail: String(err?.message ?? err) };
  }

  if (response.ok) {
    const thread = await response.json().catch(() => null);
    if (!thread?.id) {
      return { ok: false, reason: "failed", detail: "Discord returned no thread id." };
    }
    return { ok: true, threadId: String(thread.id), channelId: String(channelId) };
  }

  if (response.status === 403) {
    return {
      ok: false,
      reason: "forbidden",
      detail:
        "Discord refused the thread. The bot needs Create Private Threads and Send Messages in the groups channel.",
    };
  }

  if (response.status === 404) {
    return {
      ok: false,
      reason: "channel_missing",
      detail: "DISCORD_GROUPS_CHANNEL_ID does not point at a channel the bot can see.",
    };
  }

  if (response.status === 429) {
    return { ok: false, reason: "rate_limited" };
  }

  return {
    ok: false,
    reason: "failed",
    detail: `${response.status} ${await response.text().catch(() => "")}`.trim(),
  };
}

// Add a member to a group's thread. 404 here means either the thread or the
// member is gone; both leave the group row untouched, which is the point of
// keeping the database as the source of truth.
export async function addThreadMember({ botToken, threadId, userId }) {
  if (!botToken || !threadId || !userId) {
    return { ok: false, reason: "not_configured" };
  }

  let response;
  try {
    response = await botFetch(`/channels/${threadId}/thread-members/${userId}`, {
      method: "PUT",
      botToken,
    });
  } catch (err) {
    return { ok: false, reason: "network", detail: String(err?.message ?? err) };
  }

  if (response.status === 204 || response.ok) return { ok: true };
  if (response.status === 404) return { ok: false, reason: "not_found" };
  if (response.status === 403) return { ok: false, reason: "forbidden" };
  if (response.status === 429) return { ok: false, reason: "rate_limited" };

  return {
    ok: false,
    reason: "failed",
    detail: `${response.status} ${await response.text().catch(() => "")}`.trim(),
  };
}

// Leaving or being removed from a group takes the thread seat with it.
// Otherwise someone who left keeps reading the room.
export async function removeThreadMember({ botToken, threadId, userId }) {
  if (!botToken || !threadId || !userId) {
    return { ok: false, reason: "not_configured" };
  }

  let response;
  try {
    response = await botFetch(`/channels/${threadId}/thread-members/${userId}`, {
      method: "DELETE",
      botToken,
    });
  } catch (err) {
    return { ok: false, reason: "network", detail: String(err?.message ?? err) };
  }

  // 404 is the same end state: they are not in the thread.
  if (response.status === 204 || response.ok || response.status === 404) return { ok: true };

  return {
    ok: false,
    reason: "failed",
    detail: `${response.status} ${await response.text().catch(() => "")}`.trim(),
  };
}

// A message in the room. Used for the opening post and for announcing a new
// member, so the thread reads as a room rather than an empty channel.
export async function postThreadMessage({ botToken, threadId, content }) {
  if (!botToken || !threadId) {
    return { ok: false, reason: "not_configured" };
  }

  let response;
  try {
    response = await botFetch(`/channels/${threadId}/messages`, {
      method: "POST",
      botToken,
      // No allowed_mentions: the content here is composed by us, never by a
      // member, so there is nothing to sanitise and nothing to ping.
      body: { content: String(content ?? "").slice(0, 2000) },
    });
  } catch (err) {
    return { ok: false, reason: "network", detail: String(err?.message ?? err) };
  }

  if (response.ok) return { ok: true };
  if (response.status === 404) return { ok: false, reason: "not_found" };
  if (response.status === 403) return { ok: false, reason: "forbidden" };

  return {
    ok: false,
    reason: "failed",
    detail: `${response.status} ${await response.text().catch(() => "")}`.trim(),
  };
}

// Archiving rather than deleting, when a group closes. The transcript is the
// group's record of itself; deleting it would destroy the feedback history
// that the whole product is about.
export async function archiveThread({ botToken, threadId }) {
  if (!botToken || !threadId) {
    return { ok: false, reason: "not_configured" };
  }

  let response;
  try {
    response = await botFetch(`/channels/${threadId}`, {
      method: "PATCH",
      botToken,
      body: { archived: true, locked: false },
    });
  } catch (err) {
    return { ok: false, reason: "network", detail: String(err?.message ?? err) };
  }

  if (response.ok) return { ok: true };
  if (response.status === 404) return { ok: false, reason: "not_found" };

  return {
    ok: false,
    reason: "failed",
    detail: `${response.status} ${await response.text().catch(() => "")}`.trim(),
  };
}
