// /group — the feedback-group surface in Discord.
//
// Every subcommand follows the same three beats:
//
//   1. Resolve the caller to a ProofSignals member. Discord knows a
//      snowflake; the database knows a user id; member_identities is the only
//      bridge, and an unlinked caller is sent to /link rather than guessed at.
//   2. Do exactly one write, through the port, naming the member it acts for.
//      The caps, the ownership rules and the seat counts all live in the RPC.
//      Nothing here re-checks them — a handler that second-guessed the
//      database would be a second place for the rules to drift.
//   3. Best-effort room work. A thread is a view of the membership, never the
//      record of it. Every thread call can fail without failing the command.
//
// The rooms are the one place this file deliberately does more than one
// thing, and the ordering matters: the row is written first, the thread
// second. A group with no thread is a working group that members can see on
// the site. A thread with no group would be a room with no rules.
//
// This file imports the port through its argument and the Discord side
// directly. It must not import Supabase or the ProofSignals adapter: that is
// seam 1, and the interactions route is where the two meet.

import { describeAssetChoice, resolvePairableAsset } from "@/lib/community/rules/assets";
import {
  clamp,
  describeExistingRelationship,
  describeGroupChoice,
  describeGroupError,
  describeIneligibleGroup,
  describeInvite,
  describeJoin,
  formatDiscoverable,
  formatMyGroups,
  formatRecommendations,
  formatRoster,
  isGroupLive,
  resolveGroupByName,
} from "@/lib/community/rules/groups";
import { matchByName } from "@/lib/community/rules/naming";
import { hasOperation } from "@/lib/community/port";
import {
  addThreadMember,
  archiveThread,
  createGroupThread,
  postThreadMessage,
  removeThreadMember,
} from "@/lib/discord/rest";
import {
  deferEphemeral,
  ephemeral,
  interactionUser,
  optionsOf,
  resolvedUser,
  subcommandOf,
} from "@/lib/discord/respond";

// ── Shared helpers ──────────────────────────────────────────────────────────

function linkFirstMessage(siteUrl) {
  return clamp(
    [
      "Your Discord is not linked to a ProofSignals account yet.",
      "Run `/link` and I will give you a one-time code to paste on",
      siteUrl ? `${siteUrl}/account.` : "your account page.",
    ].join(" "),
  );
}

// The member's own groups, used by every subcommand that names an existing
// one. Fetched per command rather than cached: a handler that trusted a stale
// list would offer a member a room they had already left.
async function myGroups(port, userId) {
  if (!hasOperation(port, "listGroups")) return null;
  return port.listGroups({ userId });
}

// Resolve `group:<name>` against a list, or return the message explaining why
// it could not be. Returns { group } or { message }.
function pickGroup({ groups, requested, commandHint, filter, noneMessage }) {
  const all = groups ?? [];
  const candidates = filter ? all.filter(filter) : all;
  const outcome = resolveGroupByName({ groups: candidates, requested });

  if (outcome.status === "resolved") return { group: outcome.group };

  // A name the filter removed is a different answer from a name that matches
  // nothing. Closing an already-closed group should say "already closed", not
  // "no group of yours is called that" — the member is still in it.
  if (filter) {
    const wider = resolveGroupByName({ groups: all, requested });
    if (wider.status === "resolved") {
      return { message: describeIneligibleGroup(wider.group) };
    }
  }

  return { message: describeGroupChoice(outcome, { commandHint, noneMessage }) };
}

// The asset the member brings, or the message asking which. Returns
// { assetId } or { message }.
async function pickAsset({ port, userId, requested, commandHint, siteUrl }) {
  if (!hasOperation(port, "listPairableAssets")) {
    return {
      message:
        "This install cannot look up your assets from Discord. Create the group on the site instead.",
    };
  }

  const assets = await port.listPairableAssets({ userId });
  const outcome = resolvePairableAsset({ assets, requested });

  if (outcome.status === "resolved") return { assetId: outcome.asset.assetId };
  return { message: describeAssetChoice(outcome, { siteUrl, commandHint }).message };
}

// ── Rooms ───────────────────────────────────────────────────────────────────
//
// Each returns a sentence to append, or null when there is nothing to say.
// None of them throws: a failed room call is reported, never fatal.

async function openRoom({ port, config, group, snowflake, siteUrl }) {
  if (!config?.canCreateRooms) return null;

  const thread = await createGroupThread({
    botToken: config.botToken,
    channelId: config.groupsChannelId,
    name: group.name,
  });

  if (!thread.ok) {
    // A setup mistake should reach whoever can fix it. The member sees that
    // the group exists and the room does not, which is the truth.
    console.error("group thread creation failed:", thread.reason, thread.detail ?? "");
    return "I could not open a private thread for it — the group itself is fine, and an admin can wire the room up.";
  }

  // The write-back. If this fails the thread is orphaned, so it is the one
  // room step whose failure is worth saying plainly.
  if (hasOperation(port, "recordGroupRoom")) {
    try {
      await port.recordGroupRoom({
        groupId: group.groupId,
        threadId: thread.threadId,
        channelId: thread.channelId,
      });
    } catch (err) {
      console.error("recordGroupRoom failed:", err?.message ?? err);
      return "I opened a thread but could not attach it to the group. An admin can re-link it.";
    }
  }

  await addThreadMember({
    botToken: config.botToken,
    threadId: thread.threadId,
    userId: snowflake,
  });

  await postThreadMessage({
    botToken: config.botToken,
    threadId: thread.threadId,
    content: [
      `**${group.name}** — a feedback group.`,
      "Everyone here brings one thing they want looked at. Use `/group members` to see what the others brought,",
      siteUrl ? `and your dashboard at ${siteUrl}/dashboard to pair up and write feedback.` : "and the site to pair up and write feedback.",
    ].join(" "),
  });

  return `Room opened: <#${thread.threadId}>.`;
}

async function admitToRoom({ config, threadId, snowflake, displayName }) {
  if (!config?.botToken || !threadId) return null;

  const added = await addThreadMember({ botToken: config.botToken, threadId, userId: snowflake });
  if (!added.ok) return null;

  await postThreadMessage({
    botToken: config.botToken,
    threadId,
    content: `${displayName ?? "A new member"} joined the group.`,
  });

  return `You are in the room: <#${threadId}>.`;
}

// ── Subcommands ─────────────────────────────────────────────────────────────

async function createGroup({ member, options, port, config, siteUrl, user }) {
  const asset = await pickAsset({
    port,
    userId: member.userId,
    requested: options.asset,
    commandHint: "`/group create`",
    siteUrl,
  });
  if (asset.message) return asset.message;

  const created = await port.createGroup({
    userId: member.userId,
    name: options.name,
    assetId: asset.assetId,
    kind: "feedback",
    // The locked decision: a group inherits its creator's entry cohort. A
    // member with no track set yet gets a group with no track, which the
    // recommender simply does not filter on.
    track: member.track ?? null,
    visibility: options.visibility ?? "private",
    maxMembers: options.size ?? null,
  });

  const lines = [`**${created.name ?? options.name}** created — you have the first seat.`];

  const room = await openRoom({
    port,
    config,
    group: { groupId: created.groupId, name: created.name ?? options.name },
    snowflake: user.id,
    siteUrl,
  });
  if (room) lines.push(room);

  if (created.visibility === "private") {
    lines.push("It is private, so invite people with `/group invite` — `/group recommend` suggests who.");
  } else {
    lines.push("Others can find it with `/group discover`.");
  }

  return clamp(lines.join(" "));
}

async function listGroups({ member, port, siteUrl }) {
  const groups = await myGroups(port, member.userId);
  if (groups === null) return "This install cannot list groups from Discord.";
  return formatMyGroups(groups, { siteUrl });
}

async function discoverGroups({ member, port }) {
  if (!hasOperation(port, "discoverGroups")) {
    return "This install cannot list discoverable groups from Discord.";
  }
  return formatDiscoverable(await port.discoverGroups({ userId: member.userId, limit: 15 }));
}

async function joinGroup({ member, options, port, config, siteUrl, user }) {
  if (!hasOperation(port, "discoverGroups")) {
    return "This install cannot look up joinable groups from Discord.";
  }

  // Resolved against the discoverable list, not the member's own: joining is
  // the one case where the group is by definition not one of theirs yet.
  const open = await port.discoverGroups({ userId: member.userId, limit: 50 });
  const picked = pickGroup({
    groups: open,
    requested: options.group,
    commandHint: "`/group join`",
    noneMessage: "No groups are open to join right now. `/group create name:<name>` starts one.",
  });

  if (picked.message) {
    // discoverable_groups omits every room the member already has an active,
    // invited or requested row in. So before reporting that no such group is
    // open, check whether the reason it is absent is that they are already
    // in it — otherwise asking to join twice reads as "that group is gone".
    const mine = await myGroups(port, member.userId);
    const already = resolveGroupByName({ groups: mine ?? [], requested: options.group });
    if (already.status === "resolved") return describeExistingRelationship(already.group);
    return picked.message;
  }

  const asset = await pickAsset({
    port,
    userId: member.userId,
    requested: options.asset,
    commandHint: "`/group join`",
    siteUrl,
  });
  if (asset.message) return asset.message;

  const result = await port.joinGroup({
    userId: member.userId,
    groupId: picked.group.groupId,
    assetId: asset.assetId,
  });

  const lines = [describeJoin(result, { groupName: picked.group.name })];

  if (result.status === "joined") {
    // The thread id is only exposed by my_groups, and the member was not in
    // the group when the list above was fetched — so this is read after the
    // write rather than before it.
    const mine = await myGroups(port, member.userId);
    const row = (mine ?? []).find((g) => g.groupId === picked.group.groupId);
    const room = await admitToRoom({
      config,
      threadId: row?.discordThreadId,
      snowflake: user.id,
      displayName: member.displayName ?? user.handle,
    });
    if (room) lines.push(room);
  }

  return clamp(lines.join(" "));
}

async function respondToInvite({ member, options, port, config, siteUrl, user, accept }) {
  if (!hasOperation(port, "respondToInvite")) {
    return "This install cannot answer invitations from Discord.";
  }

  const groups = await myGroups(port, member.userId);
  const picked = pickGroup({
    groups,
    requested: options.group,
    commandHint: accept ? "`/group accept`" : "`/group decline`",
    filter: (g) => g.myStatus === "invited",
    noneMessage: "You have no open invitations.",
  });
  if (picked.message) return picked.message;

  let assetId = null;
  if (accept) {
    const asset = await pickAsset({
      port,
      userId: member.userId,
      requested: options.asset,
      commandHint: "`/group accept`",
      siteUrl,
    });
    if (asset.message) return asset.message;
    assetId = asset.assetId;
  }

  const result = await port.respondToInvite({
    userId: member.userId,
    groupId: picked.group.groupId,
    accept,
    assetId,
  });

  // Checked rather than assumed: respond_to_group_invite can report 'joined'
  // or 'declined', and a seat that filled up between the list and the write
  // raises instead — which the outer catch turns into the database's own
  // sentence, 'this group filled up before you accepted'.
  if (!accept) {
    return result.status === "declined"
      ? `Declined the invitation to **${picked.group.name}**.`
      : `Could not decline the invitation to **${picked.group.name}**.`;
  }

  if (result.status !== "joined") {
    return `Could not accept the invitation to **${picked.group.name}**.`;
  }

  const lines = [`You are in **${picked.group.name}**.`];
  const room = await admitToRoom({
    config,
    threadId: picked.group.discordThreadId,
    snowflake: user.id,
    displayName: member.displayName ?? user.handle,
  });
  if (room) lines.push(room);

  return clamp(lines.join(" "));
}

async function inviteToGroup({ member, options, port, interaction }) {
  const groups = await myGroups(port, member.userId);
  const picked = pickGroup({
    groups,
    requested: options.group,
    commandHint: "`/group invite`",
    filter: (g) => g.myRole === "owner" && isGroupLive(g),
    noneMessage: "You do not own any open groups. `/group create name:<name>` starts one.",
  });
  if (picked.message) return picked.message;

  // Road 1: a Discord mention. Needs the invitee to have linked, because
  // without member_identities there is no ProofSignals account to invite.
  if (options.member) {
    const target = resolvedUser(interaction, options.member);
    const theirIdentity = await port.resolveMember({
      provider: "discord",
      externalId: target.id,
    });

    if (theirIdentity.status !== "linked") {
      return clamp(
        `<@${target.id}> has not linked their Discord to ProofSignals yet, so there is no account to invite. Ask them to run \`/link\` first.`,
      );
    }

    const result = await port.inviteMember({
      userId: member.userId,
      groupId: picked.group.groupId,
      inviteeUserId: theirIdentity.userId,
      joinedVia: "invite",
    });

    return clamp(
      describeInvite(result, {
        groupName: picked.group.name,
        inviteeName: `<@${target.id}>`,
      }),
    );
  }

  // Road 2: a name out of /group recommend, for a member who is on
  // ProofSignals but not in this server. The recommender is the source of the
  // name, so it is also the only list worth matching against — inviting
  // arbitrary members by typed name is not something Discord should allow.
  if (options.name) {
    if (!hasOperation(port, "recommendMembers")) {
      return "This install cannot look members up by name from Discord. Mention them instead.";
    }

    const candidates = await port.recommendMembers({
      userId: member.userId,
      groupId: picked.group.groupId,
      limit: 25,
    });

    const outcome = matchByName({
      items: candidates,
      requested: options.name,
      nameOf: (c) => c?.displayName ?? c?.publicUsername,
      idOf: (c) => c?.userId,
      autoPickSingle: false,
    });

    if (outcome.status !== "resolved") {
      return clamp(
        [
          `No recommended member matches "${options.name}".`,
          "Run `/group recommend` to see the current suggestions, or mention them with `member:` if they are in this server.",
        ].join(" "),
      );
    }

    const result = await port.inviteMember({
      userId: member.userId,
      groupId: picked.group.groupId,
      inviteeUserId: outcome.item.userId,
      joinedVia: "recommender",
    });

    return clamp(
      describeInvite(result, {
        groupName: picked.group.name,
        inviteeName: outcome.item.displayName ?? outcome.item.publicUsername ?? "that member",
      }),
    );
  }

  return "Tell me who to invite: `member:@them` for someone in this server, or `name:<name>` from `/group recommend`.";
}

async function groupMembers({ member, options, port }) {
  if (!hasOperation(port, "groupRoster")) {
    return "This install cannot read a roster from Discord.";
  }

  const groups = await myGroups(port, member.userId);
  const picked = pickGroup({ groups, requested: options.group, commandHint: "`/group members`" });
  if (picked.message) return picked.message;

  const roster = await port.groupRoster({
    userId: member.userId,
    groupId: picked.group.groupId,
  });

  return formatRoster(roster, { groupName: picked.group.name });
}

async function recommendForGroup({ member, options, port }) {
  const groups = await myGroups(port, member.userId);
  const picked = pickGroup({
    groups,
    requested: options.group,
    commandHint: "`/group recommend`",
    filter: (g) => g.myRole === "owner",
    noneMessage: "Recommendations are for a group you own. `/group create name:<name>` starts one.",
  });
  if (picked.message) return picked.message;

  const rows = await port.recommendMembers({
    userId: member.userId,
    groupId: picked.group.groupId,
    limit: options.limit ?? 5,
  });

  return formatRecommendations(rows, { groupName: picked.group.name });
}

async function leaveGroup({ member, options, port, config, user }) {
  if (!hasOperation(port, "leaveGroup")) {
    return "This install cannot leave a group from Discord.";
  }

  const groups = await myGroups(port, member.userId);
  const picked = pickGroup({
    groups,
    requested: options.group,
    commandHint: "`/group leave`",
    filter: (g) => g.myStatus === "active",
    noneMessage: "You are not an active member of any group.",
  });
  if (picked.message) return picked.message;

  const result = await port.leaveGroup({
    userId: member.userId,
    groupId: picked.group.groupId,
  });

  // Someone who left should stop reading the room.
  if (picked.group.discordThreadId && config?.botToken) {
    await removeThreadMember({
      botToken: config.botToken,
      threadId: picked.group.discordThreadId,
      userId: user.id,
    });
  }

  const lines = [`You left **${picked.group.name}**.`];
  if (result.groupClosed) {
    lines.push("You were the last member, so the group is closed.");
  } else if (result.newOwnerUserId) {
    lines.push("You owned it, so it passed to the longest-standing member.");
  }

  return clamp(lines.join(" "));
}

async function closeGroup({ member, options, port, config }) {
  if (!hasOperation(port, "closeGroup")) {
    return "This install cannot close a group from Discord.";
  }

  const groups = await myGroups(port, member.userId);
  const picked = pickGroup({
    groups,
    requested: options.group,
    commandHint: "`/group close`",
    filter: (g) => g.myRole === "owner" && isGroupLive(g),
    noneMessage: "You do not own any open groups.",
  });
  if (picked.message) return picked.message;

  const result = await port.closeGroup({
    userId: member.userId,
    groupId: picked.group.groupId,
  });

  if (result.status === "already_closed") {
    return `**${picked.group.name}** was already closed.`;
  }

  // Archived, not deleted: the thread is the group's record of itself.
  if (picked.group.discordThreadId && config?.botToken) {
    await archiveThread({
      botToken: config.botToken,
      threadId: picked.group.discordThreadId,
    });
  }

  return `**${picked.group.name}** is closed. The thread is archived, not deleted — the feedback in it stays readable.`;
}

const SUBCOMMANDS = {
  create: createGroup,
  list: listGroups,
  discover: discoverGroups,
  join: joinGroup,
  accept: (args) => respondToInvite({ ...args, accept: true }),
  decline: (args) => respondToInvite({ ...args, accept: false }),
  invite: inviteToGroup,
  members: groupMembers,
  recommend: recommendForGroup,
  leave: leaveGroup,
  close: closeGroup,
};

export async function handleGroup({ interaction, port, config, siteUrl }) {
  const user = interactionUser(interaction);

  // Inline, because it needs no IO: a reply Discord gets immediately.
  if (!user) {
    return { response: ephemeral("Could not read your Discord account. Try the command again.") };
  }

  const sub = subcommandOf(interaction);
  const handler = SUBCOMMANDS[sub];

  if (!handler) {
    return { response: ephemeral(`\`/group ${sub ?? "?"}\` is not a subcommand here.`) };
  }

  const options = optionsOf(interaction);

  return {
    response: deferEphemeral(),
    deferredWork: async () => {
      const member = await port.resolveMember({ provider: "discord", externalId: user.id });

      if (member.status !== "linked") {
        return linkFirstMessage(siteUrl);
      }

      try {
        return await handler({ member, options, port, config, siteUrl, interaction, user });
      } catch (err) {
        // The database's own sentence is the product copy — it names which
        // rule was hit. describeGroupError passes it through and translates
        // only the handful where Discord's next step differs.
        return describeGroupError(err?.message, {
          siteUrl,
          commandHint: `\`/group ${sub}\``,
        });
      }
    },
  };
}

export { SUBCOMMANDS };
