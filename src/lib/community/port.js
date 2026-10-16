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
// D2 adds createGroup / inviteMember / joinGroup / recommendMembers; D4 adds
// createPairing. Add them here first, so the next adapter knows what it owes.

const REQUIRED_OPERATIONS = ["issueLinkCode", "resolveMember", "markRoleGranted"];

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
