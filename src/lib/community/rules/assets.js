// Which asset a member brings to a group, when the surface has no picker.
//
// create_group and join_group both require an asset, and assert_pairable_asset
// refuses a null one with 'bring an asset: a feedback group pairs members by
// what they want reviewed'. The site has a dropdown. Discord has a text
// option and nothing else — and this schema has no default-asset column to
// fall back on, so something has to decide.
//
// The rule: one pairable asset means no question worth asking, several means
// ask by name. Deliberately NOT "pick the newest" — silently entering a
// member into a four-person review of the wrong asset is worse than one extra
// round trip.
//
// Pure: no backend, no chat platform, no JSX.

import { matchByName } from "./naming.js";

export function resolvePairableAsset({ assets, requested } = {}) {
  const outcome = matchByName({
    items: Array.isArray(assets) ? assets.filter((a) => a?.assetId) : [],
    requested,
    nameOf: (a) => a?.name,
    idOf: (a) => a?.assetId,
  });

  // Same statuses, named for assets rather than for items.
  return outcome.status === "resolved"
    ? { status: "resolved", asset: outcome.item }
    : { ...outcome, assets: outcome.items };
}

export function assetLine(asset) {
  const type = asset?.assetType ? ` (${asset.assetType})` : "";
  return `• ${asset?.name ?? "untitled"}${type}`;
}

// The message for every outcome that is not 'resolved'. Takes the command
// hint because /group create and /group join both use this, and a member
// needs to be told which command to re-run.
export function describeAssetChoice(outcome, { siteUrl, commandHint } = {}) {
  const assetsUrl = siteUrl ? `${siteUrl}/account/assets` : null;
  const retry = commandHint ? `Re-run ${commandHint} with \`asset:<name>\`.` : "";

  if (outcome?.status === "none") {
    return {
      outcome: "none",
      message: [
        "You have no asset ready to be reviewed yet.",
        "A feedback group pairs members by what they want reviewed, so you need one first:",
        assetsUrl ? `add one at ${assetsUrl}.` : "add one on the site.",
      ].join(" "),
    };
  }

  if (outcome?.status === "choose") {
    return {
      outcome: "choose",
      message: [
        `You have ${outcome.assets.length} assets, so tell me which one to bring:`,
        ...outcome.assets.map(assetLine),
        retry,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  if (outcome?.status === "ambiguous") {
    return {
      outcome: "ambiguous",
      message: [
        `"${outcome.requested}" matches ${outcome.assets.length} of your assets:`,
        ...outcome.assets.map(assetLine),
        "Use the full name.",
      ].join("\n"),
    };
  }

  if (outcome?.status === "unknown") {
    return {
      outcome: "unknown",
      message: [
        `You have no active asset called "${outcome.requested}". These are the ones you can bring:`,
        ...outcome.assets.map(assetLine),
      ].join("\n"),
    };
  }

  return { outcome: "failed", message: "Could not work out which asset to bring." };
}
