"use client";

import Link from "next/link";

import DemoSlideshow from "@/components/fivestarz/DemoSlideshow";
import { useBetaModal } from "@/components/fivestarz/PageShell";
import { Av, Btn, ButtonLink, Card, Pill } from "@/components/fivestarz/ui";
import { DEMO_ASSET_SLUGS } from "@/lib/fivestarz/demo";
import {
  SLIDES_CREATE_ASSET,
  SLIDES_MATCHING,
  SLIDES_FEEDBACK,
  SLIDES_RATE_AND_REQUEST,
  SLIDES_PROOF_LAB,
} from "@/lib/fivestarz/demo-slides";
import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";

const CAST = [
  { handle: "demo-maya", name: "Maya Chen", color: T.orange, goal: "Honing her email-marketing course" },
  { handle: "demo-diego", name: "Diego Ramos", color: T.teal, goal: "Sharpening his SaaS landing page and pitch" },
  { handle: "demo-priya", name: "Priya Shah", color: T.purple, goal: "Selling positioning audits to founders" },
  { handle: "demo-sam", name: "Sam Okafor", color: T.green, goal: "Coaching first-time founders to clarity" },
  { handle: "demo-noor", name: "Noor Haddad", color: T.gold, goal: "Growing her small-batch spice shop" },
];

function initials(name) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function Stop({ n, title, kicker, children, isMobile }) {
  return (
    <section id={`stop-${n}`} style={{ padding: isMobile ? "44px 20px" : "64px 32px", background: n % 2 ? "#fff" : "transparent" }}>
      <div style={{ maxWidth: 1050, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 8 }}>
          <span style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 26 : 34, fontWeight: 900, color: T.orangeL }}>{n}</span>
          <div>
            {kicker ? <div style={{ fontSize: 11, fontWeight: 800, color: T.teal, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif" }}>{kicker}</div> : null}
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 22 : 30, fontWeight: 800, color: T.brown, margin: 0, letterSpacing: "-0.02em" }}>{title}</h2>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

function Lead({ children, isMobile }) {
  return (
    <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: isMobile ? 14 : 16, color: T.slate, lineHeight: 1.65, maxWidth: 720, margin: "0 0 28px" }}>
      {children}
    </p>
  );
}

export default function DemoTourPage() {
  const isMobile = useIsMobile();
  const { openBeta } = useBetaModal();

  return (
    <div style={{ background: T.cream }}>
      {/* ── Tour hero ── */}
      <section style={{ background: `radial-gradient(ellipse at 30% 20%, ${T.orangeP} 0%, ${T.cream} 60%, ${T.tealP} 100%)`, padding: isMobile ? "64px 20px 44px" : "88px 32px 64px", textAlign: "center" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <Pill color={T.gold}>🧪 Demo — sample people, real pages</Pill>
          <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? "clamp(28px,7vw,38px)" : 52, fontWeight: 900, color: T.brown, margin: "18px 0 16px", letterSpacing: "-0.03em", lineHeight: 1.12 }}>
            See ProofSignals in action.<br />
            <span style={{ color: T.orange }}>No signup, nothing fake.</span>
          </h1>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: isMobile ? 14 : 17, color: T.slate, lineHeight: 1.65, maxWidth: 600, margin: "0 auto 28px" }}>
            Follow five sample members through the whole loop — from posting an asset to earning public proof.
            The profile and asset pages you&rsquo;ll visit are live on this site right now.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <ButtonLink href="#stop-1">Start the tour ↓</ButtonLink>
            <Btn v="ghost" onClick={openBeta}>✦ Request Beta Access</Btn>
          </div>
        </div>
      </section>

      {/* ── Stop 1: the cast ── */}
      <Stop n={1} title="Meet the cast" kicker="Five members, one honest network" isMobile={isMobile}>
        <Lead isMobile={isMobile}>
          These five are seeded demo accounts — every match, review, and listing you&rsquo;ll see was created through the
          real product. Tap a card to open a live public profile (a banner will bring you back).
        </Lead>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
          {CAST.map((p) => (
            <Link key={p.handle} href={`/u/${p.handle}`} style={{ textDecoration: "none" }}>
              <Card sx={{ padding: 18, height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Av txt={initials(p.name)} color={p.color} size={42} />
                  <div>
                    <div style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, color: T.brown }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: T.orange, fontFamily: "'DM Sans',sans-serif", fontWeight: 700 }}>@{p.handle}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.5 }}>{p.goal}</div>
                <div style={{ fontSize: 12, color: T.teal, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, marginTop: 10 }}>View live profile →</div>
              </Card>
            </Link>
          ))}
        </div>
      </Stop>

      {/* ── Stop 2: add your asset ── */}
      <Stop n={2} title="Add the thing you want feedback on" kicker="Maya's journey begins" isMobile={isMobile}>
        <Lead isMobile={isMobile}>
          Maya teaches founders email marketing. She adds her course, picks the channels where reviews could
          eventually live, and chooses the feedback formats that actually help her improve it.
        </Lead>
        <DemoSlideshow slides={SLIDES_CREATE_ASSET} label="Add an asset" />
      </Stop>

      {/* ── Stop 3: get matched ── */}
      <Stop n={3} title="Get matched with a peer who gets it" kicker="Reciprocal by design" isMobile={isMobile}>
        <Lead isMobile={isMobile}>
          ProofSignals pairs Maya with Diego — a SaaS founder she has never met (that&rsquo;s checked). He reviews her
          course; she reviews his landing page. Both sides give, both sides get.
        </Lead>
        <DemoSlideshow slides={SLIDES_MATCHING} label="Matching" />
      </Stop>

      {/* ── Stop 4: exchange feedback ── */}
      <Stop n={4} title="Exchange honest, human feedback" kicker="No bots, no favors" isMobile={isMobile}>
        <Lead isMobile={isMobile}>
          Diego actually takes the course, then tells Maya the truth — what&rsquo;s worth the price and what he&rsquo;d cut.
          Here&rsquo;s the kind of feedback that comes back:
        </Lead>
        <Card sx={{ padding: isMobile ? 18 : 24, marginBottom: 28, borderLeft: `4px solid ${T.gold}` }} hover={false}>
          <div style={{ fontSize: 14, color: T.brownM, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.7, fontStyle: "italic" }}>
            &ldquo;The welcome-sequence teardown in module 2 is the best thing here — I rewrote mine the same evening and
            replies doubled. Module 3 drags&hellip; Worth it for module 2 alone.&rdquo;
          </div>
          <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, marginTop: 10 }}>
            ⭐⭐⭐⭐⭐ Diego → Maya, live on <Link href={`/a/${DEMO_ASSET_SLUGS.mayaCourse}`} style={{ color: T.orange }}>her asset page</Link>
          </div>
        </Card>
        <DemoSlideshow slides={SLIDES_FEEDBACK} label="Feedback" />
      </Stop>

      {/* ── Stop 5: rate + take it public ── */}
      <Stop n={5} title="Rate it — and take the best of it public" kicker="Reviews are earned" isMobile={isMobile}>
        <Lead isMobile={isMobile}>
          Maya rates Diego&rsquo;s feedback (quality is reputation here), asks him to post his review to one of her
          channels, and approves her favorite excerpts for her public page. Every step is her choice.
        </Lead>
        <DemoSlideshow slides={SLIDES_RATE_AND_REQUEST} label="Rate & publish" />
      </Stop>

      {/* ── Stop 6: live public proof ── */}
      <Stop n={6} title="The proof is live — go poke it" kicker="These pages exist right now" isMobile={isMobile}>
        <Lead isMobile={isMobile}>
          Everything you just watched produced real, public pages. This is what your future customers would see —
          only the feedback Maya approved, with her reviewers kept anonymous on asset pages.
        </Lead>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ButtonLink href="/u/demo-maya">Maya&rsquo;s public profile →</ButtonLink>
          <ButtonLink href={`/a/${DEMO_ASSET_SLUGS.mayaCourse}`} v="teal">Her course&rsquo;s asset page →</ButtonLink>
          <ButtonLink href={`/a/${DEMO_ASSET_SLUGS.diegoLanding}`} v="ghost">Diego&rsquo;s landing page →</ButtonLink>
        </div>
      </Stop>

      {/* ── Stop 7: proof lab ── */}
      <Stop n={7} title="The Proof Lab: deals with proof attached" kicker="A marketplace of vetted peers" isMobile={isMobile}>
        <Lead isMobile={isMobile}>
          Priya sells her positioning audit at member pricing; Noor hired her after their match and left an engaged
          review. Consultants earn proof, founders get vetted help — the loop feeds itself.
        </Lead>
        <DemoSlideshow slides={SLIDES_PROOF_LAB} label="Proof Lab" />
        <div style={{ marginTop: 24 }}>
          <ButtonLink href="/proof-lab" v="ghost">See the public Proof Lab teaser →</ButtonLink>
        </div>
      </Stop>

      {/* ── Close ── */}
      <section style={{ padding: isMobile ? "56px 20px 72px" : "80px 32px 96px", textAlign: "center", background: `linear-gradient(135deg, ${T.brown} 0%, ${T.brownM} 100%)` }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 26 : 38, fontWeight: 900, color: "#fff", margin: "0 0 14px", letterSpacing: "-0.02em" }}>
            Ready to earn proof the honest way?
          </h2>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: isMobile ? 14 : 16, color: "#E8D8C8", lineHeight: 1.65, marginBottom: 28 }}>
            500 beta seats. 90 days free. Real feedback from people who get what you&rsquo;re building.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Btn v="gold" onClick={openBeta} sz="lg">✦ Request Beta Access</Btn>
            <ButtonLink href="#stop-1" v="ghost" sx={{ color: "#fff", borderColor: "rgba(255,255,255,0.4)" }}>Replay the tour</ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
