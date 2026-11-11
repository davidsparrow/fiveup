// Discord's rules for a chat-input command, checked before the API is asked.
//
// Discord rejects the whole registration payload on one bad field, and the
// error names a JSON path rather than a command — "options[2].options[0]" is
// a poor way to learn that a description ran four characters long. So the
// rules live here, register.mjs runs them first, and verify-phase23 asserts
// that they actually catch something.
//
// Pure: no network, no credentials. --dry-run works before the portal exists.

// Discord's documented limits for a chat-input command. Each of these is a
// 400 with a JSON path for an error message if it reaches the API.
const LIMITS = { name: 32, description: 100, options: 25, commands: 100 };
const NAME_RE = /^[-_'\p{L}\p{N}]{1,32}$/u;

export function commandDefinitionProblems(definitions) {
  const found = [];
  const seen = new Set();

  if (definitions.length > LIMITS.commands) {
    found.push(`${definitions.length} commands, over Discord's limit of ${LIMITS.commands}`);
  }

  const walk = (option, path) => {
    if (!NAME_RE.test(option.name ?? "")) found.push(`${path}: invalid name "${option.name}"`);
    if (option.name !== option.name?.toLowerCase()) found.push(`${path}: name must be lowercase`);
    if (!option.description) found.push(`${path}: missing description`);
    else if (option.description.length > LIMITS.description) {
      found.push(`${path}: description is ${option.description.length} chars, max ${LIMITS.description}`);
    }
    if ((option.options ?? []).length > LIMITS.options) {
      found.push(`${path}: ${option.options.length} options, max ${LIMITS.options}`);
    }

    // Required options must precede optional ones, or Discord rejects the
    // command. Easy to break by inserting one in the middle.
    let seenOptional = false;
    for (const child of option.options ?? []) {
      if (child.type > 2) {
        if (child.required) {
          if (seenOptional) found.push(`${path}: required option "${child.name}" follows an optional one`);
        } else {
          seenOptional = true;
        }
      }
      walk(child, `${path} ${child.name}`);
    }
  };

  for (const command of definitions) {
    if (seen.has(command.name)) found.push(`/${command.name}: duplicate command name`);
    seen.add(command.name);
    walk(command, `/${command.name}`);
  }

  return found;
}

// One line per command: subcommand names when it has them, the description
// when it does not. Used by --dry-run and by the registration output.
export function describeCommand(command) {
  const subs = (command.options ?? []).filter((o) => o.type === 1 || o.type === 2);
  return subs.length > 0
    ? `  /${command.name} — ${subs.map((s) => s.name).join(", ")}`
    : `  /${command.name} — ${command.description}`;
}
