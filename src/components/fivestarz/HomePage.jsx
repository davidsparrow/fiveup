"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { HOW_STEPS, PLANS, PROOF_LISTINGS } from "@/lib/fivestarz/mock-data";
import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Av, Btn, Card, FeatureText, Pill } from "@/components/fivestarz/ui";
import { useBetaModal } from "@/components/fivestarz/PageShell";

export default function HomePageContent() {
  const isMobile = useIsMobile();
  const { openBeta } = useBetaModal();
  const router = useRouter();

  return (
    <div>
      {/* ── Hero ── */}
      <section style={{ minHeight: isMobile ? "auto" : "88vh", display: "flex", alignItems: "center", background: `radial-gradient(ellipse at 70% 40%, ${T.orangeP} 0%, ${T.cream} 55%, ${T.tealP} 100%)`, padding: isMobile ? "72px 20px 56px" : "80px 32px 60px", position: "relative", overflow: "hidden" }}>
        {/* Decorative blobs — scaled down on mobile to prevent overflow */}
        <div style={{ position: "absolute", top: isMobile ? -40 : -80, right: isMobile ? -30 : -60, width: isMobile ? 200 : 400, height: isMobile ? 200 : 400, borderRadius: "50%", background: T.gold + "18", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: isMobile ? -50 : -100, left: isMobile ? -40 : -80, width: isMobile ? 260 : 500, height: isMobile ? 260 : 500, borderRadius: "50%", background: T.teal + "12", pointerEvents: "none" }} />
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 40 : 60, alignItems: "center", width: "100%" }}>
          {/* Left: copy */}
          <div>
            <Pill color={T.teal}>✦ Invite-Only Beta Now Open</Pill>
            <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? "clamp(30px,8vw,44px)" : "clamp(36px,4.5vw,62px)", lineHeight: 1.1, color: T.brown, margin: "18px 0 20px", fontWeight: 900, letterSpacing: "-0.03em" }}>Honest feedback from founders<br />and marketers<br /><span style={{ color: T.orange }}>who actually get it.</span></h1>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: isMobile ? 15 : 19, color: T.slate, lineHeight: 1.65, maxWidth: 480, marginBottom: 0 }}>Post your asset, get meaningful human feedback from peers who understand your space. Build trust, and <Link href="/how-it-works" style={{ color: T.orange, textDecoration: "underline", fontWeight: 600 }}>publish public proof</Link> only when you choose.</p>
            {/* Stats — 2×2 grid on mobile */}
            <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, auto)", gap: isMobile ? "12px 16px" : "0 28px" }}>
              {[["500", "Beta Seats"], ["90", "Days Free Access"], ["Human", "Feedback Only"], ["0", "Fake AI reviews."]].map(([n, l]) => (
                <div key={l} style={{ background: isMobile ? "rgba(255,255,255,0.55)" : "transparent", borderRadius: isMobile ? 12 : 0, padding: isMobile ? "10px 14px" : 0 }}>
                  <div style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 22 : 26, fontWeight: 800, color: T.brown }}>{n}</div>
                  <div style={{ fontSize: 11, color: T.brownL, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Right: mock match card */}
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", top: -12, left: isMobile ? 8 : -16, right: isMobile ? -8 : 16, bottom: 12, background: T.gold + "30", borderRadius: 28, transform: "rotate(-2deg)" }} />
            <Card sx={{ padding: isMobile ? 20 : 28, position: "relative" }} hover={false}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? 14 : 20 }}>
                <div>
                  <div style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 16 : 18, fontWeight: 700, color: T.brown }}>New Match!</div>
                  <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>Jordan, meet Alex →</div>
                </div>
                <Pill color={T.orange}>Auto-matched</Pill>
              </div>
              {/* Exchange cards — stack vertically on mobile */}
              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 8 : 16, padding: "14px 0", borderTop: `1.5px dashed ${T.orangeP}`, borderBottom: `1.5px dashed ${T.orangeP}`, marginBottom: isMobile ? 14 : 20 }}>
                <div style={{ flex: 1, background: T.cream, borderRadius: 14, padding: isMobile ? 12 : 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.brownL, marginBottom: 5, fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" }}>You&rsquo;re reviewing</div>
                  <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: T.brown, fontFamily: "'DM Sans',sans-serif" }}>Alex&rsquo;s UX Studio</div>
                  <div style={{ fontSize: 11, color: T.slate, marginTop: 3 }}>alexdesign.co</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{isMobile ? "↕" : "⇄"}</div>
                <div style={{ flex: 1, background: T.tealP, borderRadius: 14, padding: isMobile ? 12 : 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.teal, marginBottom: 5, fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" }}>Alex reviews</div>
                  <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: T.brown, fontFamily: "'DM Sans',sans-serif" }}>Your Consulting</div>
                  <div style={{ fontSize: 11, color: T.slate, marginTop: 3 }}>revflow.co</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn sz="sm" sx={{ flex: 1, justifyContent: "center" }}>Accept</Btn>
                <Btn sz="sm" v="ghost" sx={{ flex: 1, justifyContent: "center" }}>Profile</Btn>
              </div>
              <div style={{ marginTop: 12, padding: "8px 12px", background: T.greenP, borderRadius: 10, fontSize: 11, color: T.green, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>✓ No prior connection · Separation: 2°</div>
            </Card>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section style={{ padding: isMobile ? "56px 20px" : "80px 32px", background: "#fff", overflow: "hidden" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: isMobile ? 28 : 48 }}>
            <Pill color={T.teal}>The Process</Pill>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 26 : 42, fontWeight: 800, color: T.brown, margin: "12px 0 0", letterSpacing: "-0.02em" }}>How ProofSignals works</h2>
          </div>
          {/* Mobile: single column stack. Desktop: 2 cards top row + 3 cards bottom row, both centered */}
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {HOW_STEPS.map((s, i) => (
                <Card key={i} sx={{ padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.orangeL, letterSpacing: "0.08em", fontFamily: "'DM Sans',sans-serif", marginBottom: 6 }}>{s.n}</div>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
                  <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 700, color: T.brown, marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: T.slate, lineHeight: 1.55, fontFamily: "'DM Sans',sans-serif" }}>{s.desc}</div>
                </Card>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Row 1 — 2 cards */}
              <div style={{ display: "flex", gap: 24, justifyContent: "center" }}>
                {HOW_STEPS.slice(0, 2).map((s, i) => (
                  <Card key={i} sx={{ padding: 28, textAlign: "center", flex: "0 0 calc(33.33% - 16px)" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: T.orangeL, letterSpacing: "0.08em", fontFamily: "'DM Sans',sans-serif", marginBottom: 10 }}>{s.n}</div>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>{s.icon}</div>
                    <div style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 700, color: T.brown, marginBottom: 10 }}>{s.title}</div>
                    <div style={{ fontSize: 14, color: T.slate, lineHeight: 1.55, fontFamily: "'DM Sans',sans-serif" }}>{s.desc}</div>
                  </Card>
                ))}
              </div>
              {/* Row 2 — 3 cards */}
              <div style={{ display: "flex", gap: 24, justifyContent: "center" }}>
                {HOW_STEPS.slice(2).map((s, i) => (
                  <Card key={i} sx={{ padding: 28, textAlign: "center", flex: "0 0 calc(33.33% - 16px)" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: T.orangeL, letterSpacing: "0.08em", fontFamily: "'DM Sans',sans-serif", marginBottom: 10 }}>{s.n}</div>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>{s.icon}</div>
                    <div style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 700, color: T.brown, marginBottom: 10 }}>{s.title}</div>
                    <div style={{ fontSize: 14, color: T.slate, lineHeight: 1.55, fontFamily: "'DM Sans',sans-serif" }}>{s.desc}</div>
                  </Card>
                ))}
              </div>
            </div>
          )}
          <div style={{ textAlign: "center", marginTop: isMobile ? 24 : 32 }}>
            <Btn v="ghost" onClick={() => router.push("/how-it-works")}>Full Rules & Guidelines →</Btn>
          </div>
        </div>
      </section>

      {/* ── Proof Lab Marketplace ── */}
      <section style={{ background: `linear-gradient(160deg, ${T.brown} 0%, #1C3A40 100%)`, overflow: "hidden", paddingTop: isMobile ? 56 : 80, paddingBottom: isMobile ? 48 : 72 }}>
        {/* Header + benefits */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "0 20px 40px" : "0 32px 52px", textAlign: "center" }}>
          <Pill color={T.teal} bg={T.teal + "28"}>🧪 Member Marketplace</Pill>
          <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 26 : 42, fontWeight: 900, color: "#fff", margin: "14px 0 16px", letterSpacing: "-0.02em" }}>
            The Proof Lab
          </h2>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: isMobile ? 15 : 18, color: "#C4A68A", lineHeight: 1.65, maxWidth: 580, margin: "0 auto 36px" }}>
            Members offer exclusive deals on their best services — marketing, design, video, AI, ads, and more. Access comes with your membership. Zero middlemen.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: isMobile ? 12 : 20, textAlign: "left" }}>
            {[
              ["💼", "Members-only pricing", "Deals typically 60–80% below retail — offered by founders who understand your world and want long-term relationships, not one-off transactions."],
              ["🤝", "Peer-vetted sellers", "Every listing comes from a verified ProofSignals member with a real feedback history. Quality is earned, not bought."],
              ["🎟️", "Access with your plan", "Sprout members get 1 listing. Bloom gets 3. Flourish gets unlimited. Your marketplace access grows with your plan."],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 16, padding: isMobile ? "16px 18px" : "20px 22px", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(8px)" }}>
                <div style={{ fontSize: isMobile ? 24 : 28, marginBottom: 10 }}>{icon}</div>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 15 : 16, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{title}</div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: isMobile ? 12 : 13, color: "#C4A68A", lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Auto-scrolling listings strip */}
        <style>{"@keyframes proofScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}"}</style>
        <div style={{ overflow: "hidden", marginBottom: isMobile ? 36 : 48, paddingBottom: 4 }}>
          <div style={{ display: "flex", gap: 14, width: "max-content", animation: "proofScroll 55s linear infinite" }}>
            {[...PROOF_LISTINGS, ...PROOF_LISTINGS].map((l, i) => (
              <div key={i} style={{ width: 220, background: "#fff", borderRadius: 16, overflow: "hidden", flexShrink: 0, boxShadow: "0 4px 18px rgba(0,0,0,0.18)" }}>
                <div style={{ height: 3, background: l.color }} />
                <div style={{ padding: "14px 14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <Av txt={l.avatar} color={l.color} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 11, color: T.brown, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.seller}</div>
                      <div style={{ fontSize: 10, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{l.category}</div>
                    </div>
                    {l.badge && <span style={{ fontSize: 9, fontWeight: 700, color: l.color, background: l.color + "18", padding: "2px 6px", borderRadius: 8, fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap", flexShrink: 0 }}>{l.badge}</span>}
                  </div>
                  <div style={{ fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 8, lineHeight: 1.3 }}>{l.title}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 900, color: T.orange }}>{l.members}</span>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#C4B5AD", textDecoration: "line-through" }}>{l.retail}</span>
                  </div>
                  <div style={{ fontSize: 10, color: T.brownL, fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>{l.unit}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center" }}>
          <Btn v="teal" sz="lg" onClick={() => router.push("/proof-lab")}>🧪 Explore the Proof Lab →</Btn>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section style={{ padding: isMobile ? "56px 20px" : "80px 32px", background: `linear-gradient(160deg,${T.cream} 0%,${T.warm} 100%)` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: isMobile ? 28 : 48 }}>
            <Pill color={T.orange}>Simple Pricing</Pill>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 26 : 42, fontWeight: 800, color: T.brown, margin: "12px 0 0", letterSpacing: "-0.02em" }}>Start free, grow together</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: isMobile ? 16 : 24 }}>
            {PLANS.map((p, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 20, border: `2px solid ${p.badge ? p.color : "#F0E8E0"}`, padding: isMobile ? 24 : 36, position: "relative", boxShadow: p.badge ? `0 8px 40px ${p.color}22` : "0 2px 10px rgba(0,0,0,0.05)", transform: (!isMobile && p.badge) ? "scale(1.03)" : "scale(1)" }}>
                {p.badge && <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: p.color, color: "#fff", padding: "4px 18px", borderRadius: 20, fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>{p.badge}</div>}
                <div style={{ fontSize: 12, fontWeight: 800, color: p.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>{p.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: isMobile ? 16 : 24 }}>
                  <span style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 36 : 42, fontWeight: 900, color: T.brown }}>{p.price}</span>
                  <span style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{p.sub}</span>
                </div>
                <div style={{ borderTop: "1.5px solid #F0E8E0", paddingTop: isMobile ? 14 : 20, marginBottom: isMobile ? 16 : 24 }}>
                  {p.features.map((f, j) => (
                    <div key={j} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 9, fontSize: isMobile ? 13 : 14, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>
                      <span style={{ color: p.color, flexShrink: 0 }}>✓</span><FeatureText text={f} />
                    </div>
                  ))}
                </div>
                <Btn v={p.badge ? "primary" : p.price === "Free" ? "teal" : "gold"} sx={{ width: "100%", justifyContent: "center" }} onClick={openBeta}>
                  {p.price === "Free" ? "Start Free" : p.name === "Bloom" ? "Start 14-Day Trial" : "Talk to Us"}
                </Btn>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: isMobile ? "64px 24px" : "80px 32px", background: T.brown, textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ fontSize: isMobile ? 36 : 48, marginBottom: 14 }}>✦</div>
          <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 26 : 42, fontWeight: 800, color: "#fff", margin: "0 0 14px", letterSpacing: "-0.02em" }}>Join the beta. Earn trust<br /><span style={{ color: T.gold }}>the honest way.</span></h2>
          <p style={{ color: "#C4A68A", fontSize: isMobile ? 15 : 17, lineHeight: 1.6, fontFamily: "'DM Sans',sans-serif", marginBottom: isMobile ? 24 : 32 }}>First 500 members get free access to Bloom plan for 90 days. Human feedback only — no fake reviews, no engagement swaps.</p>
          <Btn sz="lg" v="gold" onClick={openBeta}>✦ Request Beta Access →</Btn>
        </div>
      </section>
    </div>
  );
}

