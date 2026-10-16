"use client";

// /pricing is a lander that feeds the two Skool groups, not a checkout.
//
// Skool is the billing system, so there is nothing to buy here: the free card
// sends people to the Proof Lab group and the paid card to the Incubator
// waitlist. Both CTAs sit at the bottom of their card, which is where someone
// who has just finished reading the caps is looking.
//
// Caps come in as props, read server-side from `public_plan_caps()`. They are
// never hardcoded here — see the header of src/lib/fivestarz/plans.js for why
// that mattered enough to move.

import { useState } from "react";

import { PLAN_TIERS } from "@/lib/fivestarz/plans";
import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ButtonLink, FeatureText, Pill } from "@/components/fivestarz/ui";

const FAQS = [
  {
    q: "What am I actually joining?",
    a: "A Skool group. The free group is the IndieOps Proof Lab; the paid group is the IndieOps Incubator. ProofSignals is the software the groups run on — it holds your assets, your matches and your feedback record, and your account here is free either way.",
  },
  {
    q: "How does billing work?",
    a: "Through Skool. There is no checkout on this site and no card details here. Joining the paid group lifts your caps on ProofSignals automatically once your membership is linked.",
  },
  {
    q: "What does the all-access pass include?",
    a: "Every piece of software IndieOps builds, ProofSignals included, at no cost on top of the group membership. Incubator members are not paying for a ProofSignals seat separately — they already have one.",
  },
  {
    q: "Is the feedback I receive private?",
    a: "Yes. All feedback is private by default and you control what, if anything, becomes public. A reviewer may independently choose to share their experience publicly — that is always entirely their own decision.",
  },
  {
    q: "What counts as a match?",
    a: "Two members paired to experience each other's work and give honest feedback on it. Both sides bring something to be looked at; a match with nothing on one side is not a match.",
  },
  {
    q: "Is ProofSignals a review-exchange platform?",
    a: "No, and it is built so it cannot become one. The platform never asks for a public review, never suggests one, never compares channels and never rewards one. The product is honest private feedback between peers. If a member chooses to post something publicly off their own back, they may tell us it happened — that is all.",
  },
  {
    q: "Can I leave?",
    a: "Yes. Leave the Skool group whenever you like; your ProofSignals account and your feedback record stay yours, with the free caps.",
  },
];

export default function PricingPage({ capsByPlan = {}, skoolUrls = {} }) {
  const isMobile = useIsMobile();
  const [openFaq, setOpenFaq] = useState(null);

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
        <Pill color={T.gold}>Two rooms, one record</Pill>
        <h1
          style={{
            fontFamily: "'Fraunces',serif",
            fontSize: isMobile ? 36 : 54,
            fontWeight: 900,
            color: "#fff",
            margin: "16px 0 16px",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          Start in the Proof Lab.
          <br />
          <span style={{ color: T.gold }}>Move up when you&rsquo;re ready.</span>
        </h1>
        <p
          style={{
            fontFamily: "'DM Sans',sans-serif",
            fontSize: isMobile ? 16 : 18,
            color: "#C4A68A",
            maxWidth: 580,
            margin: "0 auto",
            lineHeight: 1.65,
          }}
        >
          Both tiers are Skool groups. ProofSignals is the software underneath — it holds your
          assets, your matches and your feedback record, and your account is free either way.
        </p>
      </section>

      {/* ── The two cards ── */}
      <section style={{ padding: isMobile ? "40px 16px" : "64px 32px", background: "#fff" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2,1fr)",
              gap: isMobile ? 20 : 28,
              // Natural heights, not stretch. The free card is shorter, and
              // stretching it to match left a few hundred pixels of void
              // above its CTA — the one button this page most wants clicked.
              // The gap closes on its own as D2's caps are seeded.
              alignItems: "start",
            }}
          >
            {PLAN_TIERS.map((tier) => {
              const accent = T[tier.accent] ?? T.orange;
              const caps = capsByPlan[tier.planCode] ?? [];
              const href = skoolUrls[tier.ctaKind] ?? "https://indieops.co";

              return (
                <div
                  key={tier.planCode}
                  style={{
                    background: T.cream,
                    borderRadius: 24,
                    border: `2px solid ${tier.badge ? accent : "#F0E8E0"}`,
                    padding: isMobile ? 24 : 32,
                    position: "relative",
                    boxShadow: tier.badge ? `0 8px 40px ${accent}22` : "0 2px 10px rgba(0,0,0,0.05)",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {tier.badge ? (
                    <div
                      style={{
                        position: "absolute",
                        top: -14,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: accent,
                        color: "#fff",
                        padding: "4px 18px",
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: "'DM Sans',sans-serif",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tier.badge}
                    </div>
                  ) : null}

                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: accent,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 6,
                      fontFamily: "'DM Sans',sans-serif",
                    }}
                  >
                    {tier.audience} · {tier.tierLabel}
                  </div>

                  <h2
                    style={{
                      fontFamily: "'Fraunces',serif",
                      fontSize: isMobile ? 26 : 30,
                      fontWeight: 900,
                      color: T.brown,
                      margin: "0 0 10px",
                      letterSpacing: "-0.02em",
                      lineHeight: 1.15,
                    }}
                  >
                    {tier.name}
                  </h2>

                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 14 }}>
                    <span
                      style={{
                        fontFamily: "'Fraunces',serif",
                        fontSize: isMobile ? 32 : 38,
                        fontWeight: 900,
                        color: T.brown,
                      }}
                    >
                      {tier.price}
                    </span>
                    <span style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>
                      {tier.priceSub}
                    </span>
                  </div>

                  <p
                    style={{
                      fontFamily: "'DM Sans',sans-serif",
                      fontSize: isMobile ? 14 : 15,
                      color: T.slate,
                      lineHeight: 1.6,
                      margin: "0 0 20px",
                    }}
                  >
                    {tier.pitch}
                  </p>

                  <div style={{ borderTop: "1.5px solid #F0E8E0", paddingTop: 18, marginBottom: 20 }}>
                    {tier.includes.map((line, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "flex-start",
                          marginBottom: 10,
                          fontSize: isMobile ? 13 : 14,
                          color: T.slate,
                          fontFamily: "'DM Sans',sans-serif",
                          lineHeight: 1.5,
                        }}
                      >
                        <span style={{ color: accent, flexShrink: 0 }}>✓</span>
                        <FeatureText text={line} />
                      </div>
                    ))}
                  </div>

                  {/* Caps, straight from plan_feature_gates. New gates appear
                      here on their own as they are seeded. */}
                  {caps.length > 0 ? (
                    <div style={{ borderTop: "1.5px solid #F0E8E0", paddingTop: 18, marginBottom: 20 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: T.brownL,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          marginBottom: 12,
                          fontFamily: "'DM Sans',sans-serif",
                        }}
                      >
                        Caps on this tier
                      </div>
                      <dl style={{ margin: 0 }}>
                        {caps.map((cap) => (
                          <div
                            key={cap.label}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "baseline",
                              gap: 12,
                              padding: "6px 0",
                              borderBottom: "1px solid #F5EDE4",
                              fontFamily: "'DM Sans',sans-serif",
                              fontSize: isMobile ? 13 : 13.5,
                            }}
                          >
                            <dt style={{ color: T.slate, margin: 0 }}>{cap.label}</dt>
                            <dd
                              style={{
                                color: cap.value === "—" ? T.brownL : T.brown,
                                fontWeight: 700,
                                margin: 0,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cap.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}

                  {/* The CTA sits at the bottom of the card, after the caps. */}
                  <div style={{ marginTop: "auto", paddingTop: 4 }}>
                    <ButtonLink
                      href={href}
                      v={tier.ctaKind === "free" ? "teal" : "primary"}
                      sx={{ width: "100%", justifyContent: "center" }}
                    >
                      {tier.ctaLabel}
                    </ButtonLink>
                    <p
                      style={{
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: 12,
                        color: T.brownL,
                        textAlign: "center",
                        margin: "10px 0 0",
                        lineHeight: 1.5,
                      }}
                    >
                      {tier.ctaKind === "free"
                        ? "Opens the Skool group. Free to join, no card."
                        : "Opens the IndieOps waitlist. Skool handles membership and billing."}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <p
            style={{
              fontFamily: "'DM Sans',sans-serif",
              fontSize: 13,
              color: T.brownL,
              textAlign: "center",
              maxWidth: 640,
              margin: isMobile ? "28px auto 0" : "36px auto 0",
              lineHeight: 1.6,
            }}
          >
            Caps are read live from the plan gates this site enforces, so what you see here is what
            the database will actually do.
          </p>
        </div>
      </section>

      {/* ── The one promise worth repeating ── */}
      <section
        style={{
          padding: isMobile ? "40px 20px" : "56px 32px",
          background: T.warm,
          borderTop: "1.5px solid #F0E8E0",
          borderBottom: "1.5px solid #F0E8E0",
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <h2
            style={{
              fontFamily: "'Fraunces',serif",
              fontSize: isMobile ? 22 : 30,
              fontWeight: 800,
              color: T.brown,
              margin: "0 0 14px",
              letterSpacing: "-0.02em",
            }}
          >
            Neither tier buys you reviews
          </h2>
          <p
            style={{
              fontFamily: "'DM Sans',sans-serif",
              fontSize: isMobile ? 14 : 16,
              color: T.slate,
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            This platform never asks you to post a public review, never suggests one, never compares
            channels and never rewards one. Nothing you can pay for changes that. What you get is
            honest private feedback from people who can judge your work — and a record of it that is
            yours.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ padding: isMobile ? "48px 20px" : "64px 32px", background: "#fff" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2
            style={{
              fontFamily: "'Fraunces',serif",
              fontSize: isMobile ? 24 : 34,
              fontWeight: 800,
              color: T.brown,
              margin: "0 0 24px",
              letterSpacing: "-0.02em",
              textAlign: "center",
            }}
          >
            Questions
          </h2>

          {FAQS.map((faq, i) => (
            <div
              key={i}
              style={{
                borderBottom: "1.5px solid #F0E8E0",
                padding: "16px 0",
              }}
            >
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                aria-expanded={openFaq === i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                  width: "100%",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: isMobile ? 15 : 16,
                  fontWeight: 700,
                  color: T.brown,
                }}
              >
                {faq.q}
                <span style={{ color: T.orange, flexShrink: 0, fontSize: 20, lineHeight: 1 }}>
                  {openFaq === i ? "−" : "+"}
                </span>
              </button>
              {openFaq === i ? (
                <p
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: isMobile ? 14 : 15,
                    color: T.slate,
                    lineHeight: 1.7,
                    margin: "12px 0 0",
                  }}
                >
                  {faq.a}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
