import Link from "next/link";

import { T } from "@/lib/fivestarz/theme";

/**
 * Slim disclosure strip shown on public pages that belong to the seeded demo
 * cast (handles in src/lib/fivestarz/demo.js). Does double duty: tells
 * visitors the data is sample content, and routes them back to the guided
 * tour — even when they landed on the page directly.
 */
export default function DemoBanner() {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
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
