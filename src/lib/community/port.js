// The community port — seam 2 of the standalone-product split.
//
// Everything under src/lib/community/ is chat-platform agnostic. It never
// imports from src/lib/discord/, and the rules in rules/ never import a
// backend either. Discord is one adapter in front of this port; a Slack or
// Skool-native adapter would be another, and a buyer who wants no Discord at
// all still gets the part that took the thinking.
//
// The port is deliberately a plain object of async functions rather than a
// class. An adapter is `{ issueLinkCode, resolveMember, ... }` and nothing
// more, which keeps it mockable in a verify script without a framework.
//
// Operations, as of D1. Each returns a plain object; each throws on a real
// failure rather than returning an error shape, because every caller so far
// wants to turn a throw into one sentence for a human.
//
//   issueLinkCode({ provider, externalId, handle })
//     → { status: 'issued', code, expiresAt }
//     → { status: 'already_linked', userId, roleGrantedAt }
//
//   resolveMember({ provider, externalId })
//     → { status: 'linked', userId, handle, displayName, publicUsername,
//         planCode, accountStatus, track, isDemo, roleGrantedAt }
//     → { status: 'unlinked' }
//     `track` was added in D3: a group inherits its creator's entry cohort,
//     and this is the only member read the bot makes before creating one.
//
//   markRoleGranted({ provider, externalId }) → void
//
// Operations added by D2 (groups and caps). Every one of them names the
// member it is acting for, because the backend resolves a member from the
// session and a bot has no session: a service-role call to the ProofSignals
// adapter passes the member through explicitly. An adapter whose backend
// works the other way is free to ignore the argument.
//
//   createGroup({ userId, name, assetId, kind, track, visibility, maxMembers })
//     → { status: 'created', groupId, kind, name, track, visibility, maxMembers }
//
//   inviteMember({ userId, groupId, inviteeUserId, joinedVia })
//     → { status: 'invited' | 'already_invited' | 'already_member' | 'joined' }
//
//   joinGroup({ userId, groupId, assetId })
//     → { status: 'joined' | 'requested' | 'already_member' | 'already_requested' }
//
//   recommendMembers({ userId, groupId, limit })
//     → [{ userId, displayName, publicUsername, planCode, track, assetId,
//           assetName, assetType, shortestPathDegree, priorMatchCount }]
//
// Four more D2 implemented but did not require of an adapter, since a backend
// with no rooms of its own has nothing to say about them: listGroups,
// groupRoster, closeGroup, recordGroupRoom.
//
// Operations added by D3 (groups in Discord). The first two exist because a
// chat surface has no pickers: it cannot show a dropdown of assets or a
// summary card, so it asks for the list and the summary as data.
//
//   listPairableAssets({ userId })
//     → [{ assetId, name, assetType, createdAt }]
//     The assets assert_pairable_asset would accept. Discord auto-picks when
//     there is exactly one and names them when there are more — there is no
//     default-asset column in this schema to fall back on.
//
//   memberOverview({ userId })
//     → { userId, displayName, publicUsername, planCode, accountStatus,
//         track, isDemo, matchSurface, caps: {...}, usage: {...},
//         pairableAssetCount }
//     Everything /me says, in one round trip.
//
//   discoverGroups({ userId, limit })
//     → [{ groupId, kind, name, track, visibility, status, maxMembers,
//           activeMemberCount, ownerDisplayName, joinsByRequest, canJoin,
//           blockedReason, createdAt }]
//     canJoin / blockedReason are computed by the backend, because the caps
//     that decide them are not readable by a member.
//
//   respondToInvite({ userId, groupId, accept, assetId })
//     → { status: 'joined' | 'declined' }
//
//   leaveGroup({ userId, groupId })
//     → { status: 'left', newOwnerUserId, groupClosed }
//     Reports succession, because leaving can hand the room to someone else
//     or close it outright, and the member who left should be told which.
//
// These four are NOT in REQUIRED_OPERATIONS, for the same reason the D2 four
// are not: an adapter whose backend has no rooms, no assets and no caps still
// implements a coherent product. assertCommunityPort() checks the floor, not
// the ceiling. A handler that needs an optional operation checks for it and
// says so plainly — see hasOperation() below.
//
// D4 adds createPairing (/feedback). Add it here first, so the next adapter
// knows what it owes.

const REQUIRED_OPERATIONS = [
  "issueLinkCode",
  "resolveMember",
  "markRoleGranted",
  "createGroup",
  "inviteMember",
  "joinGroup",
  "recommendMembers",
];

// The operations D3's command surface uses beyond the required floor. Named
// here rather than in the Discord handlers so the list of what an adapter can
// usefully implement lives with the port, not with one of its consumers.
const OPTIONAL_OPERATIONS = [
  "listGroups",
  "groupRoster",
  "closeGroup",
  "recordGroupRoom",
  "listPairableAssets",
  "memberOverview",
  "discoverGroups",
  "respondToInvite",
  "leaveGroup",
];

// Asking before calling. A missing optional operation is a configuration
// fact, not a crash: the handler tells the member that part is not available
// on this install rather than throwing a TypeError into a deferred reply,
// where it would reach them as "Something went wrong on our side".
export function hasOperation(port, name) {
  return typeof port?.[name] === "function";
}

export function assertCommunityPort(port) {
  if (!port || typeof port !== "object") {
    throw new Error("A community port is required.");
  }

  const missing = REQUIRED_OPERATIONS.filter((op) => typeof port[op] !== "function");
  if (missing.length > 0) {
    throw new Error(`Community port is missing: ${missing.join(", ")}.`);
  }

  return port;
}

export { REQUIRED_OPERATIONS, OPTIONAL_OPERATIONS };
