// The command definitions Discord registers, and the only list the router
// dispatches from.
//
// `/link` takes no options on purpose. Asking a member to type an account
// identifier would invite them to type someone else's; the command proves
// who they are in Discord and the site proves who they are on ProofSignals,
// and the code is the only thing that crosses between.
//
// `/group` is one command with subcommands rather than eleven commands,
// because Discord shows a flat command list and eleven top-level verbs would
// bury /link. No subcommand takes a `track` option: a group inherits its
// creator's track, which is the locked decision that a Track is the entry
// cohort and singular. No subcommand takes a group id either — members never
// see one — so each takes `group:<name>` and the handler resolves it against
// the groups that member is actually in.
//
// /assist, /claim, /points and /board belong to the points phase and are
// deliberately absent. /feedback is D4's. /challenge is D5's: challenge
// cohorts are admin-created and join_group refuses them by name until then,
// so offering the command now would only produce a refusal.

// Discord's application-command option types, named rather than inlined.
const SUB_COMMAND = 1;
const STRING = 3;
const INTEGER = 4;
const USER = 6;

export const LINK_COMMAND = {
  name: "link",
  description: "Link your Discord account to ProofSignals and get your Member role",
  // Chat-input command, usable in the server and in DMs with the bot.
  type: 1,
  dm_permission: true,
};

export const ME_COMMAND = {
  name: "me",
  description: "Your plan, track, caps and what you have used of them",
  type: 1,
  dm_permission: true,
};

// Reused by every subcommand that points at a group the member is already in.
const groupOption = (description = "The group, by name") => ({
  name: "group",
  description,
  type: STRING,
  required: true,
});

// Optional everywhere it appears: with one pairable asset the handler picks
// it, and with several it names them rather than guessing.
const assetOption = {
  name: "asset",
  description: "Which of your assets to bring (only needed if you have more than one)",
  type: STRING,
  required: false,
};

export const GROUP_COMMAND = {
  name: "group",
  description: "Feedback groups — create one, find one, run yours",
  type: 1,
  dm_permission: true,
  options: [
    {
      name: "create",
      description: "Start a feedback group and take the first seat",
      type: SUB_COMMAND,
      options: [
        { name: "name", description: "What to call it", type: STRING, required: true },
        assetOption,
        {
          name: "visibility",
          description: "Who can find it (default: private)",
          type: STRING,
          required: false,
          choices: [
            { name: "Private — invite only", value: "private" },
            { name: "Listed — others can request a seat", value: "listed" },
            { name: "Open — others can join directly", value: "open" },
          ],
        },
        {
          name: "size",
          description: "Seats, 4 to 6 (default: 4)",
          type: INTEGER,
          required: false,
          min_value: 4,
          max_value: 6,
        },
      ],
    },
    { name: "list", description: "The groups you are in", type: SUB_COMMAND },
    {
      name: "discover",
      description: "Groups you could join",
      type: SUB_COMMAND,
    },
    {
      name: "join",
      description: "Join an open group, or ask for a seat in a listed one",
      type: SUB_COMMAND,
      options: [groupOption("The group to join, by name"), assetOption],
    },
    {
      name: "accept",
      description: "Accept an invitation to a group",
      type: SUB_COMMAND,
      options: [groupOption("The group you were invited to"), assetOption],
    },
    {
      name: "decline",
      description: "Decline an invitation to a group",
      type: SUB_COMMAND,
      options: [groupOption("The group you were invited to")],
    },
    {
      name: "invite",
      description: "Invite someone to a group you own",
      type: SUB_COMMAND,
      options: [
        groupOption("The group to invite them to"),
        {
          name: "member",
          description: "Who to invite (they must have run /link)",
          type: USER,
          required: false,
        },
        {
          name: "name",
          description: "Or a name from /group recommend, for someone not in this server",
          type: STRING,
          required: false,
        },
      ],
    },
    {
      name: "members",
      description: "Who is in a group, and what they brought",
      type: SUB_COMMAND,
      options: [groupOption()],
    },
    {
      name: "recommend",
      description: "Members worth inviting to a group you own",
      type: SUB_COMMAND,
      options: [
        groupOption("The group to recommend for"),
        {
          name: "limit",
          description: "How many to suggest (default: 5)",
          type: INTEGER,
          required: false,
          min_value: 1,
          max_value: 10,
        },
      ],
    },
    {
      name: "leave",
      description: "Leave a group, freeing the seat and your cap",
      type: SUB_COMMAND,
      options: [groupOption("The group to leave")],
    },
    {
      name: "close",
      description: "Close a group you own",
      type: SUB_COMMAND,
      options: [groupOption("The group to close")],
    },
  ],
};

export const COMMAND_DEFINITIONS = [LINK_COMMAND, ME_COMMAND, GROUP_COMMAND];

export const COMMAND_NAMES = COMMAND_DEFINITIONS.map((command) => command.name);

// The subcommands the router knows how to dispatch. Exported so the verify
// script can assert the definitions and the handler map stay in step — a
// subcommand registered with no handler is a command that tells a member it
// does not exist.
export const GROUP_SUBCOMMANDS = GROUP_COMMAND.options.map((option) => option.name);
