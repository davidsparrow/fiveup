// Shared display helpers (Phase 14 consolidation of per-page copies).

const AVATAR_COLORS = ["#7C3AED", "#1A9E8F", "#F4A832", "#FF6B35", "#6B4226", "#38A169", "#4A5568", "#A0644A"];

// Up to two uppercase initials from the first two words; "?" when no name.
export function initials(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "?";
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// Stable avatar color derived from the user id.
export function colorForUser(userId) {
  const sum = Array.from(userId || "").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
