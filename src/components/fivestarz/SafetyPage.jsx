"use client";

import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Btn, Card, Pill } from "@/components/fivestarz/ui";
import { useBetaModal } from "@/components/fivestarz/PageShell";

const AI_ALLOWED = [
  "Generating asset listing drafts from your inputs",
  "Detecting and suggesting the right asset category",
  "Framing your target audience clearly",
  "Suggesting useful feedback lenses (clarity, trust, pricing, etc.)",
  "Checking listing quality and flagging vague descriptions",
  "Clustering themes across human feedback you've received",
  "Extracting action items from human feedback",
  "Detecting contradictions in feedback patterns",
];

const AI_BLOCKED = [
  "Writing feedback on behalf of reviewers",
  "Auto-rating assets as if a human reviewed them",
  "Drafting public testimonials or endorsements",
  "Generating reciprocal-review prompts",
  "Optimizing flows that could manipulate external engagement",
  "Creating fake reviews or synthetic praise",
];

const PRIVACY_DEFAULTS = [
  { label: "All feedback", value: "Private by default" },
  { label: "Asset listings", value: "Member-only by default" },
  { label: "Profile page", value: "Private until you publish" },
  { label: "Public indexing", value: "Off until you opt in" },
  { label: "Video feedback", value: "Private — explicit approval to share" },
  { label: "Feedback excerpts", value: "Private — approval required to publish" },
];

export default function SafetyPage() {
  const isMobile = useIsMobile();
  const { openBeta } = useBetaModal();

  return (
    <div style={{ background: T.cream }}>
      {/* Hero */}
      <section style={{ background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`, padding: isMobile ? "48px 20px 40px" : "72px 32px 56px", textAlign: "center" }}>
        <Pill color={T.teal}>Trust & Safety</Pill>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 38 : 56, fontWeight: 900, color: "#fff", margin: "16px 0 16px", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          Built to be<br /><span style={{ color: T.gold }}>worthy of your trust.</span>
        </h1>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: isMobile ? 16 : 18, color: "#C4A68A", maxWidth: 560, margin: "0 auto", lineHeight: 1.65 }}>
          ProofSignals is designed from the ground up to protect honest feedback, keep private things private, and make manipulation structurally difficult.
        </p>
      </section>

      {/* Privacy by default */}
      <section style={{ padding: isMobile ? "40px 16px" : "56px 32px", background: "#fff" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <Pill color={T.teal}>Privacy by Default</Pill>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 28 : 38, fontWeight: 800, color: T.brown, margin: "12px 0 0", letterSpacing: "-0.02em" }}>Private by default. Public by choice.</h2>
            <p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", maxWidth: 520, margin: "12px auto 0", lineHeight: 1.65 }}>You control exactly what becomes visible, and to whom. Nothing is shared without your explicit decision.</p>
          </div>
          <div style={{ background: T.cream, borderRadius: 20, overflow: "hidden", border: "1.5px solid #F0E8E0" }}>
            {PRIVACY_DEFAULTS.map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: i < PRIVACY_DEFAULTS.length - 1 ? "1px solid #F0E8E0" : "none", background: i % 2 === 0 ? "#fff" : T.cream, gap: 16, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: T.slate }}>{row.label}</span>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: T.teal, background: T.tealP, padding: "4px 12px", borderRadius: 20 }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Boundaries */}
      <section style={{ padding: isMobile ? "40px 16px" : "56px 32px", background: T.cream }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <Pill color={T.purple}>AI Boundaries</Pill>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 28 : 38, fontWeight: 800, color: T.brown, margin: "12px 0 0", letterSpacing: "-0.02em" }}>AI helps. Humans decide.</h2>
            <p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", maxWidth: 520, margin: "12px auto 0", lineHeight: 1.65 }}>AI assists with listing quality and feedback organization. It never writes feedback, authors reviews, or generates praise on anyone&rsquo;s behalf.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: T.green, marginBottom: 14 }}>✅ AI is used for</div>
              {AI_ALLOWED.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "11px 16px", background: T.greenP, borderRadius: 10, marginBottom: 8, fontSize: 13, color: T.brown, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.5 }}>
                  <span style={{ color: T.green, flexShrink: 0 }}>✓</span>{item}
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: T.red, marginBottom: 14 }}>🚫 AI is never used for</div>
              {AI_BLOCKED.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "11px 16px", background: "#FFF5F5", borderRadius: 10, marginBottom: 8, fontSize: 13, color: T.brown, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.5 }}>
                  <span style={{ flexShrink: 0 }}>🚫</span>{item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* Platform design principles */}
      <section style={{ padding: isMobile ? "40px 16px" : "56px 32px", background: "#fff" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <Pill color={T.orange}>How We Prevent Abuse</Pill>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 28 : 34, fontWeight: 800, color: T.brown, margin: "12px 0 0", letterSpacing: "-0.02em" }}>Trust built into the structure</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            {[
              { icon: "🔒", title: "Feedback is private by default", desc: "No feedback is ever public unless you explicitly choose to publish it — and only with the appropriate approval controls." },
              { icon: "🔀", title: "Intelligent matching prevents gaming", desc: "Degrees-of-separation controls, duplicate prevention, and category awareness make manipulation structurally difficult." },
              { icon: "🤖", title: "Automatic phrase detection", desc: "Hard-blocked and soft-flagged language patterns prevent review-swap solicitation and engagement coordination." },
              { icon: "👤", title: "No anonymous feedback", desc: "All feedback is tied to verified member accounts. Identity accountability raises the quality bar for everyone." },
              { icon: "⚖️", title: "FTC-aligned design", desc: "No incentivized posting. No gating. No rewards tied to external review behavior. Designed to comply with FTC disclosure guidelines." },
              { icon: "🛡️", title: "Moderation team", desc: "Human moderators review flagged content, investigate reports, and handle enforcement — AI assists but does not decide." },
            ].map(({ icon, title, desc }) => (
              <Card key={title} sx={{ padding: 22 }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, color: T.brown, marginBottom: 6 }}>{title}</div>
                <div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.6 }}>{desc}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Report abuse */}
      <section style={{ padding: isMobile ? "32px 16px" : "48px 32px", background: T.cream }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <Card sx={{ padding: isMobile ? 24 : 36, border: `2px solid ${T.orange}33` }} hover={false}>
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexDirection: isMobile ? "column" : "row" }}>
              <div style={{ fontSize: 40, flexShrink: 0 }}>🚨</div>
              <div>
                <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown, margin: "0 0 10px" }}>See something? Say something.</h3>
                <p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, margin: "0 0 20px" }}>If you see manipulation attempts, fake feedback, or suspicious behavior, report it directly from the member profile or match panel. Every report is reviewed by a human moderator.</p>
                <Btn v="ghost" sz="sm">Contact Safety Team →</Btn>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: isMobile ? "56px 20px" : "64px 32px", background: T.brown, textAlign: "center" }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <div style={{ fontSize: isMobile ? 32 : 40, marginBottom: 14 }}>🛡️</div>
          <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 26 : 38, fontWeight: 800, color: "#fff", margin: "0 0 14px", letterSpacing: "-0.02em" }}>
            Join a network<br /><span style={{ color: T.gold }}>designed to be trustworthy.</span>
          </h2>
          <p style={{ color: "#C4A68A", fontSize: isMobile ? 15 : 16, lineHeight: 1.65, fontFamily: "'DM Sans',sans-serif", marginBottom: isMobile ? 24 : 32 }}>Private by default. Human-first. AI-assisted only where it helps — never where it harms.</p>
          <Btn sz="lg" v="gold" onClick={openBeta}>✦ Request Beta Access →</Btn>
        </div>
      </section>
    </div>
  );
}
