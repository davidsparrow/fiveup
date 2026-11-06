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
//         planCode, accountStatus, isDemo, roleGrantedAt }
//     → { status: 'unlinked' }
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
// Four more the D3 command surface needs, implemented but not required of an
// adapter, since a backend with no rooms of its own has nothing to say about
// them: listGroups, groupRoster, closeGroup, recordGroupRoom.
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

export { REQUIRED_OPERATIONS };
