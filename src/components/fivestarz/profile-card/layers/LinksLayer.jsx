import Link from "next/link";

const FONT_SANS = "'DM Sans',sans-serif";

function linkText(link) {
  if (link.label) return link.label;
  try {
    return new URL(link.url).hostname.replace(/^www\./, "");
  } catch {
    return link.url;
  }
}

/** Big tappable buttons: external links, then public assets, then one
 *  pointer at Proof Market when offers exist. The one layer allowed to
 *  scroll as a whole, because five links plus a few assets can exceed a
 *  short phone. */
export default function LinksLayer({ links = [], assets = [], offers = [], resolved }) {
  const { textColor, mutedTextColor, onDark } = resolved;
  const btn = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 56,
    padding: "0 18px",
    borderRadius: 16,
    background: onDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.8)",
    border: `1px solid ${onDark ? "rgba(255,255,255,0.18)" : "rgba(61,43,31,0.08)"}`,
    color: textColor,
    textDecoration: "none",
    fontFamily: FONT_SANS,
    fontWeight: 700,
    fontSize: 15,
  };
  const sub = { display: "block", fontWeight: 500, fontSize: 12, color: mutedTextColor, marginTop: 2 };

  return (
    <div data-no-swipe="" style={{ height: "100%", overflowY: "auto", overscrollBehavior: "contain", padding: "16px 18px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
      {links.map((l, i) => (
        <a key={`l-${i}`} href={l.url} target="_blank" rel="nofollow noopener noreferrer" style={btn}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🔗 {linkText(l)}</span>
          <span aria-hidden="true">↗</span>
        </a>
      ))}
      {assets.map((a) => (
        <Link key={a.public_slug} href={`/a/${a.public_slug}`} style={btn}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
            <span style={sub}>{a.asset_type?.replace(/_/g, " ")}</span>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
      ))}
      {offers.length > 0 ? (
        <Link href="/proof-market" style={btn}>
          <span>
            Offers on Proof Market
            <span style={sub}>{offers.length} {offers.length === 1 ? "offer" : "offers"} · member pricing</span>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}
