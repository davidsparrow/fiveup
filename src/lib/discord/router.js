// Dispatch one verified interaction.
//
// Returns { response, deferredWork }. The route sends `response` inside
// Discord's three-second window and runs `deferredWork` after, which is what
// lets a command do a database round trip without timing out.
//
// Nothing here imports Supabase. The `port` argument is the whole backend as
// far as this file is concerned.

import { handleLink } from "@/lib/discord/commands/link";
import { INTERACTION_TYPE, ephemeral, pong } from "@/lib/discord/respond";

const HANDLERS = {
  link: handleLink,
};

export async function handleInteraction({ interaction, port, config, siteUrl }) {
  if (interaction?.type === INTERACTION_TYPE.PING) {
    return { response: pong() };
  }

  if (interaction?.type !== INTERACTION_TYPE.APPLICATION_COMMAND) {
    return { response: ephemeral("That interaction is not supported yet.") };
  }

  const name = interaction?.data?.name;
  const handler = HANDLERS[name];

  if (!handler) {
    return { response: ephemeral(`\`/${name ?? "?"}\` is not a command here yet.`) };
  }

  return handler({ interaction, port, config, siteUrl });
}

export { HANDLERS };
