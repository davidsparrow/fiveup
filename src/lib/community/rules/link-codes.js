// Link-code shape. Pure functions, no backend, no chat platform.
//
// The database generates codes (it owns collision retry and expiry); this
// module owns what a human is allowed to type. Both sides have to agree, so
// the alphabet and the normalisation rules are duplicated deliberately —
// once here and once in public.normalize_member_link_code — and
// verify-phase20.mjs asserts they agree on messy input rather than trusting
// that they do.
//
// Crockford base32: no I, L, O or U. O reads as 0, I and L read as 1,
// case-insensitive, separators ignored. U is left out entirely so no code
// can spell a word somebody has to read aloud.

export const LINK_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const LINK_CODE_LENGTH = 8;
export const LINK_CODE_TTL_MINUTES = 15;

const WELL_FORMED = /^[0-9A-HJKMNP-TV-Z]{8}$/;

// What the member typed → what the database stores. Accepts "fp3k-9h2m",
// "FP3K 9H2M" and "fp3k9h2m" as the same code, and reads a typed O as 0 and
// a typed I or L as 1.
export function normalizeLinkCode(raw) {
  if (typeof raw !== "string") return null;

  const stripped = raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (stripped === "") return null;

  return stripped.replace(/O/g, "0").replace(/[IL]/g, "1");
}

// True only for something that could be a code we issued. Checked before any
// network call so a typo costs nothing.
export function isWellFormedLinkCode(raw) {
  const normalized = normalizeLinkCode(raw);
  return normalized !== null && WELL_FORMED.test(normalized);
}

// How a code is shown to the person who has to retype it.
export function formatLinkCode(code) {
  const normalized = normalizeLinkCode(code);
  if (normalized === null) return "";

  const half = Math.ceil(normalized.length / 2);
  return `${normalized.slice(0, half)}-${normalized.slice(half)}`;
}
