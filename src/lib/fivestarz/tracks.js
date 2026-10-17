// Tracks — the entry cohorts, as copy.
//
// A Track is where a member came in: the starting-point cohort from the Skool
// join poll. The Discord server carries one standing channel per Track
// (#ai-builders, #agency-marketers, #offline-operators, #creators) and D3
// grants a Track role from `user_profiles.track`, which is the column these
// keys are stored in.
//
// One per member, deliberately. Belonging to several rooms at once is what
// `groups` is for — a feedback group now, a challenge cohort from D5 — not a
// second track. Keep the keys in step with the CHECK constraint in
// 20261017120000_phase22_groups_and_caps.sql.

export const TRACKS = [
  {
    key: "ai_builders",
    label: "AI Builders",
    channel: "#ai-builders",
    blurb: "Shipping with models in the loop — agents, copilots, AI-native products.",
  },
  {
    key: "agency_marketers",
    label: "Agency & Marketers",
    channel: "#agency-marketers",
    blurb: "Client work, retainers, campaigns, and the proof that wins the next one.",
  },
  {
    key: "offline_operators",
    label: "Offline Operators",
    channel: "#offline-operators",
    blurb: "Real-world businesses — trades, local services, bricks and mortar.",
  },
  {
    key: "creators",
    label: "Creators",
    channel: "#creators",
    blurb: "Audience-first: content, courses, newsletters, communities.",
  },
];

export const TRACK_LABEL = Object.fromEntries(TRACKS.map((t) => [t.key, t.label]));

export function trackLabel(key) {
  return key ? TRACK_LABEL[key] ?? key : null;
}
