"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { HOW_STEPS, PLANS } from "@/lib/fivestarz/mock-data";
import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Btn, Card, Pill } from "@/components/fivestarz/ui";
import { useBetaModal } from "@/components/fivestarz/PageShell";

export default function HomePageContent() {
  const isMobile = useIsMobile();
  const { openBeta } = useBetaModal();
  const router = useRouter();

  return (
    <div>
      <section style={{ minHeight: "88vh", display: "flex", alignItems: "center", background: `radial-gradient(ellipse at 70% 40%, ${T.orangeP} 0%, ${T.cream} 55%, ${T.tealP} 100%)`, padding: isMobile ? "60px 20px 48px" : "80px 32px 60px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -80, right: -60, width: 400, height: 400, borderRadius: "50%", background: T.gold + "18", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -100, left: -80, width: 500, height: 500, borderRadius: "50%", background: T.teal + "12", pointerEvents: "none" }} />
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 36 : 60, alignItems: "center", width: "100%" }}>
          <div>
            <Pill color={T.teal}>✦ Invite-Only Beta Now Open</Pill>
            <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? "clamp(32px,8vw,48px)" : "clamp(36px,4.5vw,62px)", lineHeight: 1.1, color: T.brown, margin: "20px 0 24px", fontWeight: 900, letterSpacing: "-0.03em" }}>Hone pitches. Prove products.<br />Gather stars.<br /><span style={{ color: T.orange }}>GROW.</span></h1>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: isMobile ? 16 : 19, color: T.slate, lineHeight: 1.65, maxWidth: 480, marginBottom: 0 }}>Exchange valuable feedback with other founders, find powerful wholesale services, <Link href="/how-it-works" style={{ color: T.orange, textDecoration: "underline", fontWeight: 600 }}>gather stars</Link>, beef up your reputation.</p>
            <div style={{ marginTop: 32, display: "flex", gap: 20, flexWrap: "wrap" }}>
              {[["500", "Beta Seats"], ["90", "Days Free Access"], ["0", "When you don't join."]].map(([n, l]) => (
                <div key={l}><div style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 800, color: T.brown }}>{n}</div><div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>{l}</div></div>
              ))}
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", top: -16, left: -16, right: 16, bottom: 16, background: T.gold + "30", borderRadius: 28, transform: "rotate(-2deg)" }} />
            <Card sx={{ padding: 28, position: "relative" }} hover={false}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: T.brown }}>New Match!</div><div style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>Jordan, meet Alex →</div></div>
                <Pill color={T.orange}>Auto-matched</Pill>
              </div>
              <div style={{ display: "flex", gap: 16, padding: "16px 0", borderTop: `1.5px dashed ${T.orangeP}`, borderBottom: `1.5px dashed ${T.orangeP}`, marginBottom: 20 }}>
                <div style={{ flex: 1, background: T.cream, borderRadius: 14, padding: 14 }}><div style={{ fontSize: 11, fontWeight: 700, color: T.brownL, marginBottom: 6, fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" }}>You&rsquo;re reviewing</div><div style={{ fontSize: 15, fontWeight: 700, color: T.brown, fontFamily: "'DM Sans',sans-serif" }}>Alex&rsquo;s UX Studio</div><div style={{ fontSize: 12, color: T.slate, marginTop: 4 }}>alexdesign.co</div></div>
                <div style={{ display: "flex", alignItems: "center", fontSize: 20 }}>⇄</div>
                <div style={{ flex: 1, background: T.tealP, borderRadius: 14, padding: 14 }}><div style={{ fontSize: 11, fontWeight: 700, color: T.teal, marginBottom: 6, fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" }}>Alex reviews</div><div style={{ fontSize: 15, fontWeight: 700, color: T.brown, fontFamily: "'DM Sans',sans-serif" }}>Your Consulting</div><div style={{ fontSize: 12, color: T.slate, marginTop: 4 }}>revflow.co</div></div>
              </div>
              <div style={{ display: "flex", gap: 10 }}><Btn sz="sm" sx={{ flex: 1, justifyContent: "center" }}>Accept</Btn><Btn sz="sm" v="ghost" sx={{ flex: 1, justifyContent: "center" }}>Profile</Btn></div>
              <div style={{ marginTop: 16, padding: "10px 14px", background: T.greenP, borderRadius: 10, fontSize: 12, color: T.green, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>✓ No prior connection · Separation: 2°</div>
            </Card>
          </div>
        </div>
      </section>

      <section style={{ padding: isMobile ? "56px 16px" : "80px 32px", background: "#fff", overflow: "hidden" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}><Pill color={T.teal}>The Process</Pill><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 42, fontWeight: 800, color: T.brown, margin: "12px 0 0", letterSpacing: "-0.02em" }}>How FiveStarz works</h2></div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4,1fr)", gap: isMobile ? 16 : 24 }}>
            {HOW_STEPS.map((s, i) => <Card key={i} sx={{ padding: 28, textAlign: "center" }}><div style={{ fontSize: 11, fontWeight: 800, color: T.orangeL, letterSpacing: "0.08em", fontFamily: "'DM Sans',sans-serif", marginBottom: 10 }}>{s.n}</div><div style={{ fontSize: 36, marginBottom: 12 }}>{s.icon}</div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 700, color: T.brown, marginBottom: 10 }}>{s.title}</div><div style={{ fontSize: 14, color: T.slate, lineHeight: 1.6, fontFamily: "'DM Sans',sans-serif" }}>{s.desc}</div></Card>)}
          </div>
          <div style={{ textAlign: "center", marginTop: 32 }}><Btn v="ghost" onClick={() => router.push("/how-it-works")}>Full Rules & Guidelines →</Btn></div>
        </div>
      </section>

      <section style={{ padding: "80px 32px", background: `linear-gradient(160deg,${T.cream} 0%,${T.warm} 100%)` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}><Pill color={T.orange}>Simple Pricing</Pill><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 42, fontWeight: 800, color: T.brown, margin: "12px 0 0", letterSpacing: "-0.02em" }}>Start free, grow together</h2></div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 24 }}>
            {PLANS.map((p, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 24, border: `2px solid ${p.badge ? p.color : "#F0E8E0"}`, padding: 36, position: "relative", boxShadow: p.badge ? `0 8px 40px ${p.color}22` : "0 2px 10px rgba(0,0,0,0.05)", transform: (!isMobile && p.badge) ? "scale(1.03)" : "scale(1)" }}>
                {p.badge && <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: p.color, color: "#fff", padding: "4px 18px", borderRadius: 20, fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>{p.badge}</div>}
                <div style={{ fontSize: 13, fontWeight: 800, color: p.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>{p.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 24 }}><span style={{ fontFamily: "'Fraunces',serif", fontSize: 42, fontWeight: 900, color: T.brown }}>{p.price}</span><span style={{ fontSize: 14, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{p.sub}</span></div>
                <div style={{ borderTop: "1.5px solid #F0E8E0", paddingTop: 20, marginBottom: 24 }}>{p.features.map((f, j) => <div key={j} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10, fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}><span style={{ color: p.color, flexShrink: 0 }}>✓</span>{f}</div>)}</div>
                <Btn v={p.badge ? "primary" : p.price === "Free" ? "teal" : "gold"} sx={{ width: "100%", justifyContent: "center" }} onClick={openBeta}>{p.price === "Free" ? "Start Free" : p.name === "Bloom" ? "Start 14-Day Trial" : "Talk to Us"}</Btn>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "80px 32px", background: T.brown, textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⭐</div>
          <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 42, fontWeight: 800, color: "#fff", margin: "0 0 16px", letterSpacing: "-0.02em" }}>Join the beta. Build your<br /><span style={{ color: T.gold }}>social proof the right way.</span></h2>
          <p style={{ color: "#C4A68A", fontSize: 17, lineHeight: 1.6, fontFamily: "'DM Sans',sans-serif", marginBottom: 32 }}>First 500 members get free access to Bloom plan for 90 days.</p>
          <Btn sz="lg" v="gold" onClick={openBeta}>✦ Request Beta Access →</Btn>
        </div>
      </section>
    </div>
  );
}

