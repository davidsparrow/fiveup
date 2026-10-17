// The command definitions Discord registers, and the only list the router
// dispatches from. D1 ships one command.
//
// `/link` takes no options on purpose. Asking a member to type an account
// identifier would invite them to type someone else's; the command proves
// who they are in Discord and the site proves who they are on ProofSignals,
// and the code is the only thing that crosses between.
//
// D3 adds /group (create, recommend, invite, join, members, close), /me and
// /challenge; D4 adds /feedback. /assist, /claim, /points and /board belong
// to the points phase and are deliberately absent.

export const LINK_COMMAND = {
  name: "link",
  description: "Link your Discord account to ProofSignals and get your Member role",
  // Chat-input command, usable in the server and in DMs with the bot.
  type: 1,
  dm_permission: true,
};

export const COMMAND_DEFINITIONS = [LINK_COMMAND];

export const COMMAND_NAMES = COMMAND_DEFINITIONS.map((command) => command.name);
