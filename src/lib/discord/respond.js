// Interaction response shapes, and the deferred follow-up.
//
// Discord wants an answer within three seconds. A cold serverless start plus
// a database round trip can spend most of that, so anything doing real work
// answers with a deferral (type 5) and PATCHes the original response once it
// is done. Only validation that needs no IO replies inline.

const API_BASE = "https://discord.com/api/v10";

export const INTERACTION_TYPE = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
};

export const RESPONSE_TYPE = {
  PONG: 1,
  CHANNEL_MESSAGE: 4,
  DEFERRED_CHANNEL_MESSAGE: 5,
};

// Ephemeral. Everything D1 says to a member is between them and the bot.
const EPHEMERAL = 1 << 6;

export function pong() {
  return { type: RESPONSE_TYPE.PONG };
}

export function ephemeral(content) {
  return {
    type: RESPONSE_TYPE.CHANNEL_MESSAGE,
    data: { content, flags: EPHEMERAL },
  };
}

export function deferEphemeral() {
  return {
    type: RESPONSE_TYPE.DEFERRED_CHANNEL_MESSAGE,
    data: { flags: EPHEMERAL },
  };
}

// Replaces the "thinking…" placeholder a deferral leaves behind. Uses the
// interaction token, not the bot token, so this works before the bot has any
// guild permissions at all.
export async function editDeferredReply({ appId, interactionToken, content }) {
  if (!appId || !interactionToken) {
    throw new Error("A deferred reply needs DISCORD_APP_ID and the interaction token.");
  }

  const response = await fetch(
    `${API_BASE}/webhooks/${appId}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, flags: EPHEMERAL }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Discord follow-up failed (${response.status}): ${await response.text().catch(() => "")}`,
    );
  }
}

// The Discord user behind an interaction, whichever shape it arrives in:
// `member.user` inside a guild, `user` in a DM.
export function interactionUser(interaction) {
  const user = interaction?.member?.user ?? interaction?.user ?? null;
  if (!user?.id) return null;

  return {
    id: String(user.id),
    // global_name is the display name Discord moved to; username is the
    // handle. Prefer the handle, since that is what a member recognises on
    // their own /account page.
    handle: user.username ?? user.global_name ?? null,
  };
}
