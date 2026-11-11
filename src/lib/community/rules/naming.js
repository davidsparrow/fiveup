// Picking one thing out of a list by the name a member typed.
//
// A chat command has no dropdown: every reference to an asset or a group
// arrives as free text. Both cases want the same judgement — one candidate is
// not a choice, an exact name beats a partial one, and two matches is a
// question rather than a guess — so the judgement lives here once instead of
// drifting apart in two formatters.
//
// Pure: no backend, no chat platform, no JSX.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isUuid(value) {
  return UUID_RE.test(String(value ?? "").trim());
}

// Resolve `requested` against `items`.
//
//   { status: 'none' }                        — nothing to choose from
//   { status: 'resolved',  item }              — one candidate, or one match
//   { status: 'choose',    items }             — several, and nothing asked for
//   { status: 'unknown',   requested, items }  — asked for something absent
//   { status: 'ambiguous', requested, items }  — asked for something plural
//
// `autoPickSingle: false` turns off the "one candidate is not a choice" rule,
// for callers where acting on an unnamed single item would be presumptuous.
export function matchByName({
  items,
  requested,
  nameOf = (item) => item?.name,
  idOf = (item) => item?.id,
  autoPickSingle = true,
} = {}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];

  if (list.length === 0) return { status: "none" };

  const wanted = normalizeName(requested);

  if (!wanted) {
    if (autoPickSingle && list.length === 1) return { status: "resolved", item: list[0] };
    return { status: "choose", items: list };
  }

  // An id, for the case where someone copies one out of a URL on the site.
  if (isUuid(wanted)) {
    const byId = list.find((item) => normalizeName(idOf(item)) === wanted);
    return byId
      ? { status: "resolved", item: byId }
      : { status: "unknown", requested, items: list };
  }

  // An exact name wins outright even when it is also a prefix of another, so
  // someone who owns "Deck" and "Deck v2" can still mean "Deck".
  const exact = list.filter((item) => normalizeName(nameOf(item)) === wanted);
  if (exact.length === 1) return { status: "resolved", item: exact[0] };
  if (exact.length > 1) return { status: "ambiguous", requested, items: exact };

  const partial = list.filter((item) => normalizeName(nameOf(item)).includes(wanted));
  if (partial.length === 1) return { status: "resolved", item: partial[0] };
  if (partial.length > 1) return { status: "ambiguous", requested, items: partial };

  return { status: "unknown", requested, items: list };
}
