"use client";

import { useState } from "react";

import { PLANS } from "@/lib/fivestarz/mock-data";
import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Btn, Card, FeatureText, Pill } from "@/components/fivestarz/ui";
import { useBetaModal } from "@/components/fivestarz/PageShell";

const FEATURE_TABLE = [
  { feature: "Monthly auto-matches", sprout: "4", bloom: "6", flourish: "6" },
  { feature: "Browse & select matches", sprout: "—", bloom: "6 / month", flourish: "6 / month" },
  { feature: "Active assets", sprout: "1", bloom: "Up to 5", flourish: "Unlimited" },
  { feature: "Feedback formats (written, structured, video)", sprout: "Written only", bloom: "All formats", flourish: "All formats" },
  { feature: "Advisory Skills asset type", sprout: "—", bloom: "✓", flourish: "✓" },
  { feature: "Manage client assets", sprout: "—", bloom: "✓", flourish: "✓" },
  { feature: "Degrees-of-separation control (1–3°)", sprout: "1° default", bloom: "1–3°", flourish: "1–3°" },
  { feature: "Semi-duplicate match settings", sprout: "—", bloom: "✓", flourish: "✓" },
  { feature: "Internal signal reputation score", sprout: "✓", bloom: "✓", flourish: "✓" },
  { feature: "Public profile publishing", sprout: "—", bloom: "✓", flourish: "✓" },
  { feature: "Marketplace listing", sprout: "—", bloom: "✓", flourish: "✓" },
  { feature: "White-label feedback forms", sprout: "—", bloom: "—", flourish: "✓" },
  { feature: "Team seats", sprout: "—", bloom: "—", flourish: "3 users" },
  { feature: "Priority matching", sprout: "—", bloom: "—", flourish: "✓" },
  { feature: "Dedicated support", sprout: "—", bloom: "—", flourish: "✓" },
];

const FAQS = [
  { q: "Is the feedback I receive private?", a: "Yes. All feedback is private by default. You control what, if anything, becomes public. Reviewers can independently choose to share their experience publicly — that is always 100% their own decision." },
  { q: "Can I upgrade or downgrade anytime?", a: "Yes. You can upgrade immediately and downgrade at the end of your billing period. No lock-ins." },
  { q: "What counts as a 'match'?", a: "A match is when two members are paired to experience and give each other honest feedback on their assets. Free members receive 4 auto-matches per month. Paid members get 6 auto + 6 browse-and-select." },
  { q: "Is ProofSignals a review exchange platform?", a: "No. ProofSignals is a trusted founder feedback network. The primary product is honest internal feedback between peers. Any public sharing is always optional and entirely at the discretion of the reviewer — never expected or rewarded." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel anytime from your account settings. You keep access through the end of your billing period." },
  { q: "Are there refunds?", a: "We offer a 7-day refund on first-time paid subscriptions if you haven't used any browse credits. Contact support." },
];

export default function PricingPage() {
  const isMobile = useIsMobile();
  const { openBeta } = useBetaModal();
  const [openFaq, setOpenFaq] = useState(null);

  // Mock Stripe handler — replace with real Stripe checkout session creation
  const handleSubscribe = (planName) => {
    if (planName === "Sprout") { openBeta(); return; }
    // TODO: Replace with real Stripe checkout
    alert(`Stripe checkout coming soon for ${planName}. Use the beta modal to get early access.`);
  };

  return (
    <div style={{ background: T.cream }}>
      {/* Hero */}
      <section style={{ background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`, padding: isMobile ? "48px 20px 40px" : "72px 32px 56px", textAlign: "center" }}>
        <Pill color={T.gold}>Simple, honest pricing</Pill>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 38 : 56, fontWeight: 900, color: "#fff", margin: "16px 0 16px", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          Start free.<br /><span style={{ color: T.gold }}>Unlock more when you&rsquo;re ready.</span>
        </h1>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: isMobile ? 16 : 18, color: "#C4A68A", maxWidth: 520, margin: "0 auto", lineHeight: 1.65 }}>
          Every plan includes honest human feedback. No fake reviews, no engagement swaps — just real signal from real peers.
        </p>
      </section>

      {/* Pricing cards */}
      <section style={{ padding: isMobile ? "48px 16px" : "64px 32px", background: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 24 }}>
            {PLANS.map((p, i) => (
              <div key={i} style={{ background: T.cream, borderRadius: 24, border: `2px solid ${p.badge ? p.color : "#F0E8E0"}`, padding: 36, position: "relative", boxShadow: p.badge ? `0 8px 40px ${p.color}22` : "0 2px 10px rgba(0,0,0,0.05)", transform: (!isMobile && p.badge) ? "scale(1.03)" : "scale(1)" }}>
                {p.badge && <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: p.color, color: "#fff", padding: "4px 18px", borderRadius: 20, fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>{p.badge}</div>}
                <div style={{ fontSize: 13, fontWeight: 800, color: p.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>{p.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 24 }}>
                  <span style={{ fontFamily: "'Fraunces',serif", fontSize: 42, fontWeight: 900, color: T.brown }}>{p.price}</span>
                  <span style={{ fontSize: 14, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{p.sub}</span>
                </div>
                <div style={{ borderTop: "1.5px solid #F0E8E0", paddingTop: 20, marginBottom: 24 }}>
                  {p.features.map((f, j) => (
                    <div key={j} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10, fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>
                      <span style={{ color: p.color, flexShrink: 0 }}>✓</span><FeatureText text={f} />
                    </div>
                  ))}
                </div>
                <Btn
                  v={p.badge ? "primary" : p.price === "Free" ? "teal" : "gold"}
                  sx={{ width: "100%", justifyContent: "center" }}
                  onClick={() => handleSubscribe(p.name)}
                >
                  {p.price === "Free" ? "Start Free" : p.name === "Bloom" ? "Start 14-Day Trial" : "Talk to Us"}
                </Btn>
                {p.price !== "Free" && (
                  <div style={{ marginTop: 10, fontSize: 11, color: T.brownL, fontFamily: "'DM Sans',sans-serif", textAlign: "center" }}>Cancel anytime · No lock-in</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Feature comparison table */}
      <section style={{ padding: isMobile ? "40px 16px" : "64px 32px", background: T.cream }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <Pill color={T.teal}>Full Comparison</Pill>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 26 : 38, fontWeight: 800, color: T.brown, margin: "12px 0 0", letterSpacing: "-0.02em" }}>What&rsquo;s included in each plan</h2>
          </div>
          {/* Horizontally scrollable on mobile */}
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 20, border: "1.5px solid #F0E8E0" }}>
            <div style={{ minWidth: 480 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", background: T.brown, padding: "14px 20px" }}>
                {["Feature", "Sprout", "Bloom", "Flourish"].map((h, i) => (
                  <div key={h} style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 13, color: i === 0 ? "#C4A68A" : i === 2 ? T.orange : "#fff", textAlign: i > 0 ? "center" : "left" }}>{h}</div>
                ))}
              </div>
              {FEATURE_TABLE.map((row, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "14px 20px", borderBottom: i < FEATURE_TABLE.length - 1 ? "1px solid #F0E8E0" : "none", background: i % 2 === 0 ? "#fff" : T.cream }}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: T.slate }}>{row.feature}</div>
                  {[row.sprout, row.bloom, row.flourish].map((v, j) => (
                    <div key={j} style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: v === "—" ? "#CCC4BC" : v === "✓" ? T.green : T.brown, fontWeight: v !== "—" ? 600 : 400, textAlign: "center" }}>{v}</div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: isMobile ? "40px 16px 60px" : "64px 32px 80px", background: "#fff" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <Pill color={T.orange}>Common Questions</Pill>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 28 : 38, fontWeight: 800, color: T.brown, margin: "12px 0 0", letterSpacing: "-0.02em" }}>Pricing FAQ</h2>
          </div>
          {FAQS.map((item, i) => (
            <div key={i} style={{ borderBottom: "1.5px solid #F0E8E0" }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: "100%", textAlign: "left", padding: "20px 0", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 15, color: T.brown }}>{item.q}</span>
                <span style={{ fontSize: 20, color: T.brownL, flexShrink: 0, transition: "transform 0.2s", transform: openFaq === i ? "rotate(45deg)" : "rotate(0)" }}>+</span>
              </button>
              {openFaq === i && (
                <div style={{ paddingBottom: 20, fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.7 }}>{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ padding: isMobile ? "56px 20px" : "72px 32px", background: T.brown, textAlign: "center" }}>
        <div style={{ maxWidth: 540, margin: "0 auto" }}>
          <div style={{ fontSize: isMobile ? 32 : 40, marginBottom: 14 }}>✦</div>
          <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 26 : 40, fontWeight: 800, color: "#fff", margin: "0 0 14px", letterSpacing: "-0.02em" }}>
            Join the beta free.<br /><span style={{ color: T.gold }}>Upgrade when you&rsquo;re ready.</span>
          </h2>
          <p style={{ color: "#C4A68A", fontSize: 16, lineHeight: 1.65, fontFamily: "'DM Sans',sans-serif", marginBottom: 32 }}>First 500 members get free Bloom access for 90 days. No credit card required to start.</p>
          <Btn sz="lg" v="gold" onClick={openBeta}>✦ Request Beta Access →</Btn>
        </div>
      </section>
    </div>
  );
}
