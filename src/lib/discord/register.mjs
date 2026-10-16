// Register the slash commands with Discord. Run on change:
//
//   node src/lib/discord/register.mjs            # guild-scoped (instant)
//   node src/lib/discord/register.mjs --global   # global (up to an hour)
//
// Guild-scoped first, always. Global commands propagate slowly enough that a
// typo in a name costs an hour, and the names are not settled until D3.
//
// Reads .env.local directly rather than through Next, so it works from a
// plain shell the way the verify scripts do.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

// The definitions are plain data, so this script and the route agree on the
// command surface by construction.
const { COMMAND_DEFINITIONS } = await import("./commands/definitions.js");

const appId = env.DISCORD_APP_ID;
const botToken = env.DISCORD_BOT_TOKEN;
const guildId = env.DISCORD_GUILD_ID;
const global = process.argv.includes("--global");

if (!appId || !botToken) {
  console.error("Set DISCORD_APP_ID and DISCORD_BOT_TOKEN in .env.local first.");
  process.exit(1);
}

if (!global && !guildId) {
  console.error("Set DISCORD_GUILD_ID, or pass --global to register globally.");
  process.exit(1);
}

const url = global
  ? `https://discord.com/api/v10/applications/${appId}/commands`
  : `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`;

const response = await fetch(url, {
  method: "PUT",
  headers: {
    authorization: `Bot ${botToken}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(COMMAND_DEFINITIONS),
});

const body = await response.text();

if (!response.ok) {
  console.error(`Registration failed (${response.status}):\n${body}`);
  process.exit(1);
}

const registered = JSON.parse(body);
console.log(
  `Registered ${registered.length} command(s) ${global ? "globally" : `in guild ${guildId}`}:`,
);
registered.forEach((command) => console.log(`  /${command.name} — ${command.description}`));
