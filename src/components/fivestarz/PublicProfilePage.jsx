"use client";

import Link from "next/link";

import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Av, Card, Pill, Stars } from "@/components/fivestarz/ui";

const FONT_SERIF = "'Fraunces',serif";
const FONT_SANS = "'DM Sans',sans-serif";

function initials(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatMoney(cents) {
  if (cents == null) return null;
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** One-decimal average, neutral framing (no star iconography per spec). */
function formatAvg(avg) {
  if (avg == null) return null;
  return Number(avg).toFixed(1);
}

function SectionHeading({ children, kicker }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {kicker ? <Pill color={T.teal}>{kicker}</Pill> : null}
      <h2
        style={{
          fontFamily: FONT_SERIF,
          fontSize: 26,
          fontWeight: 800,
          color: T.brown,
          margin: kicker ? "12px 0 0" : 0,
          letterSpacing: "-0.02em",
        }}
      >
        {children}
      </h2>
    </div>
  );
}

function StatTile({ value, label, sub }) {
  return (
    <div
      style={{
        flex: "1 1 140px",
        minWidth: 140,
        background: "#fff",
        border: "1.5px solid #F0E8E0",
        borderRadius: 16,
        padding: "20px 18px",
        textAlign: "center",
      }}
    >
      <div style={{ fontFamily: FONT_SERIF, fontSize: 34, fontWeight: 900, color: T.orange, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: 700, color: T.brown, marginTop: 8 }}>
        {label}
      </div>
      {sub ? (
        <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: T.slate, marginTop: 3 }}>{sub}</div>
      ) : null}
    </div>
  );
}

export default function PublicProfilePage({ profile, feedback = [], assets = [], offers = [] }) {
  const isMobile = useIsMobile();

  const excerpts = feedback.filter((f) => f.kind === "excerpt");
  const clips = feedback.filter((f) => f.kind === "clip");

  // Neutral stat framing: counts + averages, no star language. The RPC nulls
  // these out entirely when the owner has show_stats off.
  const feedbackAvg = formatAvg(profile.feedback_rating_avg);
  const feedbackCount = profile.feedback_rating_count;
  const proofLabAvg = formatAvg(profile.proof_lab_rating_avg);
  const proofLabCount = profile.proof_lab_rating_count;
  const hasStats =
    (feedbackAvg != null && feedbackCount > 0) || (proofLabAvg != null && proofLabCount > 0);

  const categories = profile.categories ?? [];
  const sectionPad = isMobile ? "36px 16px" : "48px 32px";

  return (
    <div style={{ background: T.cream }}>
      {/* ── Hero ── */}
      <section
        style={{
          background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`,
          padding: isMobile ? "48px 20px 40px" : "72px 32px 56px",
        }}
      >
        <div
          style={{
            maxWidth: 880,
            margin: "0 auto",
            display: "flex",
            gap: isMobile ? 20 : 28,
            alignItems: isMobile ? "flex-start" : "center",
            flexDirection: isMobile ? "column" : "row",
          }}
        >
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt={`${profile.display_name} logo`}
              style={{ width: 88, height: 88, borderRadius: 20, objectFit: "cover", flexShrink: 0, background: "#fff" }}
            />
          ) : (
            <Av txt={initials(profile.display_name)} size={88} color={T.orange} />
          )}

          <div>
            <h1
              style={{
                fontFamily: FONT_SERIF,
                fontSize: isMobile ? 34 : 46,
                fontWeight: 900,
                color: "#fff",
                margin: 0,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              {profile.display_name}
            </h1>
            <div style={{ fontFamily: FONT_SANS, fontSize: 16, color: T.goldL, fontWeight: 600, marginTop: 6 }}>
              @{profile.public_username}
            </div>
            {profile.location_text ? (
              <div style={{ fontFamily: FONT_SANS, fontSize: 14, color: "#C4A68A", marginTop: 6 }}>
                📍 {profile.location_text}
              </div>
            ) : null}
            {categories.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                {categories.map((c) => (
                  <Pill key={c} color={T.gold} bg={`${T.gold}22`}>
                    {c}
                  </Pill>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        {/* ── About ── */}
        {profile.bio ? (
          <section style={{ padding: sectionPad }}>
            <SectionHeading kicker="About">{profile.display_name}</SectionHeading>
            <p style={{ fontFamily: FONT_SANS, fontSize: 16, color: T.slate, lineHeight: 1.75, margin: 0, maxWidth: 680 }}>
              {profile.bio}
            </p>
          </section>
        ) : null}

        {/* ── Signal / Stats (neutral wording) ── */}
        {hasStats ? (
          <section style={{ padding: sectionPad }}>
            <SectionHeading kicker="Signal">Track record</SectionHeading>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              {feedbackAvg != null && feedbackCount > 0 ? (
                <StatTile
                  value={feedbackAvg}
                  label="Feedback signal"
                  sub={`across ${feedbackCount} ${feedbackCount === 1 ? "response" : "responses"}`}
                />
              ) : null}
              {feedbackCount > 0 ? (
                <StatTile value={feedbackCount} label="Pieces of feedback" sub="from real members" />
              ) : null}
              {proofLabAvg != null && proofLabCount > 0 ? (
                <StatTile
                  value={proofLabAvg}
                  label="Proof Lab signal"
                  sub={`across ${proofLabCount} engaged ${proofLabCount === 1 ? "review" : "reviews"}`}
                />
              ) : null}
              {proofLabCount > 0 ? (
                <StatTile value={proofLabCount} label="Engaged reviews" sub="verified interactions" />
              ) : null}
            </div>
          </section>
        ) : null}

        {/* ── Public feedback excerpts ── */}
        {excerpts.length > 0 ? (
          <section style={{ padding: sectionPad }}>
            <SectionHeading kicker="In their words">What members say</SectionHeading>
            <div style={{ display: "grid", gap: 14 }}>
              {excerpts.map((f, i) => (
                <Card key={`ex-${i}`} sx={{ padding: isMobile ? 20 : 26 }}>
                  {f.stars ? (
                    <div style={{ marginBottom: 12 }}>
                      <Stars n={f.stars} size={16} />
                    </div>
                  ) : null}
                  <p
                    style={{
                      fontFamily: FONT_SERIF,
                      fontSize: 17,
                      fontStyle: "italic",
                      color: T.brown,
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    “{f.body}”
                  </p>
                  <div style={{ marginTop: 14 }}>
                    <Pill color={T.teal}>
                      {f.source === "engaged_review" ? "Engaged review" : "Member feedback"}
                    </Pill>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Public clips ── */}
        {clips.length > 0 ? (
          <section style={{ padding: sectionPad }}>
            <SectionHeading kicker="Clips">Video & audio</SectionHeading>
            <div style={{ display: "grid", gap: 14 }}>
              {clips.map((c, i) => (
                <Card key={`clip-${i}`} sx={{ padding: isMobile ? 18 : 22 }}>
                  <a
                    href={c.media_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      color: T.brown,
                      textDecoration: "none",
                      fontFamily: FONT_SANS,
                      fontWeight: 700,
                      fontSize: 15,
                    }}
                  >
                    <span style={{ fontSize: 28 }}>▶️</span>
                    <span>
                      Watch clip
                      {c.body ? (
                        <span style={{ display: "block", fontWeight: 400, fontSize: 14, color: T.slate, marginTop: 2 }}>
                          {c.body}
                        </span>
                      ) : null}
                    </span>
                  </a>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Public asset highlights ── */}
        {assets.length > 0 ? (
          <section style={{ padding: sectionPad }}>
            <SectionHeading kicker="Work">Public highlights</SectionHeading>
            <div
              style={{
                display: "grid",
                gap: 14,
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2,1fr)",
              }}
            >
              {assets.map((a) => (
                <Link key={a.public_slug} href={`/a/${a.public_slug}`} style={{ textDecoration: "none" }}>
                  <Card sx={{ padding: isMobile ? 20 : 24, height: "100%" }}>
                    <Pill color={T.purple} bg={T.purpleP}>
                      {a.asset_type?.replace(/_/g, " ")}
                    </Pill>
                    <h3
                      style={{
                        fontFamily: FONT_SERIF,
                        fontSize: 19,
                        fontWeight: 800,
                        color: T.brown,
                        margin: "12px 0 8px",
                      }}
                    >
                      {a.name}
                    </h3>
                    {a.description ? (
                      <p
                        style={{
                          fontFamily: FONT_SANS,
                          fontSize: 14,
                          color: T.slate,
                          lineHeight: 1.6,
                          margin: 0,
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {a.description}
                      </p>
                    ) : null}
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Offers / services ── */}
        {offers.length > 0 ? (
          <section style={{ padding: sectionPad, paddingBottom: isMobile ? 48 : 64 }}>
            <SectionHeading kicker="Proof Lab">Offers & services</SectionHeading>
            <div style={{ display: "grid", gap: 14 }}>
              {offers.map((o, i) => {
                const price = formatMoney(o.member_price_cents);
                return (
                  <Card key={`offer-${i}`} sx={{ padding: isMobile ? 20 : 24 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 16,
                        flexDirection: isMobile ? "column" : "row",
                        alignItems: isMobile ? "flex-start" : "center",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {o.category ? <Pill color={T.teal}>{o.category}</Pill> : null}
                          {o.badge ? <Pill color={T.gold} bg={`${T.gold}22`}>{o.badge}</Pill> : null}
                        </div>
                        <h3
                          style={{
                            fontFamily: FONT_SERIF,
                            fontSize: 18,
                            fontWeight: 800,
                            color: T.brown,
                            margin: "10px 0 0",
                          }}
                        >
                          {o.title}
                        </h3>
                        {o.donation_percent ? (
                          <div style={{ fontFamily: FONT_SANS, fontSize: 13, color: T.green, fontWeight: 600, marginTop: 6 }}>
                            ♥ {o.donation_percent}% donated to charity
                          </div>
                        ) : null}
                      </div>
                      {price ? (
                        <div style={{ textAlign: isMobile ? "left" : "right", flexShrink: 0 }}>
                          <div style={{ fontFamily: FONT_SERIF, fontSize: 24, fontWeight: 900, color: T.orange }}>
                            {price}
                          </div>
                          {o.price_unit ? (
                            <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: T.slate }}>{o.price_unit}</div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
            <p style={{ fontFamily: FONT_SANS, fontSize: 13, color: T.slate, marginTop: 16 }}>
              Member pricing shown.{" "}
              <Link href="/proof-lab" style={{ color: T.orange, fontWeight: 700 }}>
                Explore Proof Lab →
              </Link>
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
