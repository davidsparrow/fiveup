// Dispatch one verified interaction.
//
// Returns { response, deferredWork }. The route sends `response` inside
// Discord's three-second window and runs `deferredWork` after, which is what
// lets a command do a database round trip without timing out.
//
// Nothing here imports Supabase. The `port` argument is the whole backend as
// far as this file is concerned.
//
// Subcommand dispatch deliberately does NOT live here. /group has eleven
// subcommands that share a member lookup, an asset picker and a group-name
// resolver; splitting the dispatch across two files would put the shared
// setup in neither. This map stays one entry per registered command, which is
// also the thing the verify script can check against the definitions.

import { handleGroup } from "@/lib/discord/commands/group";
import { handleLink } from "@/lib/discord/commands/link";
import { handleMe } from "@/lib/discord/commands/me";
import { INTERACTION_TYPE, ephemeral, pong } from "@/lib/discord/respond";

const HANDLERS = {
  link: handleLink,
  me: handleMe,
  group: handleGroup,
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
