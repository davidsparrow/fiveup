"use client";

import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Card, Pill, ButtonLink } from "@/components/fivestarz/ui";

const FONT_SERIF = "'Fraunces',serif";
const FONT_SANS = "'DM Sans',sans-serif";

function formatDollars(cents) {
  if (!cents || cents <= 0) return null;
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

/**
 * Public, anonymous Proof Lab landing. Describes the marketplace in aggregate
 * only — category counts + headline totals from the anon RPCs. Individual
 * listings stay member-gated; the CTA routes to sign-in.
 */
export default function ProofLabTeaser({ categories = [], stats = null }) {
  const isMobile = useIsMobile();

  const totalListings = stats?.total_active_listings ?? 0;
  const pledged = formatDollars(stats?.total_pledged_cents);
  const categoryCount = categories.length;

  return (
    <div style={{ background: T.cream }}>
      {/* ── Hero ── */}
      <section
        style={{
          background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`,
          padding: isMobile ? "48px 20px 40px" : "72px 32px 56px",
          textAlign: "center",
        }}
      >
        <Pill color={T.gold}>🧪 Members-Only Deals</Pill>
        <h1
          style={{
            fontFamily: FONT_SERIF,
            fontSize: isMobile ? 36 : 52,
            fontWeight: 900,
            color: "#fff",
            margin: "14px 0 12px",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          The Proof Lab
        </h1>
        <p
          style={{
            fontFamily: FONT_SANS,
            fontSize: isMobile ? 16 : 18,
            color: "#C4A68A",
            maxWidth: 580,
            margin: "0 auto",
            lineHeight: 1.65,
          }}
        >
          Members offer exclusive deals on their best services — marketing, design, video, AI, ads, and more.
          Lock in founder-only pricing.
        </p>

        {/* Headline totals */}
        {(totalListings > 0 || pledged) && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: isMobile ? 20 : 40,
              flexWrap: "wrap",
              marginTop: 28,
            }}
          >
            {totalListings > 0 ? (
              <div>
                <div style={{ fontFamily: FONT_SERIF, fontSize: 32, fontWeight: 900, color: T.gold }}>
                  {totalListings.toLocaleString("en-US")}
                </div>
                <div style={{ fontFamily: FONT_SANS, fontSize: 13, color: "#C4A68A" }}>
                  active member {totalListings === 1 ? "deal" : "deals"}
                </div>
              </div>
            ) : null}
            {categoryCount > 0 ? (
              <div>
                <div style={{ fontFamily: FONT_SERIF, fontSize: 32, fontWeight: 900, color: T.gold }}>
                  {categoryCount}
                </div>
                <div style={{ fontFamily: FONT_SANS, fontSize: 13, color: "#C4A68A" }}>categories</div>
              </div>
            ) : null}
            {pledged ? (
              <div>
                <div style={{ fontFamily: FONT_SERIF, fontSize: 32, fontWeight: 900, color: T.gold }}>{pledged}</div>
                <div style={{ fontFamily: FONT_SANS, fontSize: 13, color: "#C4A68A" }}>pledged to charity</div>
              </div>
            ) : null}
          </div>
        )}

        <div style={{ marginTop: 32, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <ButtonLink href="/login?next=/proof-lab" v="gold" sz="lg">
            Sign in to browse deals
          </ButtonLink>
          <ButtonLink href="/signup" v="ghost" sz="lg" sx={{ color: "#fff", borderColor: "#ffffff44" }}>
            Become a member
          </ButtonLink>
        </div>
      </section>

      {/* ── Category counts ── */}
      <section style={{ padding: isMobile ? "40px 16px" : "56px 32px", maxWidth: 960, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 26,
            fontWeight: 800,
            color: T.brown,
            margin: "0 0 20px",
            textAlign: "center",
          }}
        >
          Browse by category
        </h2>

        {categoryCount > 0 ? (
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,1fr)",
            }}
          >
            {categories.map((c) => (
              <Card key={c.category} sx={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 700, color: T.brown }}>
                    {c.category}
                  </span>
                  <span
                    style={{
                      fontFamily: FONT_SANS,
                      fontSize: 13,
                      fontWeight: 800,
                      color: T.orange,
                      background: T.orangeP,
                      borderRadius: 20,
                      padding: "2px 10px",
                      flexShrink: 0,
                    }}
                  >
                    {c.active_listing_count}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: FONT_SANS, fontSize: 15, color: T.slate, textAlign: "center" }}>
            New member deals are landing soon.
          </p>
        )}

        <p style={{ fontFamily: FONT_SANS, fontSize: 14, color: T.slate, textAlign: "center", marginTop: 28 }}>
          Deal details and founder pricing are visible to members.{" "}
          <a href="/login?next=/proof-lab" style={{ color: T.orange, fontWeight: 700 }}>
            Sign in
          </a>{" "}
          to browse.
        </p>
      </section>
    </div>
  );
}
