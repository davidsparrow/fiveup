// The two tiers, as product configuration.
//
// This replaces the `PLANS` array that used to live in mock-data.js. That
// file is the design prototype's sample data — fake members, fake matches,
// fake listings — and a plan definition is not sample data: it is the thing
// the pricing page promises and the database enforces. Keeping it there made
// three problems easy to miss:
//
//   1. It named three tiers (Sprout / Bloom / Flourish) at $0 / $29 / $79.
//      flourish is retired and there is no Stripe, so two of those cards
//      and all of those prices described something that did not exist.
//   2. The feature bullets restated caps — "6 auto + 6 browse matches",
//      "Up to 5 assets" — as hardcoded strings. `plan_feature_gates` is the
//      only thing that actually limits anyone, so the page could disagree
//      with reality and nobody would find out from the code.
//   3. Nothing tied a tier to a `plan_code`, so there was no way to tell
//      which card a member was actually on.
//
// The split here: **copy lives in this file, numbers live in the database.**
// Caps are read through `public_plan_caps()` and formatted by `formatCap`
// below, so a card cannot drift from what the database enforces. The tier
// definition carries only things a gate row cannot express — the name of the
// room, who it is for, what joining means.
//
// Tiers map to Skool groups:
//   sprout → IndieOps Proof Lab  (free Skool group)
//   bloom  → IndieOps Incubator  (paid Skool group; all-access to the software)
// Skool is the billing system. There is no checkout here, so every CTA is an
// outbound link.

// The real destinations, as defaults rather than env-only: these are public
// URLs printed on a public page, not secrets, so a deploy that forgets an env
// var should still send people to the right place. The env vars stay as the
// override for a staging group or a changed link.
export const SKOOL_FREE_URL = "https://www.skool.com/indieops-proof-lab-2789/about";
export const INCUBATOR_APPLY_URL = "https://indieops.co/incubator/apply";

export function getSkoolUrls() {
  return {
    free: process.env.NEXT_PUBLIC_SKOOL_FREE_URL || SKOOL_FREE_URL,
    paid: process.env.NEXT_PUBLIC_SKOOL_PAID_URL || INCUBATOR_APPLY_URL,
  };
}

export const PLAN_TIERS = [
  {
    planCode: "sprout",
    name: "IndieOps Proof Lab",
    tierLabel: "Sprout",
    audience: "Free Skool group",
    price: "Free",
    priceSub: "to join",
    accent: "teal",
    pitch:
      "The room where founders and operators swap honest feedback on what they are building. Join the group, bring one thing you want looked at, and get matched with someone who can actually judge it.",
    includes: [
      "Honest written feedback from real peers, private by default",
      "Your internal signal score, built only from completed exchanges",
      "Matching that keeps competitors and close contacts apart",
      "The Discord server: Tracks, groups and feedback rooms",
    ],
    ctaLabel: "Join the Proof Lab — free",
    ctaKind: "free",
  },
  {
    planCode: "bloom",
    name: "IndieOps Incubator",
    tierLabel: "Bloom",
    audience: "Paid Skool group",
    price: "$99",
    priceSub: "/ month",
    accent: "orange",
    badge: "All-access",
    pitch:
      "Everything in the Proof Lab with the caps lifted, plus the part that is hard to get anywhere else: an all-access pass to every piece of software IndieOps builds — ProofSignals included, at no extra cost.",
    includes: [
      "All-access pass to every IndieOps software, this one included",
      "Browse and choose who you match with, not just who you are matched to",
      "Publish your proof: a public profile and asset pages that carry your record",
      "Sell into Proof Market and set your own degrees-of-separation",
      "Build-challenge cohorts and the private rooms that come with them",
    ],
    ctaLabel: "Apply to the Incubator",
    ctaKind: "paid",
  },
];

// Which gates appear on a card, in order, and what to call them. A row is
// rendered only when the gate actually comes back from `public_plan_caps()`,
// so the three D2 caps at the end of this list appear by themselves the day
// D2 seeds them — no edit here, no deploy.
export const CAP_ROWS = [
  { key: "auto_matches_per_month", label: "Monthly auto-matches" },
  { key: "browse_matches_per_month", label: "Browse & select matches" },
  { key: "max_concurrent_matchups", label: "Open match-ups at once" },
  { key: "max_concurrent_groups", label: "Open feedback groups" },
  { key: "feedback_groups_per_month", label: "New groups per month" },
  { key: "max_assets", label: "Active assets" },
  { key: "max_channels_per_asset", label: "Channels per asset" },
  { key: "degrees_of_separation_control", label: "Degrees-of-separation control", kind: "degrees" },
  { key: "max_proof_lab_listings", label: "Proof Market listings" },
  { key: "advisory_assets_enabled", label: "Advisory Skills asset type", kind: "boolean" },
  { key: "client_assets_enabled", label: "Manage client assets", kind: "boolean" },
  { key: "require_specific_feedback_types", label: "Require specific feedback types", kind: "boolean" },
  { key: "public_profile_indexing_enabled", label: "Public profile publishing", kind: "boolean" },
  { key: "public_feedback_excerpts_enabled", label: "Publish feedback excerpts", kind: "boolean" },
];

// One gate row → one cell. The rules are the same ones the RPCs apply, so
// what a member reads is what the database will do:
//
//   not enabled, or a limit of 0  → "—"   (the feature is off for this plan)
//   enabled with no limit         → "Unlimited"
//   config.unlimited              → "Unlimited"
//   a degrees gate                → "1°" or "1–3°"
//   anything else                 → the number
export function formatCap(gate, kind) {
  if (!gate) return null;

  if (kind === "boolean") return gate.enabled ? "✓" : "—";

  if (kind === "degrees") {
    if (!gate.enabled) return `${gate.config?.max_degree ?? gate.limit_int ?? 1}° fixed`;
    const max = gate.config?.max_degree ?? gate.limit_int ?? 1;
    return max > 1 ? `1–${max}°` : `${max}°`;
  }

  if (!gate.enabled) return "—";
  if (gate.limit_int === 0) return "—";
  if (gate.config?.unlimited) return "Unlimited";
  if (gate.limit_int === null || gate.limit_int === undefined) return "Unlimited";

  return String(gate.limit_int);
}

// Rows from public_plan_caps() → { [planCode]: { [featureKey]: gate } }.
export function indexCaps(rows) {
  const byPlan = {};
  (rows ?? []).forEach((row) => {
    byPlan[row.plan_code] ??= {};
    byPlan[row.plan_code][row.feature_key] = row;
  });
  return byPlan;
}

// The cap rows that have something to show for a given plan, already
// formatted. Returns [] when the gates could not be read, so the card
// renders its copy and simply omits the table.
//
// Numeric caps always show, including the ones at zero: "Browse & select
// matches — " tells a free member something true and useful about the tier.
//
// Off switches do not. A boolean that is simply absent on this plan would
// add a row saying "—" and nothing else, and seven of those turn the free
// card into a list of denials when it is supposed to be an invitation. The
// paid card carries them as ticks, which is where that information actually
// does some work.
export function capsForPlan(byPlan, planCode) {
  const gates = byPlan?.[planCode];
  if (!gates) return [];

  return CAP_ROWS.map((row) => {
    const value = formatCap(gates[row.key], row.kind);
    if (value === null) return null;
    if (row.kind === "boolean" && value === "—") return null;
    return { label: row.label, value };
  }).filter(Boolean);
}
