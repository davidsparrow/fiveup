"use client";

import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Btn, Card, Pill } from "@/components/fivestarz/ui";
import { useBetaModal } from "@/components/fivestarz/PageShell";

const RULES_DO = [
  { icon: "✦", text: "Give honest, specific, and actionable feedback based on genuine experience." },
  { icon: "✦", text: "Be respectful, constructive, and professional in all interactions." },
  { icon: "✦", text: "Complete feedback within the agreed timeframe." },
  { icon: "✦", text: "Disclose any relevant conflicts of interest before accepting a match." },
  { icon: "✦", text: "Keep private feedback private — it belongs to both parties." },
  { icon: "✦", text: "Report suspicious activity, manipulation attempts, or abuse to moderation." },
];

const RULES_DONT = [
  { icon: "🚫", text: "Coordinate, request, or exchange votes, likes, upvotes, or reposts." },
  { icon: "🚫", text: "Request or arrange reciprocal review swaps on external platforms." },
  { icon: "🚫", text: "Leave fake, insincere, or AI-generated feedback." },
  { icon: "🚫", text: "Pressure, incentivize, or guilt another member into publicly sharing feedback." },
  { icon: "🚫", text: "Use the platform to solicit engagement (like for like, comment for comment, etc.)." },
  { icon: "🚫", text: "Create multiple accounts or misrepresent your identity." },
  { icon: "🚫", text: "Share another member's private feedback without their consent." },
];

const BLOCKED_PHRASES = [
  "please upvote us", "vote for us", "support swap", "review swap",
  "like for like", "comment for comment", "trade reviews", "trade upvotes",
];

const SOFT_FLAG_PHRASES = [
  "support our launch", "show some love", "help us out", "any support appreciated",
];

export default function CommunityPage() {
  const isMobile = useIsMobile();
  const { openBeta } = useBetaModal();

  return (
    <div style={{ background: T.cream }}>
      {/* Hero */}
      <section style={{ background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`, padding: isMobile ? "48px 20px 40px" : "72px 32px 56px", textAlign: "center" }}>
        <Pill color={T.gold}>Community Rules</Pill>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 38 : 56, fontWeight: 900, color: "#fff", margin: "16px 0 16px", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          The ProofSignals<br /><span style={{ color: T.gold }}>Community Standard</span>
        </h1>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: isMobile ? 16 : 18, color: "#C4A68A", maxWidth: 560, margin: "0 auto", lineHeight: 1.65 }}>
          We protect a space for honest, human feedback. These rules exist to keep that trust intact for every member.
        </p>
      </section>

      {/* Core principle */}
      <section style={{ padding: isMobile ? "40px 16px" : "56px 32px", background: "#fff" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <Card sx={{ padding: isMobile ? 24 : 36 }} hover={false}>
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexDirection: isMobile ? "column" : "row" }}>
              <div style={{ fontSize: 48, flexShrink: 0 }}>⚖️</div>
              <div>
                <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>The Core Rule</h2>
                <p style={{ fontSize: 16, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.7, margin: 0 }}>
                  ProofSignals may be used to exchange honest feedback and build genuine business relationships. It may <strong style={{ color: T.brown }}>not</strong> be used to coordinate votes, likes, reposts, reciprocal engagement, review swaps, or artificial public-review generation of any kind.
                </p>
                <div style={{ marginTop: 16, padding: "12px 16px", background: T.tealP, borderRadius: 10, fontSize: 13, color: T.teal, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>
                  ✓ Neutral links to public pages are allowed when phrased informationally — not as a call to vote or engage.
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Do / Don't */}
      <section style={{ padding: isMobile ? "32px 16px" : "48px 32px", background: T.cream }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <Pill color={T.teal}>Member Guidelines</Pill>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 28 : 38, fontWeight: 800, color: T.brown, margin: "12px 0 0", letterSpacing: "-0.02em" }}>Do this. Not that.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: T.green, marginBottom: 16 }}>✅ Do This</div>
              {RULES_DO.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "14px 18px", background: T.greenP, borderRadius: 12, marginBottom: 10, fontSize: 14, color: T.brown, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55 }}>
                  <span style={{ color: T.green, flexShrink: 0, fontSize: 16 }}>{r.icon}</span>{r.text}
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: T.red, marginBottom: 16 }}>🚫 Never Do This</div>
              {RULES_DONT.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "14px 18px", background: "#FFF5F5", borderRadius: 12, marginBottom: 10, fontSize: 14, color: T.brown, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55 }}>
                  <span style={{ flexShrink: 0 }}>{r.icon}</span>{r.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* Moderation language */}
      <section style={{ padding: isMobile ? "32px 16px" : "48px 32px", background: "#fff" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <Pill color={T.orange}>Automatic Moderation</Pill>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 26 : 34, fontWeight: 800, color: T.brown, margin: "12px 0 0", letterSpacing: "-0.02em" }}>Language we watch for</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
            <div style={{ background: "#FFF5F5", borderRadius: 16, padding: 24, border: "1.5px solid #FECACA" }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 800, fontSize: 12, color: T.red, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Hard Blocked — Instant Flag</div>
              {BLOCKED_PHRASES.map((p, i) => (
                <div key={i} style={{ padding: "8px 12px", background: "#fff", borderRadius: 8, marginBottom: 8, fontSize: 13, color: T.brown, fontFamily: "'DM Sans',sans-serif", border: "1px solid #FECACA" }}>&ldquo;{p}&rdquo;</div>
              ))}
            </div>
            <div style={{ background: T.warm, borderRadius: 16, padding: 24, border: `1.5px solid ${T.gold}55` }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 800, fontSize: 12, color: T.gold, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Soft Flagged — Review Queued</div>
              {SOFT_FLAG_PHRASES.map((p, i) => (
                <div key={i} style={{ padding: "8px 12px", background: "#fff", borderRadius: 8, marginBottom: 8, fontSize: 13, color: T.brown, fontFamily: "'DM Sans',sans-serif", border: `1px solid ${T.gold}44` }}>&ldquo;{p}&rdquo;</div>
              ))}
              <div style={{ marginTop: 10, fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55 }}>Soft flags are reviewed by a moderator. Neutral context is cleared; manipulative intent results in a warning.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Enforcement */}
      <section style={{ padding: isMobile ? "32px 16px" : "48px 32px", background: T.cream }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <Pill color={T.brown}>Enforcement Policy</Pill>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 26 : 34, fontWeight: 800, color: T.brown, margin: "12px 0 0", letterSpacing: "-0.02em" }}>We protect this community fiercely</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 16 }}>
            {[
              { step: "1st violation", icon: "⚠️", color: T.gold, bg: T.warm, desc: "Formal warning issued. Flagged listing or message removed. Member notified with explanation." },
              { step: "2nd violation", icon: "🚫", color: T.red, bg: "#FFF5F5", desc: "Permanent suspension or removal from the platform. No exceptions for coordinated manipulation." },
              { step: "Severe violation", icon: "⛔", color: T.brown, bg: T.cream, desc: "Immediate suspension for egregious manipulation, fraud, or platform abuse — no warning required." },
            ].map(({ step, icon, color, bg, desc }) => (
              <div key={step} style={{ background: bg, borderRadius: 16, padding: 22, border: `1.5px solid ${color}44` }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>{icon}</div>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, color, marginBottom: 8 }}>{step}</div>
                <div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: isMobile ? "56px 20px" : "64px 32px", background: T.brown, textAlign: "center" }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <div style={{ fontSize: isMobile ? 32 : 40, marginBottom: 14 }}>🤝</div>
          <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 26 : 38, fontWeight: 800, color: "#fff", margin: "0 0 14px", letterSpacing: "-0.02em" }}>
            Ready to join a community<br /><span style={{ color: T.gold }}>built on real trust?</span>
          </h2>
          <p style={{ color: "#C4A68A", fontSize: isMobile ? 15 : 16, lineHeight: 1.65, fontFamily: "'DM Sans',sans-serif", marginBottom: isMobile ? 24 : 32 }}>Human feedback only. No games, no swaps, no manipulation.</p>
          <Btn sz="lg" v="gold" onClick={openBeta}>✦ Request Beta Access →</Btn>
        </div>
      </section>
    </div>
  );
}
