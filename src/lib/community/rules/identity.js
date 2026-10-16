// What a linking attempt means, in words, independent of where it happened.
//
// The same outcome has to read the same way in a Discord ephemeral reply and
// on /account, or the two surfaces start disagreeing about the rules. So the
// copy lives with the rules, not with either surface.
//
// Pure: no backend, no chat platform, no JSX.

import { LINK_CODE_TTL_MINUTES, formatLinkCode } from "@/lib/community/rules/link-codes";

export const PROVIDER_LABEL = {
  discord: "Discord",
  skool: "Skool",
};

export function providerLabel(provider) {
  return PROVIDER_LABEL[provider] ?? provider ?? "that account";
}

// The bot issued a code, or found the account already linked.
export function describeIssuedCode(result, { provider = "discord", accountUrl } = {}) {
  const label = providerLabel(provider);

  if (result?.status === "already_linked") {
    return {
      outcome: "already_linked",
      message: `Your ${label} account is already linked to ProofSignals.${
        accountUrl ? ` Your account page is ${accountUrl}.` : ""
      }`,
    };
  }

  if (result?.status !== "issued" || !result?.code) {
    return {
      outcome: "failed",
      message: `Something went wrong issuing your code. Try ${
        provider === "discord" ? "/link" : "linking"
      } again in a minute.`,
    };
  }

  return {
    outcome: "issued",
    code: formatLinkCode(result.code),
    message: [
      `Your one-time code is **${formatLinkCode(result.code)}**.`,
      accountUrl
        ? `Sign in at ${accountUrl} and paste it into the ${label} box.`
        : `Sign in on the site and paste it into the ${label} box.`,
      `It expires in ${LINK_CODE_TTL_MINUTES} minutes and works once.`,
    ].join(" "),
  };
}

// The member redeemed a code, or tried to. Takes the error message the
// database raised, because those messages are the product copy — they say
// which of the two uniqueness rules was hit.
export function describeRedemption({ ok, handle, provider = "discord", errorMessage } = {}) {
  const label = providerLabel(provider);

  if (ok) {
    return {
      outcome: "linked",
      message: handle
        ? `${label} connected as ${handle}.`
        : `${label} connected.`,
    };
  }

  const raw = String(errorMessage ?? "");

  if (/already linked to another/i.test(raw)) {
    return {
      outcome: "claimed_by_other",
      message: `That ${label} account is already linked to a different ProofSignals member. If it is yours, ask an admin to move it.`,
    };
  }

  if (/already linked to a different/i.test(raw)) {
    return {
      outcome: "already_linked_elsewhere",
      message: `Your account is already linked to a different ${label} account. Unlink that one first.`,
    };
  }

  if (/not valid or has expired/i.test(raw)) {
    return {
      outcome: "invalid_code",
      message: `That code is not valid or has expired. Run /link in ${label} again for a fresh one.`,
    };
  }

  if (/suspended/i.test(raw)) {
    return { outcome: "suspended", message: raw };
  }

  return {
    outcome: "failed",
    message: `Could not connect ${label}. ${raw || "Please try again."}`.trim(),
  };
}

// Granting the server role is a separate step from writing the row, and it
// fails for one ordinary reason: the member has not joined the server yet.
export function describeRoleGrant({ granted, reason, inviteUrl } = {}) {
  if (granted) {
    return { outcome: "granted", message: "Member role granted." };
  }

  if (reason === "not_in_guild") {
    return {
      outcome: "not_in_guild",
      message: inviteUrl
        ? `You are linked. Join the server at ${inviteUrl} and your Member role appears automatically.`
        : "You are linked. Join the Discord server and your Member role appears automatically.",
    };
  }

  if (reason === "not_configured") {
    return {
      outcome: "not_configured",
      message: "You are linked. The Discord server is not wired up yet, so there is no role to grant.",
    };
  }

  return {
    outcome: "failed",
    message: "You are linked, but the Member role could not be granted. Run /link again to retry.",
  };
}
