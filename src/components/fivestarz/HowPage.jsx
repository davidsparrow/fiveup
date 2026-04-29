"use client";

import { useState } from "react";

import { HOW_STEPS, RULES } from "@/lib/fivestarz/mock-data";
import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Btn, Card, Pill } from "@/components/fivestarz/ui";
import { useBetaModal } from "@/components/fivestarz/PageShell";

export default function HowPage() {
  const [tab, setTab] = useState("steps");
  const isMobile = useIsMobile();
  const { openBeta } = useBetaModal();
  const tabs = [["steps", "📋 Steps"], ["matching", "🤝 Matching Logic"], ["advisory", "🧠 Advisory Skills"], ["rules", "⚖️ Rules"], ["roadmap", "🗺️ Feature Roadmap"]];

  return (
    <div style={{ background: T.cream }}>
      <section style={{ padding: isMobile ? "24px 16px 0" : "40px 32px 0", background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)` }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", paddingBottom: isMobile ? 20 : 32 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", padding: "5px 16px", borderRadius: 20, marginBottom: 16 }}>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 800, color: "#C4A68A", textTransform: "uppercase", letterSpacing: "0.1em" }}>Member Guidelines</span>
            </div>
            <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 36 : 52, fontWeight: 900, color: "#fff", margin: "0 0 16px", letterSpacing: "-0.03em" }}>The ProofSignals Way</h1>
            <p style={{ fontSize: 17, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, margin: 0 }}>Human feedback first. Trust built honestly. Public proof earned, never manufactured.</p>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 20, overflowX: "auto", WebkitOverflowScrolling: "touch", justifyContent: isMobile ? "flex-start" : "center", flexWrap: isMobile ? "nowrap" : "wrap" }}>
            {tabs.map(([id, lbl]) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: isMobile ? "10px 14px" : "12px 22px", border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: isMobile ? 12 : 13, borderRadius: "10px 10px 0 0", background: tab === id ? T.cream : "transparent", color: tab === id ? T.brown : "#C4A68A", transition: "all 0.2s", whiteSpace: "nowrap", flexShrink: 0 }}>{lbl}</button>
            ))}
          </div>
        </div>
      </section>

      <div style={{ background: T.cream }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: isMobile ? "32px 16px" : "48px 32px" }}>
          {tab === "steps" && (
            <div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 32, fontWeight: 800, color: T.brown, marginBottom: 36 }}>Step-by-Step Process</h2>
              {HOW_STEPS.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 28, marginBottom: 36, paddingBottom: 36, borderBottom: i < HOW_STEPS.length - 1 ? `1.5px dashed ${T.orangeP}` : "none", alignItems: "flex-start" }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", flexShrink: 0, background: `linear-gradient(135deg,${T.orange} 0%,${T.gold} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 900, color: "#fff" }}>{i + 1}</div>
                  <div style={{ flex: 1 }}><div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}><span style={{ fontSize: 24 }}>{s.icon}</span><h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: T.brown, margin: 0 }}>{s.title}</h3></div><p style={{ fontSize: 16, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, margin: 0 }}>{s.desc}</p></div>
                </div>
              ))}
            </div>
          )}

          {tab === "matching" && (
            <div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 32, fontWeight: 800, color: T.brown, marginBottom: 8 }}>Matching System Logic</h2>
              <p style={{ fontSize: 16, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 32 }}>How ProofSignals pairs members — including the semi-duplicate matching rules.</p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 28 }}>
                {[
                  { plan: "Free Members (Sprout)", color: T.teal, icon: "🌱", pts: ["4 auto-matches / month, randomly assigned", "Category-aware pairing preferred", "Never re-matched unless semi-duplicate eligible (see below)", "Default 1° separation — never matched with anyone in the direct network of a prior match"] },
                  { plan: "Paid Members (Bloom / Flourish)", color: T.orange, icon: "🌸", pts: ["6 auto + 6 browse matches per month", "Browse by asset type, feedback format, plan, and availability", "Set separation 1–3° in Account Preferences", "If browsing to a Free member at their limit, match queues to next month — no credits lost for either party", "Can disable semi-duplicate matching in preferences", "Can choose whether to allow semi-duplicate matches with Free members"] }
                ].map(({ plan, color, icon, pts }) => (
                  <Card key={plan} sx={{ padding: 24 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}><span style={{ fontSize: 28 }}>{icon}</span><div style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: T.brown }}>{plan}</div></div>
                    {pts.map((p, i) => <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}><span style={{ color, flexShrink: 0 }}>✓</span>{p}</div>)}
                  </Card>
                ))}
              </div>
              <div style={{ background: T.goldL + "33", border: `2px solid ${T.gold}55`, borderRadius: 20, padding: 28, marginBottom: 28 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 32, flexShrink: 0 }}>⚡</span>
                  <div>
                    <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown, marginBottom: 12 }}>Semi-Duplicate Matching — Full Rules</h3>
                    <p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 16 }}>Under specific conditions, two members who&rsquo;ve matched before can be re-matched — but only when the system can guarantee they&rsquo;ll exchange on entirely different review channels than their last match.</p>
                    {[
                      { n: 1, title: "Channel availability check", desc: "The system compares both members' available channels against the channels used in their prior match. A semi-duplicate match is only created if both members have at least one unused channel available." },
                      { n: 2, title: "Blocked channels — both sides, no exceptions", desc: "Previously used channels are automatically blocked for both parties this round. Neither member can choose them, regardless of preference. This forces genuine channel diversification and prevents gaming." },
                      { n: 3, title: "Free ↔ Free only (by default)", desc: "Free members are eligible for semi-duplicate matching with other Free members under these conditions. Free members are NOT matched this way with Paid members unless the Paid member explicitly opts in via Account Preferences." },
                      { n: 4, title: "Paid members control their semi-duplicate settings", desc: "Paid members can disable semi-duplicate matching entirely in Settings, or specifically block it only for Free members. The default is ON (allowed). This toggle is available in the Browse Preferences panel." },
                    ].map(({ n, title, desc }) => (
                      <div key={n} style={{ display: "flex", gap: 14, padding: "12px 16px", background: "#fff", borderRadius: 12, marginBottom: 10, alignItems: "flex-start" }}>
                        <span style={{ color: T.gold, fontWeight: 900, fontFamily: "'Fraunces',serif", fontSize: 18, flexShrink: 0 }}>{n}.</span>
                        <div><div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown, marginBottom: 3 }}>{title}</div><div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55 }}>{desc}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: T.brown, marginBottom: 16 }}>🔗 Degrees of Separation (Paid Only)</h3>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 16 }}>
                {[["1°", "Default", "Never matched with someone you've reviewed, or anyone directly in their review network."], ["2°", "Extended", "Extends exclusion two hops out. Great for niche markets where communities overlap."], ["3°", "Max Privacy", "Highly distinct review network. Ideal when everyone in your space knows everyone."]].map(([deg, lbl, desc]) => (
                  <div key={deg} style={{ background: T.cream, borderRadius: 14, padding: 18 }}><div style={{ fontFamily: "'Fraunces',serif", fontSize: 28, fontWeight: 900, color: T.orange, marginBottom: 4 }}>{deg}</div><div style={{ fontWeight: 700, fontSize: 14, color: T.brown, fontFamily: "'DM Sans',sans-serif", marginBottom: 6 }}>{lbl}</div><div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55 }}>{desc}</div></div>
                ))}
              </div>
            </div>
          )}

          {tab === "advisory" && (
            <div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 32, fontWeight: 800, color: T.brown, marginBottom: 8 }}>Advisory & Consulting Skills as Assets</h2>
              <p style={{ fontSize: 16, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 28 }}>Paid members can collect feedback not just on things — but on <em>themselves as professionals</em>. Your knowledge, insight, and expertise are assets other members can genuinely experience and give you honest input on.</p>
              <div style={{ padding: "24px 28px", background: T.purpleP, border: `2px solid ${T.purple}33`, borderRadius: 20, marginBottom: 28 }}>
                <div style={{ display: "flex", gap: 14 }}><span style={{ fontSize: 36, flexShrink: 0 }}>🧠</span><div><h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 800, color: T.purple, marginBottom: 8 }}>What counts as an Advisory Skills asset?</h3><p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65 }}>Any offering where <em>you</em> are the product. Your strategic thinking, coaching, auditing, or consulting — experienced by a peer and reviewed honestly inside the platform. The internal feedback is the primary goal; any public sharing is entirely the reviewer&rsquo;s independent choice.</p></div></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
                {[["💬", "Free 30-Min Consultation", "You give a genuine business growth consultation. The other member gives you structured internal feedback on your thinking, delivery, and value. You give feedback on their business context in return."], ["🎯", "Strategy Session", "A paid or complimentary strategy session. The member gives you candid internal feedback on the clarity and value of your strategic guidance — honest signal you can actually act on."], ["🛠️", "Done-For-You Audit", "You audit their site, funnel, or pitch deck. They give you internal feedback on the quality and actionability of your findings. Real signal from a real engagement."], ["🎓", "Coaching / Mentoring", "A coaching call or mentorship session. The member's honest internal feedback builds your advisory reputation inside ProofSignals — written, structured, or video format."]].map(([icon, title, desc]) => (
                  <div key={title} style={{ padding: 20, background: T.cream, borderRadius: 16 }}><div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: T.brown, marginBottom: 6 }}>{title}</div><div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55 }}>{desc}</div></div>
                ))}
              </div>
              <div style={{ padding: "20px 24px", background: "#fff", borderRadius: 16, border: "1.5px solid #F0E8E0" }}>
                <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: T.brown, marginBottom: 12 }}>Important Notes</h3>
                {["Requires a unique URL for your booking or profile page (e.g., calendly.com/you or yoursite.com/advisory).", "The person experiencing the session gives you internal feedback on your advisory skills. You give feedback on their business context and goals in return.", "Internal feedback stays private by default. If a reviewer independently chooses to share their experience publicly, that is fully their own decision — never expected, never requested.", "Public review platform links (Google, LinkedIn, etc.) may be included on your profile as neutral presence links — not as a feedback destination."].map((n, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}><span style={{ color: T.purple, flexShrink: 0 }}>→</span>{n}</div>
                ))}
              </div>
            </div>
          )}

          {tab === "rules" && (
            <div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 32, fontWeight: 800, color: T.brown, marginBottom: 8 }}>The Rules of the Club</h2>
              <p style={{ fontSize: 16, color: T.slate, fontFamily: "'DM Sans',sans-serif", marginBottom: 36 }}>Breaking these gets you removed. We protect our community fiercely.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div><h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: T.green, marginBottom: 16 }}>✅ Do This</h3>{RULES.filter(r => r.t === "do").map((r, i) => <div key={i} style={{ display: "flex", gap: 12, padding: "12px 16px", background: T.greenP, borderRadius: 12, marginBottom: 10, fontSize: 14, color: T.brown, fontFamily: "'DM Sans',sans-serif" }}><span>{r.icon}</span>{r.text}</div>)}</div>
                <div><h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: T.red, marginBottom: 16 }}>🚫 Never Do This</h3>{RULES.filter(r => r.t === "dont").map((r, i) => <div key={i} style={{ display: "flex", gap: 12, padding: "12px 16px", background: "#FFF5F5", borderRadius: 12, marginBottom: 10, fontSize: 14, color: T.brown, fontFamily: "'DM Sans',sans-serif" }}><span>{r.icon}</span>{r.text}</div>)}</div>
              </div>
              <div style={{ marginTop: 28, padding: "24px 28px", background: T.brown, borderRadius: 18, display: "flex", gap: 20, alignItems: "center" }}>
                <span style={{ fontSize: 36, flexShrink: 0 }}>⚖️</span>
                <div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Legal & Ethical Compliance</div><div style={{ fontSize: 14, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif", lineHeight: 1.6 }}>ProofSignals is designed to comply with FTC guidelines and major platform terms. No fake feedback, no incentivized posting, no engagement swaps. Feedback is private by default. If a reviewer independently chooses to share publicly, that is entirely their decision — never orchestrated or rewarded by the platform.</div></div>
              </div>
            </div>
          )}

          {tab === "roadmap" && (
            <div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 32, fontWeight: 800, color: T.brown, marginBottom: 8 }}>Feature Roadmap</h2>
              <p style={{ fontSize: 16, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 32 }}>We build ProofSignals with our beta members. Here&rsquo;s what&rsquo;s live, in progress, and planned.</p>
              {[
                { phase: "✅ Live in Beta", color: T.green, bg: T.greenP, items: [{ t: "Auto-matching (Free & Paid)", d: "Category-aware pairing with duplicate prevention and degrees-of-separation filtering." }, { t: "Browse & Request (Paid)", d: "Browse members with filters: asset type, feedback format, plan, and availability." }, { t: "Multi-asset support", d: "Paid members can create multiple assets — services, products, content, and advisory skills." }, { t: "Advisory Skills asset type", d: "Paid members list consulting expertise as an asset. Peer members experience and give honest internal feedback on knowledge and value delivered." }, { t: "Feedback form builder", d: "Asset owners control which feedback formats (written, structured categories, video) are allowed or required." }, { t: "Optional public sharing", d: "After feedback is submitted, asset owners may optionally ask if the reviewer would like to share their experience publicly. Reviewers are never obligated or incentivized." }, { t: "Client asset management", d: "Paid members manage assets on behalf of clients and coordinate their feedback collection." }] },
                { phase: "🔨 In Development", color: T.orange, bg: T.orangeP, items: [{ t: "Semi-duplicate matching — Free ↔ Free", d: "When two Free members have new available channels from their last match, the system re-matches them with prior channels automatically blocked on both sides." }, { t: "Semi-duplicate prefs for Paid members", d: "Toggle semi-duplicate matching on/off; optionally block it only for Free members. Default: ON." }, { t: "Degrees of separation settings UI", d: "In-app control for Paid members to adjust separation (1–3°) with trade-off explanations shown." }, { t: "Match history & network graph", d: "Visual representation of your review network as it grows over time." }, { t: "Full feedback status pipeline", d: "Dashboard showing each match: matched → experienced → feedback → post requested → posted." }] },
                { phase: "🗓️ Planned (Q3 2025)", color: T.teal, bg: T.tealP, items: [{ t: "Team accounts (Flourish)", d: "Multiple seats under one plan for agencies and teams." }, { t: "White-label feedback forms", d: "Embed branded forms on your site that route into FiveStarz." }, { t: "Video review support", d: "Record and submit short video testimonials — higher-trust, higher-impact." }, { t: "Review performance analytics", d: "Track channel performance, asset feedback, and overall reputation score." }] },
                { phase: "💡 Under Consideration", color: T.purple, bg: T.purpleP, items: [{ t: "Community trust score", d: "Member reputation based on feedback quality, completion rates, and community standing." }, { t: "Niche communities", d: "Sub-communities for specific verticals (SaaS, food & bev, creative services) with tailored matching." }, { t: "API & Zapier integration", d: "Connect your CRM to auto-kick off review collection when a project closes." }] },
              ].map(({ phase, color, bg, items }) => (
                <div key={phase} style={{ marginBottom: 36 }}>
                  <div style={{ display: "inline-flex", padding: "6px 16px", background: bg, color, borderRadius: 20, fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", marginBottom: 16 }}>{phase}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {items.map((item, i) => (
                      <div key={i} style={{ padding: "14px 18px", background: "#fff", borderRadius: 14, border: "1.5px solid #F0E8E0", display: "flex", gap: 14, alignItems: "flex-start" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 5, flexShrink: 0 }} />
                        <div><div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown, marginBottom: 3 }}>{item.t}</div><div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: T.slate, lineHeight: 1.55 }}>{item.d}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      <section style={{ background: T.brown, padding: "64px 32px", overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", top: -60, right: -60, width: 320, height: 320, borderRadius: "50%", background: T.orange + "18", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -80, left: -40, width: 260, height: 260, borderRadius: "50%", background: T.gold + "14", pointerEvents: "none" }} />
        <div style={{ maxWidth: 840, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: T.gold + "28", border: `1px solid ${T.gold}55`, padding: "5px 16px", borderRadius: 20, marginBottom: 22 }}>
            <span style={{ fontSize: 14 }}>🤫</span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 800, color: T.gold, textTransform: "uppercase", letterSpacing: "0.1em" }}>Unadvertised Member Bonus</span>
          </div>
          <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: "clamp(28px,4vw,46px)", fontWeight: 900, color: "#fff", margin: "0 0 20px", lineHeight: 1.12, letterSpacing: "-0.02em" }}>
            The most helpful members get paid<br /><span style={{ color: T.gold }}>to shape tomorrow&rsquo;s products.</span>
          </h2>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 17, color: "#C4A68A", lineHeight: 1.7, maxWidth: 620, marginBottom: 32 }}>
            Members build an internal signal rating based on the quality of feedback they <em style={{ color: "#FDD07A" }}>give</em> — helpfulness, honesty, and specificity. Top-signal members earn exclusive invitations to participate in <strong style={{ color: "#fff" }}>paid virtual focus groups</strong> for new products coming to market. Real input. Real money.
          </p>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[["✦", "Give great feedback", "Every piece of feedback you give is rated by the person who received it — for clarity, honesty, and usefulness."], ["📈", "Build your signal", "Your internal signal rating rises as your feedback quality is recognized by peers."], ["💵", "Earn paid invites", "Top-signal members are invited to join virtual focus groups — and get paid."]].map(([ic, h, d]) => (
              <div key={h} style={{ flex: "1 1 180px", background: "rgba(255,255,255,0.07)", borderRadius: 16, padding: "20px 22px", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{ic}</div>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{h}</div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#C4A68A", lineHeight: 1.55 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "60px 32px", textAlign: "center", background: T.cream }}>
        <div style={{ maxWidth: 500, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 36, fontWeight: 800, color: T.brown, margin: "0 0 16px" }}>Ready to get honest feedback?</h2>
          <p style={{ fontSize: 16, color: T.slate, fontFamily: "'DM Sans',sans-serif", marginBottom: 28 }}>Join the beta and start building real credibility — the honest way.</p>
          <Btn sz="lg" onClick={openBeta}>✦ Request Beta Access →</Btn>
        </div>
      </section>
    </div>
  );
}
