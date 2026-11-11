// Groups, as words. Platform-agnostic.
//
// The database raises member-facing sentences on purpose — 'this group is
// full (4 of 4 seats)', 'you are already in 1 feedback group(s), which is the
// limit on your plan', 'challenge cohorts open in a later phase'. Those ARE
// the product copy, the same way the link-code messages are: they name which
// rule was hit, and a handler that replaces them with "something went wrong"
// throws away the only useful part. So the default here is to pass the
// database's own sentence through, and translate only where a chat surface
// needs a different next step than the site would offer.
//
// Pure: no backend, no chat platform, no JSX.

// Relative, not "@/...": a rules module with no alias in it can be imported
// straight into a verify script, which is how every assertion below is proved
// without a running Next.js. tracks.js is pure copy and imports nothing.
import { trackLabel } from "../../fivestarz/tracks.js";
import { matchByName } from "./naming.js";

// Discord hard-rejects a message body over 2000 characters, and a roster or a
// recommendation list is unbounded in principle. Every formatter here ends in
// clamp() rather than hoping.
export const MAX_MESSAGE = 1900;

export function clamp(text, limit = MAX_MESSAGE) {
  const body = String(text ?? "");
  if (body.length <= limit) return body;
  return `${body.slice(0, limit - 1).trimEnd()}…`;
}

// groups.status is ('forming', 'active', 'closed') — 'open' is a VISIBILITY,
// not a status, and conflating the two is a filter that silently matches
// nothing. A handler asking "can this group still be acted on?" wants these.
export const GROUP_LIVE_STATUSES = ["forming", "active"];

export function isGroupLive(group) {
  return GROUP_LIVE_STATUSES.includes(group?.status);
}

export const PLAN_LABEL = { sprout: "Sprout", bloom: "Bloom", flourish: "Flourish" };

export function planLabel(code) {
  return PLAN_LABEL[code] ?? code ?? "unknown";
}

// Not plans.js's formatCap(): that one takes a whole plan_feature_gates row
// for the /pricing table and renders a null limit_int as "Unlimited", which
// is right for marketing copy about a tier. This one renders one member's
// usage against their own cap, and deliberately will NOT call null unlimited
// — plan_feature_limit returns null for a missing gate row, and a seeding
// mistake that reads as a free pass is the exact trap phase 22 flagged when
// it made flourish a twin of bloom rather than leaving it null.
export function capLine(used, limit) {
  const count = Number(used ?? 0);
  if (limit === null || limit === undefined) return `${count} (no cap set)`;
  return `${count} / ${limit}`;
}

export function groupLine(group) {
  const seats = group?.maxMembers
    ? `${group.activeMemberCount ?? 0}/${group.maxMembers}`
    : `${group.activeMemberCount ?? 0}`;
  const track = trackLabel(group?.track);
  const bits = [
    `**${group?.name ?? "untitled"}**`,
    `${seats} seats`,
    group?.myRole === "owner" ? "you own it" : group?.myRole,
    group?.myStatus && group.myStatus !== "active" ? group.myStatus : null,
    track,
    group?.status === "closed" ? "closed" : null,
  ].filter(Boolean);

  const pending =
    group?.myRole === "owner" && Number(group?.pendingRequestCount ?? 0) > 0
      ? ` — ${group.pendingRequestCount} request(s) waiting`
      : "";

  return `• ${bits.join(" · ")}${pending}`;
}

// A group, by the name a member typed. `autoPickSingle` is off by default
// here and on by default for assets, and the asymmetry is deliberate: acting
// on "your only asset" is a convenience, while acting on "your only group"
// when the member named none would mean closing or leaving a room they never
// pointed at.
export function resolveGroupByName({ groups, requested, autoPickSingle = false } = {}) {
  const outcome = matchByName({
    items: Array.isArray(groups) ? groups.filter((g) => g?.groupId) : [],
    requested,
    nameOf: (g) => g?.name,
    idOf: (g) => g?.groupId,
    autoPickSingle,
  });

  return outcome.status === "resolved"
    ? { status: "resolved", group: outcome.item }
    : { ...outcome, groups: outcome.items };
}

export function describeGroupChoice(outcome, { commandHint, noneMessage } = {}) {
  const names = (outcome?.groups ?? []).map((g) => `• ${g?.name ?? "untitled"}`);

  if (outcome?.status === "none") {
    return (
      noneMessage ??
      "You are not in any groups yet. `/group create name:<name>` starts one."
    );
  }

  if (outcome?.status === "choose") {
    return clamp(
      [
        "Which group?",
        ...names,
        commandHint ? `Re-run ${commandHint} with \`name:<group>\`.` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (outcome?.status === "ambiguous") {
    return clamp(
      [`"${outcome.requested}" matches more than one:`, ...names, "Use the full name."].join("\n"),
    );
  }

  if (outcome?.status === "unknown") {
    return clamp(
      [`No group of yours is called "${outcome.requested}". You are in:`, ...names].join("\n"),
    );
  }

  return "Could not work out which group you meant.";
}

export function formatMyGroups(groups, { siteUrl } = {}) {
  const list = Array.isArray(groups) ? groups : [];

  if (list.length === 0) {
    return clamp(
      [
        "You are not in any groups yet.",
        "Start one with `/group create name:<name>`, or see what is open with `/group discover`.",
      ].join(" "),
    );
  }

  const lines = [
    `You are in ${list.length} group${list.length === 1 ? "" : "s"}:`,
    ...list.map(groupLine),
  ];

  if (siteUrl) lines.push(`Full view: ${siteUrl}/dashboard`);
  return clamp(lines.join("\n"));
}

export function formatDiscoverable(groups) {
  const list = Array.isArray(groups) ? groups : [];

  if (list.length === 0) {
    return clamp(
      "No groups are open to join right now. `/group create name:<name>` starts one.",
    );
  }

  const lines = [
    `${list.length} group${list.length === 1 ? "" : "s"} you could join:`,
    ...list.map((g) => {
      const seats = g?.maxMembers
        ? `${g.activeMemberCount ?? 0}/${g.maxMembers}`
        : `${g.activeMemberCount ?? 0}`;
      const bits = [
        `**${g?.name ?? "untitled"}**`,
        `${seats} seats`,
        trackLabel(g?.track),
        g?.ownerDisplayName ? `by ${g.ownerDisplayName}` : null,
        g?.joinsByRequest ? "approval needed" : "open",
      ].filter(Boolean);

      // blocked_reason is the cap talking. Showing it next to the room is the
      // whole reason discoverable_groups computes it.
      const blocked = g?.canJoin === false && g?.blockedReason ? ` — ${g.blockedReason}` : "";
      return `• ${bits.join(" · ")}${blocked}`;
    }),
    "Join with `/group join name:<name>`.",
  ];

  return clamp(lines.join("\n"));
}

export function formatRoster(rows, { groupName } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const active = list.filter((r) => r?.status === "active");
  const waiting = list.filter((r) => r?.status === "requested");
  const invited = list.filter((r) => r?.status === "invited");

  const lines = [`**${groupName ?? "Group"}** — ${active.length} active`];

  for (const row of active) {
    const bits = [
      row?.displayName ?? row?.publicUsername ?? "a member",
      row?.role === "owner" ? "owner" : null,
      row?.assetName ? `bringing ${row.assetName}` : "no asset on their seat",
      trackLabel(row?.track),
    ].filter(Boolean);
    lines.push(`• ${bits.join(" · ")}`);
  }

  if (invited.length > 0) {
    lines.push(`Invited, not yet in: ${invited.map((r) => r?.displayName ?? "a member").join(", ")}`);
  }

  if (waiting.length > 0) {
    lines.push(
      `Waiting on your approval: ${waiting.map((r) => r?.displayName ?? "a member").join(", ")}`,
    );
  }

  return clamp(lines.join("\n"));
}

export function formatRecommendations(rows, { groupName } = {}) {
  const list = Array.isArray(rows) ? rows : [];

  if (list.length === 0) {
    return clamp(
      [
        "No one to recommend right now.",
        "The recommender looks for members whose asset suits yours and who you have not already matched with.",
      ].join(" "),
    );
  }

  const lines = [
    `Suggested for **${groupName ?? "your group"}**:`,
    ...list.map((r) => {
      const bits = [
        r?.displayName ?? r?.publicUsername ?? "a member",
        r?.assetName ? `${r.assetName}${r.assetType ? ` (${r.assetType})` : ""}` : null,
        trackLabel(r?.track),
        r?.shortestPathDegree != null ? `${r.shortestPathDegree}° away` : null,
        Number(r?.priorMatchCount ?? 0) > 0 ? `${r.priorMatchCount} prior match(es)` : null,
      ].filter(Boolean);
      return `• ${bits.join(" · ")}`;
    }),
    "Invite one with `/group invite name:<group> member:<their name>`.",
  ];

  return clamp(lines.join("\n"));
}

export function formatOverview(overview, { siteUrl, handle } = {}) {
  if (!overview) return clamp("Could not read your account just now. Try `/me` again in a minute.");

  const caps = overview.caps ?? {};
  const usage = overview.usage ?? {};

  const lines = [
    `**${overview.displayName ?? handle ?? "You"}** · ${planLabel(overview.planCode)}${
      overview.track ? ` · ${trackLabel(overview.track)}` : " · no track set"
    }`,
    `Feedback groups open: ${capLine(usage.openGroups, caps.maxConcurrentGroups)}`,
    `Groups joined this month: ${capLine(usage.groupsJoinedThisMonth, caps.feedbackGroupsPerMonth)}`,
    `Open match-ups: ${capLine(usage.concurrentMatchups, caps.maxConcurrentMatchups)}`,
    `Assets ready to be reviewed: ${overview.pairableAssetCount ?? 0}`,
  ];

  // Why web pairing is refusing them, said once, where they will look.
  if (overview.matchSurface === "discord") {
    lines.push("Pairing happens here in Discord, not on the site.");
  }

  if (!overview.track) {
    lines.push(
      siteUrl ? `Set your track at ${siteUrl}/account.` : "Set your track on your account page.",
    );
  }

  if (siteUrl) lines.push(`Your account: ${siteUrl}/account`);

  return clamp(lines.join("\n"));
}

// Outcomes from the write RPCs. Each status is one the RPC actually returns.
export function describeJoin(result, { groupName } = {}) {
  switch (result?.status) {
    case "joined":
      return `You are in **${groupName ?? "the group"}**.`;
    case "requested":
      return `Requested a seat in **${groupName ?? "the group"}**. The owner has to approve it — you will see it on your account page once they do.`;
    case "already_member":
      return `You are already in **${groupName ?? "that group"}**.`;
    case "already_requested":
      return `You have already asked to join **${groupName ?? "that group"}**. Still waiting on the owner.`;
    default:
      return `Could not join **${groupName ?? "that group"}**.`;
  }
}

// discoverable_groups hides any room the caller already has a row in, so a
// handler that only consulted it cannot tell "no such group" from "you are
// already in it". This says which, from the member's own group list.
// A name that matches a group the caller IS in, but which the subcommand
// filtered out. "No group of yours is called X" would be a lie there — they
// are in it, it is just closed, or theirs to leave rather than to close. The
// specific reason is the useful half.
export function describeIneligibleGroup(group) {
  const name = group?.name ?? "that group";

  if (group?.status === "closed") return `**${name}** is already closed.`;
  if (group?.myStatus === "invited") {
    return `You have not accepted the invitation to **${name}** yet — \`/group accept group:${name}\`.`;
  }
  if (group?.myStatus === "requested") {
    return `Your request to join **${name}** has not been approved yet.`;
  }
  if (group?.myRole !== "owner") return `You do not own **${name}**.`;

  return `**${name}** cannot be used for that.`;
}

export function describeExistingRelationship(group) {
  const name = group?.name ?? "that group";

  switch (group?.myStatus) {
    case "active":
      return `You are already in **${name}**.`;
    case "requested":
      return `You have already asked to join **${name}**. Still waiting on the owner.`;
    case "invited":
      return `You have an invitation to **${name}** — accept it with \`/group accept group:${name}\`.`;
    default:
      return `You already have a seat or a request in **${name}**.`;
  }
}

export function describeInvite(result, { groupName, inviteeName } = {}) {
  const who = inviteeName ?? "that member";
  switch (result?.status) {
    case "invited":
      return `Invited ${who} to **${groupName ?? "the group"}**. They accept with \`/group accept name:${groupName ?? "<group>"}\`.`;
    case "already_invited":
      return `${who} already has an open invitation to **${groupName ?? "the group"}**.`;
    case "already_member":
      return `${who} is already in **${groupName ?? "the group"}**.`;
    case "joined":
      return `${who} had already asked to join, so they are in.`;
    default:
      return `Could not invite ${who}.`;
  }
}

// The translation layer. Most database messages go straight through; these
// are the ones where Discord's next step differs from the site's.
export function describeGroupError(errorMessage, { siteUrl, commandHint } = {}) {
  const raw = String(errorMessage ?? "").replace(/^.*?:\s*/, "").trim();

  if (!raw) return "Something went wrong. Try the command again in a minute.";

  if (/bring an asset|your selected asset must exist/i.test(raw)) {
    return [
      raw,
      siteUrl ? `Your assets are at ${siteUrl}/account/assets.` : null,
      commandHint ? `Then re-run ${commandHint} with \`asset:<name>\`.` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  // The act-as path should never surface as a member-facing sentence: it means
  // the bot called wrong, not that the member did anything.
  if (/service-role call must name|cannot act on behalf/i.test(raw)) {
    return "Something went wrong on our side linking this command to your account. Try again in a minute.";
  }

  if (/authentication required/i.test(raw)) {
    return "Your Discord is not linked to a ProofSignals account yet. Run `/link` first.";
  }

  if (/matching is handled in Discord/i.test(raw)) {
    // A group pairing hitting the Phase A gate means create_match was reached
    // without source = 'group'. The member can do nothing about it.
    return "That pairing could not be created. This is a bug on our side — please mention it.";
  }

  return clamp(raw);
}
