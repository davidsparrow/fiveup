import Link from "next/link";

import { NAV_HEIGHT, T } from "@/lib/fivestarz/theme";

/**
 * Slim disclosure strip shown on public pages that belong to the seeded demo
 * cast (user_profiles.is_demo, surfaced by the public-read RPCs). Does double
 * duty: tells visitors the data is sample content, and routes them back to
 * the guided tour — even when they landed on the page directly.
 *
 * `inline` drops the sticky positioning for hosts that manage their own
 * layout (the profile card puts it in its top grid row).
 */
export default function DemoBanner({ inline = false }) {
  return (
    <div
      style={{
        position: inline ? "static" : "sticky",
        // SiteNav is sticky at top 0 (zIndex 200) — pin below it, or the nav
        // paints over the banner once the page scrolls.
        top: inline ? undefined : NAV_HEIGHT,
        zIndex: 40,
        background: T.gold,
        color: T.brown,
        textAlign: "center",
        padding: "9px 16px",
        fontFamily: "'DM Sans',sans-serif",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "0.01em",
      }}
    >
      🧪 You&rsquo;re viewing a demo profile with sample data{" "}
      <Link href="/demo" style={{ color: T.brown, textDecoration: "underline", fontWeight: 800, marginLeft: 6 }}>
        ← Back to the tour
      </Link>
    </div>
  );
}
