"use client";
import { useState, useEffect, useRef } from "react";

const T = {
  cream: "#FFF8F0", warm: "#FFF3E4",
  orange: "#FF6B35", orangeL: "#FF8C5A", orangeP: "#FFE8D6",
  gold: "#F4A832", goldL: "#FDD07A",
  brown: "#3D2B1F", brownM: "#6B4226", brownL: "#A0644A",
  teal: "#1A9E8F", tealL: "#4DC4B6", tealP: "#D4F5F1",
  slate: "#4A5568", red: "#E53E3E", green: "#38A169", greenP: "#C6F6D5",
  purple: "#7C3AED", purpleP: "#EDE9FE",
};

// ── MOCK DATA ────────────────────────────────────────────────────────────────
const ME = {
  name: "Jordan Rivera", avatar: "JR", plan: "paid", planName: "Bloom",
  matchesUsed: 4, matchesTotal: 12, browseUsed: 2, browseTotal: 6,
  degrees: 2, allowSemiDupeFree: true, allowSemiDupe: true,
  assets: [
    { id: 1, name: "RevFlow Consulting", url: "revflow.co", type: "Service / Consulting", channels: ["Google Business Profile", "Yelp"], reviews: 8, pending: 1, img: "🚀" },
    { id: 2, name: "SaaS Growth Podcast", url: "saasgrowtpod.com/episodes", type: "Content / Podcast / Video", channels: ["Apple Podcasts", "Spotify"], reviews: 3, pending: 0, img: "🎙️" },
    { id: 3, name: "Business Advisory Skills", url: "revflow.co/advisory", type: "Advisory / Consulting Skills", channels: ["Google Business Profile", "LinkedIn"], reviews: 5, pending: 0, img: "🧠" },
  ],
};

const MATCHES = [
  { id: 1, person: "Alex Chen", avatar: "AC", asset: "UX Design Studio", type: "Service / Consulting", status: "feedback_pending", due: "Mar 8", channels: ["Google Business Profile"], color: "#FF6B35" },
  { id: 2, person: "Maya Patel", avatar: "MP", asset: "E-com Growth Newsletter", type: "Content / Podcast / Video", status: "awaiting_post", due: "Mar 5", channels: ["Substack", "LinkedIn"], color: "#1A9E8F" },
  { id: 3, person: "Sam Torres", avatar: "ST", asset: "Shopify Plugin", type: "Digital Product / SaaS", status: "posted", due: "Feb 28", channels: ["Shopify App Store"], color: "#F4A832", postedCh: "Shopify App Store", myFbRating: 4 },
  { id: 4, person: "Priya Nair", avatar: "PN", asset: "Brand Strategy Session", type: "Advisory / Consulting Skills", status: "posted", due: "Feb 20", channels: ["Google Business Profile", "Yelp"], color: "#6B4226", postedCh: "Google Business Profile", myFbRating: null },
  { id: 5, person: "Chris Wu", avatar: "CW", asset: "Freelance Dev Services", type: "Service / Consulting", status: "matched", due: "Mar 12", channels: ["Clutch.co", "Google Business Profile"], color: "#38A169" },
];

const MEMBERS = [
  {
    id: 101, name: "Tariq Osman", avatar: "TO", plan: "paid", planName: "Bloom", loc: "Austin, TX", since: "Jan 2025",
    assets: [{ name: "Growth Copywriting Studio", type: "Advisory / Consulting Skills", channels: ["Google Business Profile", "Clutch.co"], url: "tariqwrites.com" }, { name: "Email Mastery Course", type: "Digital Product / SaaS", channels: ["Trustpilot", "G2"], url: "tariqwrites.com/course" }],
    formats: ["Star Rating", "Written Review", "Structured Categories"], rating: 4.9, exchanges: 12, credits: 4, creditsTotal: 12, prev: null, color: "#7C3AED",
    bio: "Copywriter & growth consultant helping SaaS founders double their conversion rates."
  },
  {
    id: 102, name: "Lena Fischer", avatar: "LF", plan: "paid", planName: "Flourish", loc: "Berlin, DE", since: "Nov 2024",
    assets: [{ name: "UX Audit Service", type: "Service / Consulting", channels: ["Google Business Profile", "Clutch.co", "LinkedIn"], url: "lenauxdesign.de" }],
    formats: ["Star Rating", "Written Review", "Video / Audio"], rating: 5.0, exchanges: 21, credits: 0, creditsTotal: 12, prev: null, color: "#1A9E8F",
    bio: "UX designer with 8 years experience. I audit digital products and help founders reduce churn."
  },
  {
    id: 103, name: "Devon Park", avatar: "DP", plan: "free", planName: "Sprout", loc: "Chicago, IL", since: "Feb 2025",
    assets: [{ name: "Handmade Leather Goods", type: "E-commerce Store", channels: ["Google Business Profile", "Yelp"], url: "devonleather.com" }],
    formats: ["Star Rating", "Written Review"], rating: 4.7, exchanges: 6, credits: 2, creditsTotal: 4, prev: null, color: "#F4A832",
    bio: "Artisan leather goods maker. Every piece is handmade and built to last a lifetime."
  },
  {
    id: 104, name: "Simone Adler", avatar: "SA", plan: "paid", planName: "Bloom", loc: "Miami, FL", since: "Dec 2024",
    assets: [{ name: "Founders Podcast", type: "Content / Podcast / Video", channels: ["Apple Podcasts", "Spotify", "LinkedIn"], url: "founderspodcast.fm" }, { name: "Pitch Deck Advisory", type: "Advisory / Consulting Skills", channels: ["Google Business Profile"], url: "simoneadler.com/advisory" }],
    formats: ["Star Rating", "Written Review", "Structured Categories"], rating: 4.8, exchanges: 18, credits: 3, creditsTotal: 12,
    prev: { date: "Jan 15", channel: "Google Business Profile", asset: "Pitch Deck Advisory", semiOk: true, blocked: ["Google Business Profile"] },
    color: "#FF6B35", bio: "Podcast host & startup advisor. I've helped 40+ founders close their seed rounds."
  },
  {
    id: 105, name: "Kofi Mensah", avatar: "KM", plan: "free", planName: "Sprout", loc: "London, UK", since: "Mar 2025",
    assets: [{ name: "Notion Templates Shop", type: "Digital Product / SaaS", channels: ["Gumroad", "Trustpilot"], url: "kofinotion.gumroad.com" }],
    formats: ["Star Rating", "Written Review"], rating: 4.6, exchanges: 4, credits: 0, creditsTotal: 4, prev: null, color: "#38A169",
    bio: "Productivity nerd building Notion templates for solopreneurs and small teams."
  },
  {
    id: 106, name: "Ravi Sharma", avatar: "RS", plan: "paid", planName: "Bloom", loc: "San Francisco, CA", since: "Oct 2024",
    assets: [{ name: "SEO Growth Agency", type: "Service / Consulting", channels: ["Google Business Profile", "Clutch.co"], url: "ravigrowth.com" }, { name: "SEO Masterclass", type: "Digital Product / SaaS", channels: ["Teachable", "Trustpilot"], url: "ravigrowth.com/masterclass" }],
    formats: ["Star Rating", "Written Review", "Structured Categories", "Video / Audio"], rating: 4.9, exchanges: 29, credits: 6, creditsTotal: 12,
    prev: { date: "Feb 3", channel: "Clutch.co", asset: "SEO Growth Agency", semiOk: true, blocked: ["Clutch.co", "Google Business Profile"] },
    color: "#6B4226", bio: "SEO strategist helping B2B SaaS companies rank on page one. 10+ years in the trenches."
  },
  {
    id: 107, name: "Chloe Benton", avatar: "CB", plan: "paid", planName: "Flourish", loc: "Toronto, CA", since: "Sep 2024",
    assets: [{ name: "Brand Identity Studio", type: "Service / Consulting", channels: ["Google Business Profile", "Yelp", "Clutch.co"], url: "chloebrandstudio.ca" }, { name: "Brand Sprint Workshop", type: "Advisory / Consulting Skills", channels: ["Google Business Profile", "LinkedIn"], url: "chloebrandstudio.ca/workshop" }],
    formats: ["Star Rating", "Written Review", "Video / Audio"], rating: 5.0, exchanges: 35, credits: 8, creditsTotal: 12, prev: null, color: "#A0644A",
    bio: "Brand strategist & designer. I turn fuzzy brand ideas into clear, compelling identities."
  },
  {
    id: 108, name: "Marcus Webb", avatar: "MW", plan: "free", planName: "Sprout", loc: "Atlanta, GA", since: "Feb 2025",
    assets: [{ name: "Photography Portfolio", type: "Service / Consulting", channels: ["Google Business Profile", "Yelp"], url: "marcuswebb.photo" }],
    formats: ["Star Rating", "Written Review"], rating: 4.5, exchanges: 3, credits: 4, creditsTotal: 4, prev: null, color: "#4A5568",
    bio: "Commercial photographer specializing in brand photography for product-based businesses."
  },
];

const ASSET_TYPES = ["All Types", "Service / Consulting", "Advisory / Consulting Skills", "Digital Product / SaaS", "E-commerce Store", "Content / Podcast / Video", "Physical Product", "Client Asset"];
const CHANNELS = ["Any Channel", "Google Business Profile", "Yelp", "Tripadvisor", "Amazon", "Shopify App Store", "Clutch.co", "Trustpilot", "Apple Podcasts", "Spotify", "LinkedIn", "G2", "Gumroad", "Teachable"];
const FB_FORMATS = ["Any Format", "Star Rating", "Written Review", "Structured Categories", "Video / Audio"];
const PLAN_OPTS = ["All Plans", "Paid Only", "Free Only"];
const CREDIT_OPTS = ["Any Credits", "Has Credits Now"];

// ── ATOMS ────────────────────────────────────────────────────────────────────
function Stars({ n = 5, size = 14 }) {
  return <span style={{ display: "inline-flex", gap: 2 }}>{[1, 2, 3, 4, 5].map(s => <svg key={s} width={size} height={size} viewBox="0 0 20 20" fill={s <= n ? T.gold : "#E2D9D0"}><path d="M10 1l2.39 4.84 5.34.78-3.86 3.76.91 5.32L10 13.27l-4.78 2.51.91-5.32L2.27 6.62l5.34-.78z" /></svg>)}</span>;
}
function Av({ txt, color = T.orange, size = 40 }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * .35, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", flexShrink: 0 }}>{txt}</div>;
}
function Pill({ children, color = T.orange, bg, sx = {} }) {
  return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, background: bg || color + "22", color, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", ...sx }}>{children}</span>;
}
function PlanPill({ plan, planName }) {
  const c = plan === "paid" ? { color: T.gold, bg: T.gold + "25", icon: "⚡" } : { color: T.teal, bg: T.teal + "18", icon: "🌱" };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, background: c.bg, color: c.color, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", border: `1px solid ${c.color}33` }}>{c.icon} {planName}</span>;
}
function Btn({ children, onClick, v = "primary", sz = "md", disabled = false, sx = {} }) {
  const base = { border: "none", cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, borderRadius: 12, transition: "all 0.18s", display: "inline-flex", alignItems: "center", gap: 6, opacity: disabled ? 0.5 : 1 };
  const sizes = { sm: { padding: "7px 16px", fontSize: 13 }, md: { padding: "11px 24px", fontSize: 15 }, lg: { padding: "15px 32px", fontSize: 16 } };
  const vs = {
    primary: { background: T.orange, color: "#fff", boxShadow: `0 4px 14px ${T.orange}44` },
    teal: { background: T.teal, color: "#fff", boxShadow: `0 4px 14px ${T.teal}44` },
    ghost: { background: "transparent", color: T.brownM, border: `1.5px solid #E8DDD5` },
    gold: { background: T.gold, color: T.brown, boxShadow: `0 4px 14px ${T.gold}44` },
    red: { background: T.red, color: "#fff" },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...sizes[sz], ...vs[v], ...sx }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = "translateY(-1px)" }}
    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)" }}>{children}</button>;
}
function Card({ children, sx = {}, hover = true, dim = false }) {
  const [h, sH] = useState(false);
  return <div onMouseEnter={() => hover && sH(true)} onMouseLeave={() => hover && sH(false)}
    style={{
      background: dim ? "#F7F2ED" : "#fff", borderRadius: 20, border: `1.5px solid ${h && !dim ? T.orangeP : "#F0E8E0"}`,
      boxShadow: h && !dim ? "0 8px 32px rgba(61,43,31,0.10)" : "0 2px 10px rgba(61,43,31,0.06)",
      transition: "all 0.22s", transform: h && !dim ? "translateY(-2px)" : "none", opacity: dim ? 0.75 : 1, ...sx
    }}>{children}</div>;
}

// ── MOBILE HOOK ───────────────────────────────────────────────────────────────
function useIsMobile(bp = 768) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const check = () => setM(window.innerWidth < bp);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [bp]);
  return m;
}

// ── NAV ──────────────────────────────────────────────────────────────────────
const NAV_LINKS = [["How It Works", "how"], ["Browse Members", "browse"], ["Proof Lab", "prooflab"], ["Dashboard", "dashboard"], ["Add Asset", "asset"]];
function Nav({ page, setPage }) {
  const [sc, setSc] = useState(false);
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  useEffect(() => {
    const el = document.querySelector("#scroller");
    if (!el) return;
    const h = () => setSc(el.scrollTop > 20);
    el.addEventListener("scroll", h);
    return () => el.removeEventListener("scroll", h);
  }, []);
  const navTo = id => { setPage(id); setOpen(false); };
  return (
    <>
      <nav style={{ position: "sticky", top: 0, zIndex: 200, background: sc ? "rgba(255,248,240,0.95)" : "transparent", backdropFilter: sc ? "blur(12px)" : "none", borderBottom: sc ? `1px solid ${T.orangeP}` : "1px solid transparent", transition: "all 0.3s", padding: isMobile ? "0 16px" : "0 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => navTo("home")}>
            <span style={{ fontSize: 24 }}>⭐</span>
            <span style={{ fontFamily: "'Fraunces',serif", fontSize: 21, fontWeight: 800, color: T.brown, letterSpacing: "-0.02em" }}>five<span style={{ color: T.orange }}>starz</span></span>
          </div>
          {isMobile ? (
            <button onClick={() => setOpen(o => !o)} aria-label="Menu" style={{ background: "none", border: "none", cursor: "pointer", padding: 8, display: "flex", flexDirection: "column", gap: 5, alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
              <span style={{ display: "block", width: 22, height: 2.5, background: open ? T.orange : T.brown, borderRadius: 2, transition: "all 0.22s", transform: open ? "rotate(45deg) translate(5px,5px)" : "none" }} />
              <span style={{ display: "block", width: 22, height: 2.5, background: open ? T.orange : T.brown, borderRadius: 2, transition: "all 0.22s", opacity: open ? 0 : 1 }} />
              <span style={{ display: "block", width: 22, height: 2.5, background: open ? T.orange : T.brown, borderRadius: 2, transition: "all 0.22s", transform: open ? "rotate(-45deg) translate(5px,-5px)" : "none" }} />
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {NAV_LINKS.map(([lbl, id]) => (
                <button key={id} onClick={() => navTo(id)} style={{ background: page === id ? T.orangeP : "transparent", color: page === id ? T.orange : T.brownM, border: "none", cursor: "pointer", padding: "8px 14px", borderRadius: 10, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 14, transition: "all 0.15s" }}>{lbl}</button>
              ))}
              <Btn onClick={() => navTo("dashboard")} sz="sm" sx={{ marginLeft: 6 }}>My Dashboard →</Btn>
            </div>
          )}
        </div>
      </nav>
      {isMobile && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(61,43,31,0.45)", zIndex: 298, opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity 0.25s", backdropFilter: "blur(3px)" }} />
          <div style={{ position: "fixed", top: 0, right: 0, width: "78vw", maxWidth: 300, height: "100vh", background: "#fff", zIndex: 299, transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)", boxShadow: "-8px 0 40px rgba(61,43,31,0.2)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: `1.5px solid ${T.orangeP}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <span style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 800, color: T.brown }}>five<span style={{ color: T.orange }}>starz</span></span>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, color: T.brownL, lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              {NAV_LINKS.map(([lbl, id]) => (
                <button key={id} onClick={() => navTo(id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "15px 24px", background: page === id ? T.orangeP : "transparent", color: page === id ? T.orange : T.brown, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 16, border: "none", borderLeft: page === id ? `4px solid ${T.orange}` : "4px solid transparent", cursor: "pointer", transition: "all 0.15s", boxSizing: "border-box" }}>{lbl}</button>
              ))}
            </div>
            <div style={{ padding: "18px 22px", borderTop: `1.5px solid ${T.orangeP}`, flexShrink: 0 }}>
              <Btn onClick={() => navTo("dashboard")} sx={{ width: "100%", justifyContent: "center" }}>My Dashboard →</Btn>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── HOME PAGE ────────────────────────────────────────────────────────────────
const HOW_STEPS = [
  { n: "01", icon: "🤝", title: "Get Matched", desc: "Paired with another member whose work you'll genuinely experience. Free: 4 auto-matches/month. Paid: 6 auto + 6 browse." },
  { n: "02", icon: "👀", title: "Experience Their Work", desc: "Interact with their asset — service, product, content, consultation, or advisory session. Give it a real try." },
  { n: "03", icon: "✍️", title: "Leave Honest Feedback", desc: "Submit inside FiveStarz using any format you choose: stars, written review, structured categories, or video/audio." },
  { n: "04", icon: "📣", title: "Decide to Post", desc: "If genuine and positive, the asset owner can ask you to post it publicly. You're never obligated." },
];
const PLANS = [
  { name: "Sprout", price: "Free", sub: "forever", color: T.teal, features: ["4 auto-matches / month", "1 asset", "1 review channel per asset", "Text + star feedback", "Default 1° separation"] },
  { name: "Bloom", price: "$29", sub: "/ month", color: T.orange, badge: "Most Popular", features: ["6 auto + 6 browse matches", "Up to 5 assets", "Multiple channels per asset", "All feedback formats incl. Advisory Skills", "Set 1–3 degrees of separation", "Manage client assets", "Require specific feedback types", "Control semi-duplicate match settings"] },
  { name: "Flourish", price: "$79", sub: "/ month", color: T.gold, features: ["Everything in Bloom", "Unlimited assets", "Priority matching", "White-label feedback forms", "Team seats (3 users)", "Dedicated support"] },
];

function HomePage({ setPage, setShowBeta }) {
  const isMobile = useIsMobile();
  return (
    <div>
      <section style={{ minHeight: "88vh", display: "flex", alignItems: "center", background: `radial-gradient(ellipse at 70% 40%, ${T.orangeP} 0%, ${T.cream} 55%, ${T.tealP} 100%)`, padding: "80px 32px 60px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -80, right: -60, width: 400, height: 400, borderRadius: "50%", background: T.gold + "18", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -100, left: -80, width: 500, height: 500, borderRadius: "50%", background: T.teal + "12", pointerEvents: "none" }} />
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center", width: "100%" }}>
          <div>
            <Pill color={T.teal}>✦ Invite-Only Beta Now Open</Pill>
            <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: "clamp(36px,4.5vw,62px)", lineHeight: 1.1, color: T.brown, margin: "20px 0 24px", fontWeight: 900, letterSpacing: "-0.03em" }}>Hone pitches. Prove products.<br />Consult founders. Gather stars.<br /><span style={{ color: T.orange }}>GROW.</span></h1>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 19, color: T.slate, lineHeight: 1.65, maxWidth: 480, marginBottom: 36 }}>A members-only club where founders and solopreneurs exchange <strong>honest, ethical feedback</strong> — and decide together whether to share it as a real review.</p>
            <div style={{ display: "flex", gap: 12 }}>
              <Btn onClick={() => setShowBeta(true)} sz="lg">✦ Request Beta Access</Btn>
              <Btn v="ghost" sz="lg" onClick={() => setPage("how")}>See How It Works →</Btn>
            </div>
            <div style={{ marginTop: 40, display: "flex", gap: 28 }}>
              {[["500+", "Beta Members"], ["4.9★", "Avg Score"], ["2,100+", "Reviews Posted"]].map(([n, l]) => (
                <div key={l}><div style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 800, color: T.brown }}>{n}</div><div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>{l}</div></div>
              ))}
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", top: -16, left: -16, right: 16, bottom: 16, background: T.gold + "30", borderRadius: 28, transform: "rotate(-2deg)" }} />
            <Card sx={{ padding: 28, position: "relative" }} hover={false}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: T.brown }}>New Match!</div><div style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>Jordan, meet Alex →</div></div>
                <Pill color={T.orange}>New Match</Pill>
              </div>
              <div style={{ display: "flex", gap: 16, padding: "16px 0", borderTop: `1.5px dashed ${T.orangeP}`, borderBottom: `1.5px dashed ${T.orangeP}`, marginBottom: 20 }}>
                <div style={{ flex: 1, background: T.cream, borderRadius: 14, padding: 14 }}><div style={{ fontSize: 11, fontWeight: 700, color: T.brownL, marginBottom: 6, fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" }}>You're reviewing</div><div style={{ fontSize: 15, fontWeight: 700, color: T.brown, fontFamily: "'DM Sans',sans-serif" }}>Alex's UX Studio</div><div style={{ fontSize: 12, color: T.slate, marginTop: 4 }}>alexdesign.co</div></div>
                <div style={{ display: "flex", alignItems: "center", fontSize: 20 }}>⇄</div>
                <div style={{ flex: 1, background: T.tealP, borderRadius: 14, padding: 14 }}><div style={{ fontSize: 11, fontWeight: 700, color: T.teal, marginBottom: 6, fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" }}>Alex reviews</div><div style={{ fontSize: 15, fontWeight: 700, color: T.brown, fontFamily: "'DM Sans',sans-serif" }}>Your Consulting</div><div style={{ fontSize: 12, color: T.slate, marginTop: 4 }}>revflow.co</div></div>
              </div>
              <div style={{ display: "flex", gap: 10 }}><Btn sz="sm" sx={{ flex: 1, justifyContent: "center" }}>Accept Match</Btn><Btn sz="sm" v="ghost" sx={{ flex: 1, justifyContent: "center" }}>View Profile</Btn></div>
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
          <div style={{ textAlign: "center", marginTop: 32 }}><Btn v="ghost" onClick={() => setPage("how")}>Full Rules & Guidelines →</Btn></div>
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
                <Btn v={p.badge ? "primary" : p.price === "Free" ? "teal" : "gold"} sx={{ width: "100%", justifyContent: "center" }} onClick={() => setShowBeta(true)}>{p.price === "Free" ? "Start Free" : p.name === "Bloom" ? "Start 14-Day Trial" : "Talk to Us"}</Btn>
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
          <Btn sz="lg" v="gold" onClick={() => setShowBeta(true)}>✦ Request Beta Access →</Btn>
        </div>
      </section>
    </div>
  );
}

// ── BETA MODAL ───────────────────────────────────────────────────────────────
function BetaModal({ show, onClose }) {
  const [step, setStep] = useState("form");
  const [form, setForm] = useState({ name: "", email: "", business: "", url: "", goal: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (!show) return null;
  const submit = async () => {
    if (!form.name || !form.email) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/beta-signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error("send failed");
      setStep("success");
    } catch (e) {
      setError("Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 28, padding: "40px 44px", maxWidth: 500, width: "100%", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", position: "relative", animation: "popIn 0.25s ease" }}>
        <style>{`@keyframes popIn{from{opacity:0;transform:scale(0.93) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
        <button onClick={onClose} style={{ position: "absolute", top: 18, right: 18, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: T.brownL }}>×</button>
        {step === "form" ? (
          <>
            <div style={{ textAlign: "center", marginBottom: 28 }}><div style={{ fontSize: 36, marginBottom: 8 }}>⭐</div><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 28, fontWeight: 800, color: T.brown, margin: "0 0 8px" }}>Request Beta Access</h2><p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>First 500 members · Free Bloom for 90 days</p></div>
            {[["name", "Your Name *", "Jordan Rivera", "text"], ["email", "Email Address *", "jordan@revflow.co", "email"], ["business", "Business Name", "RevFlow Consulting", "text"], ["url", "Website URL", "revflow.co", "text"], ["goal", "What do you want reviews for?", "My consulting, podcast, Shopify store...", "text"]].map(([k, l, p, t]) => (
              <div key={k} style={{ marginBottom: 16 }}><label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>{l}</label><input type={t} placeholder={p} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: T.cream, outline: "none", boxSizing: "border-box" }} /></div>
            ))}
            {error && <div style={{ padding: "10px 14px", background: "#FFF0F0", borderRadius: 10, fontSize: 13, color: T.red, fontFamily: "'DM Sans',sans-serif", marginBottom: 12, marginTop: 8 }}>{error}</div>}
            <Btn onClick={submit} sx={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={loading}>{loading ? "Sending..." : "✦ Request My Spot →"}</Btn>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}><div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 28, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>You're on the list!</h2><p style={{ fontSize: 15, color: T.slate, lineHeight: 1.65, fontFamily: "'DM Sans',sans-serif", marginBottom: 28 }}>Thanks, <strong>{form.name || "friend"}</strong>! Confirmation sent to <strong>{form.email || "your inbox"}</strong>.</p><Btn onClick={onClose}>Back to FiveStarz</Btn></div>
        )}
      </div>
    </div>
  );
}

// ── BROWSE MEMBERS ───────────────────────────────────────────────────────────
function BrowsePage({ setPage }) {
  const [filters, setFilters] = useState({ assetType: "All Types", channel: "Any Channel", format: "Any Format", plan: "All Plans", credits: "Any Credits", search: "" });
  const [outModal, setOutModal] = useState(null);
  const [savedModal, setSavedModal] = useState(null);
  const [matchModal, setMatchModal] = useState(null);
  const sf = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const anyActive = filters.search || filters.assetType !== "All Types" || filters.channel !== "Any Channel" || filters.format !== "Any Format" || filters.plan !== "All Plans" || filters.credits !== "Any Credits";

  const shown = MEMBERS.filter(m => {
    if (filters.search && !m.name.toLowerCase().includes(filters.search.toLowerCase()) && !m.assets.some(a => a.name.toLowerCase().includes(filters.search.toLowerCase()))) return false;
    if (filters.assetType !== "All Types" && !m.assets.some(a => a.type === filters.assetType)) return false;
    if (filters.channel !== "Any Channel" && !m.assets.some(a => a.channels.includes(filters.channel))) return false;
    if (filters.format !== "Any Format" && !m.formats.includes(filters.format)) return false;
    if (filters.plan === "Paid Only" && m.plan !== "paid") return false;
    if (filters.plan === "Free Only" && m.plan !== "free") return false;
    if (filters.credits === "Has Credits Now" && m.credits === 0) return false;
    return true;
  });

  const onRequest = m => {
    if (m.credits === 0) { setOutModal(m); return; }
    setMatchModal(m);
  };

  const selStyle = (active, base = "#E8DDD5") => ({
    padding: "8px 12px", borderRadius: 10, border: "none",
    background: active ? T.orange : "rgba(255,255,255,0.12)",
    color: "#fff", fontSize: 13, fontFamily: "'DM Sans',sans-serif",
    cursor: "pointer", outline: "none", fontWeight: 600,
  });

  return (
    <div style={{ background: T.cream, minHeight: "100vh" }}>
      {/* ── Sub-header ── */}
      <div style={{ background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`, padding: "32px 32px 0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#C4A68A", marginBottom: 6, fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>Paid Members Only</div>
              <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 30, fontWeight: 900, color: "#fff", margin: 0 }}>Browse & Request Matches</h1>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>Browse credits left</div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 28, fontWeight: 800, color: "#fff" }}>{ME.browseTotal - ME.browseUsed}<span style={{ fontSize: 16, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif", fontWeight: 400 }}> / {ME.browseTotal}</span></div>
            </div>
          </div>

          {/* Filter bar */}
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: "16px 16px 0 0", padding: "18px 22px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            {/* Search */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5, fontFamily: "'DM Sans',sans-serif" }}>Search</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.45 }}>🔍</span>
                <input value={filters.search} onChange={e => sf("search", e.target.value)} placeholder="Name or asset..." style={{ padding: "8px 10px 8px 30px", borderRadius: 10, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", width: 155, boxSizing: "border-box" }} />
              </div>
            </div>

            {/* Dropdowns */}
            {[
              ["Asset Type", "assetType", ASSET_TYPES],
              ["Review Channel", "channel", CHANNELS],
              ["Feedback Format", "format", FB_FORMATS],
              ["Plan", "plan", PLAN_OPTS],
              ["Credits", "credits", CREDIT_OPTS],
            ].map(([label, key, opts]) => (
              <div key={key}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5, fontFamily: "'DM Sans',sans-serif" }}>{label}</div>
                <select value={filters[key]} onChange={e => sf(key, e.target.value)} style={selStyle(filters[key] !== opts[0])}>
                  {opts.map(o => <option key={o} value={o} style={{ background: T.brown, color: "#fff" }}>{o}</option>)}
                </select>
              </div>
            ))}

            {anyActive && (
              <button onClick={() => setFilters({ assetType: "All Types", channel: "Any Channel", format: "Any Format", plan: "All Plans", credits: "Any Credits", search: "" })} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "rgba(255,80,40,0.28)", color: "#FFB89A", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", alignSelf: "flex-end" }}>✕ Clear</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 32px" }}>
        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 22, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>{shown.length} member{shown.length !== 1 ? "s" : ""} shown</span>
          <div style={{ display: "flex", gap: 16, marginLeft: "auto", flexWrap: "wrap" }}>
            {[[T.green, "Has credits, new match"], [T.gold, "⚡ Re-match eligible (diff channels)"], [T.brownL, "Previously matched"], [T.red, "Out of credits"]].map(([c, l]) => (
              <div key={l} style={{ display: "flex", gap: 6, alignItems: "center" }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} /><span style={{ fontSize: 11, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{l}</span></div>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 18 }}>
          {shown.map(m => {
            const noCredits = m.credits === 0;
            const hasPrev = !!m.prev;
            const semiOk = m.prev?.semiOk;
            const dimmed = hasPrev && !semiOk;
            const barColor = noCredits ? T.red : semiOk ? T.gold : hasPrev ? "#C8BFB5" : T.green;

            return (
              <Card key={m.id} dim={dimmed} sx={{ padding: 0, overflow: "hidden", border: `2px solid ${dimmed ? "#E8E0D8" : barColor + "55"}` }}>
                {/* Status strip */}
                <div style={{ height: 4, background: barColor }} />
                <div style={{ padding: "20px 22px", overflow: "hidden" }}>
                  {/* Header */}
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12 }}>
                    <Av txt={m.avatar} color={dimmed ? "#B0A0A0" : m.color} size={48} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                        <span style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: dimmed ? T.brownL : T.brown }}>{m.name}</span>
                        <PlanPill plan={m.plan} planName={m.planName} />
                        {noCredits && <Pill color={T.red} bg={T.red + "18"} sx={{ fontSize: 10 }}>No Credits</Pill>}
                        {semiOk && <Pill color={T.gold} bg={T.gold + "28"} sx={{ fontSize: 10 }}>⚡ Re-match OK</Pill>}
                      </div>
                      <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>📍 {m.loc} · Member since {m.since}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                        <Stars n={Math.round(m.rating)} size={12} />
                        <span style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{m.rating} feedback quality · {m.exchanges} exchanges</span>
                        <span style={{ fontSize: 10, fontWeight: 700, background: T.gold + "22", color: T.gold, padding: "1px 8px", borderRadius: 10, fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.04em" }}>⭐ INTERNAL RATING</span>
                      </div>
                    </div>
                  </div>

                  <p style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55, marginBottom: 14, fontStyle: "italic" }}>"{m.bio}"</p>

                  {/* Assets */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.brownL, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Assets Available for Review</div>
                    {m.assets.map((a, i) => (
                      <div key={i} style={{ padding: "10px 12px", background: dimmed ? "#F0EAE3" : T.cream, borderRadius: 10, marginBottom: 7 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: dimmed ? T.brownL : T.brown, fontFamily: "'DM Sans',sans-serif", flex: 1 }}>{a.name}</span>
                          <Pill color={a.type.includes("Advisory") ? T.purple : T.teal} bg={a.type.includes("Advisory") ? T.purpleP : T.tealP} sx={{ fontSize: 9 }}>{a.type.replace(" / Consulting", "").replace("Digital Product / ", "")}</Pill>
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          {a.channels.map(ch => {
                            const blocked = semiOk && m.prev?.blocked?.includes(ch);
                            return <span key={ch} style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", background: blocked ? "#FFE5E5" : "#fff", color: blocked ? T.red : T.brownM, border: `1px solid ${blocked ? T.red + "44" : "#DDD4C8"}`, textDecoration: blocked ? "line-through" : "none" }}>{blocked ? "🚫 " : ""}{ch}</span>;
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Feedback formats */}
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
                    {m.formats.map(f => <Pill key={f} color={T.brownL} bg={T.cream} sx={{ fontSize: 9 }}>{f}</Pill>)}
                  </div>

                  {/* Previous match callout */}
                  {hasPrev && (
                    <div style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 12, background: semiOk ? T.goldL + "33" : "#F0EAE3", border: `1px solid ${semiOk ? T.gold + "55" : "#DDD4C8"}` }}>
                      {semiOk ? (
                        <div style={{ fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                          <span style={{ color: T.gold, fontWeight: 700 }}>⚡ Re-match eligible</span>
                          <span style={{ color: T.brownL }}> · Prev matched {m.prev.date} on {m.prev.channel}</span>
                          <div style={{ color: T.brownM, marginTop: 4, fontWeight: 600, fontSize: 11 }}>Strikethrough channels are blocked this round — both sides must use different channels.</div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>🔁 Previously matched · {m.prev.date}{m.prev.channel ? ` · Posted to ${m.prev.channel}` : " · No review posted"}</div>
                      )}
                    </div>
                  )}

                  {/* Credits dots */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <span style={{ fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                      <span style={{ color: noCredits ? T.red : T.green, fontWeight: 700 }}>{noCredits ? "0 credits" : `${m.credits} credits`}</span>
                      <span style={{ color: T.brownL }}> left this month</span>
                    </span>
                    <div style={{ display: "flex", gap: 3 }}>
                      {Array.from({ length: Math.min(m.creditsTotal, 12) }).map((_, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i < m.credits ? T.green : "#E0D5CC" }} />)}
                    </div>
                  </div>

                  {/* CTA row */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn sz="sm" v="ghost">View Profile</Btn>
                    <Btn sz="sm" v={noCredits ? "ghost" : semiOk ? "gold" : "primary"} sx={{ flex: 1, justifyContent: "center" }} onClick={() => onRequest(m)}>
                      {noCredits ? "💾 Save for Next Month" : semiOk ? "⚡ Request Re-Match" : "Request Match →"}
                    </Btn>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {shown.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 32px" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: T.brown, marginBottom: 8 }}>No members match your filters</div>
            <Btn v="ghost" sx={{ marginTop: 16 }} onClick={() => setFilters({ assetType: "All Types", channel: "Any Channel", format: "Any Format", plan: "All Plans", credits: "Any Credits", search: "" })}>Clear All Filters</Btn>
          </div>
        )}
      </div>

      {/* Out-of-credits alert */}
      {outModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: "36px 40px", maxWidth: 420, width: "100%", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>📅</div>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>This member is out of credits this month.</h2>
            <p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 28 }}><strong>{outModal.name}</strong> has used all their matches for {new Date().toLocaleString("default", { month: "long" })}. Save this match to kick off automatically next month?</p>
            <div style={{ display: "flex", gap: 12 }}>
              <Btn v="ghost" sx={{ flex: 1, justifyContent: "center" }} onClick={() => setOutModal(null)}>Cancel</Btn>
              <Btn v="teal" sx={{ flex: 1, justifyContent: "center" }} onClick={() => { setSavedModal(outModal); setOutModal(null); }}>📌 Save</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Save confirmed */}
      {savedModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: "36px 40px", maxWidth: 380, width: "100%", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>✅</div>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Match Saved!</h2>
            <p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 24 }}>We'll kick off your match with <strong>{savedModal.name}</strong> on the 1st of next month. No credits deducted from either of you this month.</p>
            <Btn onClick={() => setSavedModal(null)} sx={{ width: "100%", justifyContent: "center" }}>Got It</Btn>
          </div>
        </div>
      )}

      {matchModal && <RequestMatchModal member={matchModal} onClose={() => setMatchModal(null)} />}
    </div>
  );
}

function RequestMatchModal({ member, onClose }) {
  const [myAsset, setMyAsset] = useState(null);
  const [theirAsset, setTheirAsset] = useState(null);
  const [sent, setSent] = useState(false);
  const semi = member.prev?.semiOk;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 28, padding: "32px 36px", maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 18, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: T.brownL }}>×</button>
        {!sent ? (
          <>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown, marginBottom: 6 }}>Request Match with {member.name}</h2>
            <p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", marginBottom: 20 }}>Choose which assets you'll each review in this exchange.</p>
            {semi && <div style={{ padding: "12px 16px", background: T.goldL + "44", borderRadius: 12, border: `1.5px solid ${T.gold}55`, marginBottom: 18, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: T.brownM }}>⚡ <strong>Semi-duplicate match.</strong> You must use different review channels this round. Blocked channels are struck through below.</div>}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.brownL, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>Which of YOUR assets to review?</div>
              {ME.assets.map(a => (
                <div key={a.id} onClick={() => setMyAsset(a.id)} style={{ padding: "12px 16px", borderRadius: 12, marginBottom: 8, border: `2px solid ${myAsset === a.id ? T.orange : "#E8DDD5"}`, background: myAsset === a.id ? T.orangeP : "#fff", cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 18 }}>{a.img}</span><div><div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown }}>{a.name}</div><div style={{ fontSize: 11, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>{a.type}</div></div></div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.brownL, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>Which of {member.name.split(" ")[0]}'s assets to review?</div>
              {member.assets.map((a, i) => (
                <div key={i} onClick={() => setTheirAsset(i)} style={{ padding: "12px 16px", borderRadius: 12, marginBottom: 8, border: `2px solid ${theirAsset === i ? T.teal : "#E8DDD5"}`, background: theirAsset === i ? T.tealP : "#fff", cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown, marginBottom: 6 }}>{a.name}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {a.channels.map(ch => { const bl = semi && member.prev?.blocked?.includes(ch); return <span key={ch} style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: bl ? "#FFE5E5" : T.cream, color: bl ? T.red : T.brownM, fontFamily: "'DM Sans',sans-serif", textDecoration: bl ? "line-through" : "none" }}>{bl ? "🚫 " : ""}{ch}</span>; })}
                  </div>
                </div>
              ))}
            </div>
            <Btn onClick={() => myAsset !== null && theirAsset !== null && setSent(true)} sx={{ width: "100%", justifyContent: "center" }} disabled={myAsset === null || theirAsset === null}>Send Match Request →</Btn>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}><div style={{ fontSize: 52, marginBottom: 16 }}>🤝</div><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Match Request Sent!</h2><p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 24 }}>We've notified <strong>{member.name}</strong>. Once they accept, you'll both get instructions to experience each other's work. 1 browse credit used.</p><Btn onClick={onClose}>Done</Btn></div>
        )}
      </div>
    </div>
  );
}

// ── HOW IT WORKS ─────────────────────────────────────────────────────────────
const RULES = [
  { t: "do", icon: "✅", text: "Give honest, thoughtful feedback based on real experience" },
  { t: "do", icon: "✅", text: "Be respectful, constructive, and kind" },
  { t: "do", icon: "✅", text: "Only post a review if your feedback is genuinely positive" },
  { t: "do", icon: "✅", text: "Complete feedback within the agreed timeframe" },
  { t: "dont", icon: "🚫", text: "Leave fake positive feedback inside then negative reviews online" },
  { t: "dont", icon: "🚫", text: "Be mean, dismissive, or disrespectful to other members" },
  { t: "dont", icon: "🚫", text: "Create multiple accounts to game the system" },
  { t: "dont", icon: "🚫", text: "Pressure or incentivize other members to post positive reviews" },
];

function HowPage({ setShowBeta }) {
  const [tab, setTab] = useState("steps");
  const isMobile = useIsMobile();
  const tabs = [["steps", "Steps"], ["matching", "Matching Logic"], ["advisory", "Advisory Skills"], ["rules", "Rules"], ["roadmap", "Feature Roadmap"]];
  return (
    <div style={{ background: T.cream }}>
      <section style={{ padding: isMobile ? "44px 16px 0" : "60px 32px 0", background: `linear-gradient(135deg,${T.warm} 0%,${T.cream} 100%)`, textAlign: "center" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", paddingBottom: 32 }}>
          <Pill color={T.teal}>Member Guidelines</Pill>
          <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 52, fontWeight: 900, color: T.brown, margin: "16px 0 20px", letterSpacing: "-0.03em" }}>The FiveStarz Way</h1>
          <p style={{ fontSize: 18, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65 }}>Built on trust, ethical exchange, and genuine community.</p>
        </div>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", gap: 4, justifyContent: isMobile ? "flex-start" : "center", overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}>
          {tabs.map(([id, lbl]) => <button key={id} onClick={() => setTab(id)} style={{ padding: "12px 20px", border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 13, borderRadius: "10px 10px 0 0", background: tab === id ? "#fff" : "transparent", color: tab === id ? T.brown : T.brownL, transition: "all 0.2s" }}>{lbl}</button>)}
        </div>
      </section>

      <div style={{ background: "#fff" }}>
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
              <p style={{ fontSize: 16, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 32 }}>How FiveStarz pairs members — including the semi-duplicate matching rules.</p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 28 }}>
                {[
                  { plan: "Free Members (Sprout)", color: T.teal, icon: "🌱", pts: ["4 auto-matches / month, randomly assigned", "Category-aware pairing preferred", "Never re-matched unless semi-duplicate eligible (see below)", "Default 1° separation — no reviewing anyone in the direct review network of a prior match"] },
                  { plan: "Paid Members (Bloom / Flourish)", color: T.orange, icon: "🌸", pts: ["6 auto + 6 browse matches per month", "Browse by asset type, channel, feedback format, plan, and credit availability", "Set separation 1–3° in Account Preferences", "If browsing to a Free member at their limit, match queues to next month — no credits lost for either party", "Can disable semi-duplicate matching in preferences", "Can choose whether to allow semi-duplicate matches with Free members"] }
                ].map(({ plan, color, icon, pts }) => (
                  <Card key={plan} sx={{ padding: 24 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}><span style={{ fontSize: 28 }}>{icon}</span><div style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: T.brown }}>{plan}</div></div>
                    {pts.map((p, i) => <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}><span style={{ color, flexShrink: 0 }}>✓</span>{p}</div>)}
                  </Card>
                ))}
              </div>

              {/* Semi-duplicate callout */}
              <div style={{ background: T.goldL + "33", border: `2px solid ${T.gold}55`, borderRadius: 20, padding: 28, marginBottom: 28 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 32, flexShrink: 0 }}>⚡</span>
                  <div>
                    <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown, marginBottom: 12 }}>Semi-Duplicate Matching — Full Rules</h3>
                    <p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 16 }}>Under specific conditions, two members who've matched before can be re-matched — but only when the system can guarantee they'll exchange on entirely different review channels than their last match.</p>
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
              <p style={{ fontSize: 16, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 28 }}>Paid members can collect reviews not just on things — but on <em>themselves as professionals</em>. Your knowledge, insight, and expertise are reviewable assets.</p>
              <div style={{ padding: "24px 28px", background: T.purpleP, border: `2px solid ${T.purple}33`, borderRadius: 20, marginBottom: 28 }}>
                <div style={{ display: "flex", gap: 14 }}><span style={{ fontSize: 36, flexShrink: 0 }}>🧠</span><div><h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 800, color: T.purple, marginBottom: 8 }}>What counts as an Advisory Skills asset?</h3><p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65 }}>Any offering where <em>you</em> are the product. Your strategic thinking, coaching, auditing, or consulting — reviewed by a peer who's genuinely engaged with it.</p></div></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
                {[["💬", "Free 30-Min Consultation", "You give a genuine business growth consultation. The other member reviews your thinking, delivery, and value. You review their business context and goals in return."], ["🎯", "Strategy Session", "A paid or complimentary strategy session. The member reviews the clarity and value of your strategic guidance — and can post it as a review on LinkedIn or Google."], ["🛠️", "Done-For-You Audit", "You audit their site, funnel, or pitch deck. They review the quality and actionability of your findings. A perfect Advisory Skills use case."], ["🎓", "Coaching / Mentoring", "A coaching call or mentorship session. The member's honest feedback builds your advisory reputation — stars, written review, structured categories, or video testimonial."]].map(([icon, title, desc]) => (
                  <div key={title} style={{ padding: 20, background: T.cream, borderRadius: 16 }}><div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: T.brown, marginBottom: 6 }}>{title}</div><div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55 }}>{desc}</div></div>
                ))}
              </div>
              <div style={{ padding: "20px 24px", background: "#fff", borderRadius: 16, border: "1.5px solid #F0E8E0" }}>
                <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: T.brown, marginBottom: 12 }}>Important Notes</h3>
                {["Requires a unique URL for your booking or profile page (e.g., calendly.com/you or yoursite.com/advisory).", "The person experiencing the session reviews your advisory skills. You can review their business context and overall engagement.", "Both parties decide independently whether to request a public post. Neither is ever obligated.", "Google Business Profile and LinkedIn are the most common channels for advisory review posts."].map((n, i) => (
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
                <div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Legal & Ethical Compliance</div><div style={{ fontSize: 14, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif", lineHeight: 1.6 }}>FiveStarz complies with FTC guidelines and major review platform terms. No fake reviews, no incentivized posting, no review gating. The person who receives feedback can never post it themselves — only the person who wrote it can choose to post.</div></div>
              </div>
            </div>
          )}

          {tab === "roadmap" && (
            <div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 32, fontWeight: 800, color: T.brown, marginBottom: 8 }}>Feature Roadmap</h2>
              <p style={{ fontSize: 16, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 32 }}>We build FiveStarz with our beta members. Here's what's live, in progress, and planned.</p>
              {[
                {
                  phase: "✅ Live in Beta", color: T.green, bg: T.greenP, items: [
                    { t: "Auto-matching (Free & Paid)", d: "Category-aware pairing with duplicate prevention and degrees-of-separation filtering." },
                    { t: "Browse & Request (Paid)", d: "Browse members with filters: asset type, channel, feedback format, plan, and credit availability." },
                    { t: "Multi-asset support", d: "Paid members can create multiple assets — services, products, content, and advisory skills." },
                    { t: "Advisory Skills asset type", d: "Paid members list consulting expertise as an asset. Peer members review the knowledge and value delivered." },
                    { t: "Feedback form builder", d: "Asset owners control which feedback formats (stars, text, categories, video) are allowed or required." },
                    { t: "Request-to-post flow", d: "Asset owners ask reviewers to post to a chosen channel. Reviewers are never obligated." },
                    { t: "Client asset management", d: "Paid members manage assets on behalf of clients and coordinate their review collection." },
                  ]
                },
                {
                  phase: "🔨 In Development", color: T.orange, bg: T.orangeP, items: [
                    { t: "Semi-duplicate matching — Free ↔ Free", d: "When two Free members have new available channels from their last match, the system re-matches them with prior channels automatically blocked on both sides." },
                    { t: "Semi-duplicate prefs for Paid members", d: "Toggle semi-duplicate matching on/off; optionally block it only for Free members. Default: ON." },
                    { t: "Degrees of separation settings UI", d: "In-app control for Paid members to adjust separation (1–3°) with trade-off explanations shown." },
                    { t: "Match history & network graph", d: "Visual representation of your review network as it grows over time." },
                    { t: "Full feedback status pipeline", d: "Dashboard showing each match: matched → experienced → feedback → post requested → posted." },
                  ]
                },
                {
                  phase: "🗓️ Planned (Q3 2025)", color: T.teal, bg: T.tealP, items: [
                    { t: "Team accounts (Flourish)", d: "Multiple seats under one plan for agencies and teams." },
                    { t: "White-label feedback forms", d: "Embed branded forms on your site that route into FiveStarz." },
                    { t: "Video review support", d: "Record and submit short video testimonials — higher-trust, higher-impact." },
                    { t: "Review performance analytics", d: "Track channel performance, asset feedback, and overall reputation score." },
                  ]
                },
                {
                  phase: "💡 Under Consideration", color: T.purple, bg: T.purpleP, items: [
                    { t: "Community trust score", d: "Member reputation based on feedback quality, completion rates, and community standing." },
                    { t: "Niche communities", d: "Sub-communities for specific verticals (SaaS, food & bev, creative services) with tailored matching." },
                    { t: "API & Zapier integration", d: "Connect your CRM to auto-kick off review collection when a project closes." },
                  ]
                },
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
      {/* Unadvertised Bonus — dark full-width section */}
      <section style={{ background: T.brown, padding: "64px 32px", overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", top: -60, right: -60, width: 320, height: 320, borderRadius: "50%", background: T.orange + "18", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -80, left: -40, width: 260, height: 260, borderRadius: "50%", background: T.gold + "14", pointerEvents: "none" }} />
        <div style={{ maxWidth: 840, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: T.gold + "28", border: `1px solid ${T.gold}55`, padding: "5px 16px", borderRadius: 20, marginBottom: 22 }}>
            <span style={{ fontSize: 14 }}>🤫</span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 800, color: T.gold, textTransform: "uppercase", letterSpacing: "0.1em" }}>Unadvertised Member Bonus</span>
          </div>
          <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: "clamp(28px,4vw,46px)", fontWeight: 900, color: "#fff", margin: "0 0 20px", lineHeight: 1.12, letterSpacing: "-0.02em" }}>
            The highest-rated members get paid<br /><span style={{ color: T.gold }}>to shape tomorrow's products.</span>
          </h2>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 17, color: "#C4A68A", lineHeight: 1.7, maxWidth: 620, marginBottom: 32 }}>
            Members build an internal star rating based on the quality of their feedback — not just reviews they collect, but reviews they <em style={{ color: "#FDD07A" }}>give</em>. Top-rated members earn exclusive invitations to participate in <strong style={{ color: "#fff" }}>paid virtual focus groups</strong> for new products coming to market. Real input. Real money.
          </p>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[["⭐", "Give great feedback", "Every review you write is rated by the person who received it."], ["📈", "Climb the ratings", "Your internal star rating rises as your feedback quality is recognized."], ["💵", "Earn paid invites", "Top-rated members are invited to join virtual focus groups — and get paid."]].map(([ic, h, d]) => (
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
        <div style={{ maxWidth: 500, margin: "0 auto" }}><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 36, fontWeight: 800, color: T.brown, margin: "0 0 16px" }}>Ready to earn your stars?</h2><p style={{ fontSize: 16, color: T.slate, fontFamily: "'DM Sans',sans-serif", marginBottom: 28 }}>Join the beta and start building real social proof.</p><Btn sz="lg" onClick={() => setShowBeta(true)}>✦ Request Beta Access →</Btn></div>
      </section>
    </div>
  );
}

function RateFeedbackWidget({ match }) {
  const [rating, setRating] = useState(match.myFbRating || 0);
  const [hover, setHover] = useState(0);
  const [saved, setSaved] = useState(match.myFbRating != null);
  const save = n => { setRating(n); setSaved(true); };
  if (saved && rating > 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Stars n={rating} size={13} />
        <span style={{ fontSize: 11, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>Feedback rated</span>
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.brownL, fontFamily: "'DM Sans',sans-serif", marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>Rate their feedback</div>
      <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
        {[1, 2, 3, 4, 5].map(n => (
          <svg key={n} width={18} height={18} viewBox="0 0 20 20"
            fill={(hover || rating) >= n ? T.gold : "#E2D9D0"}
            style={{ cursor: "pointer", transition: "transform 0.1s", transform: (hover || rating) >= n ? "scale(1.2)" : "scale(1)" }}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => save(n)}>
            <path d="M10 1l2.39 4.84 5.34.78-3.86 3.76.91 5.32L10 13.27l-4.78 2.51.91-5.32L2.27 6.62l5.34-.78z" />
          </svg>
        ))}
      </div>
    </div>
  );
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ setPage }) {
  const [tab, setTab] = useState("matches");
  const [fbModal, setFbModal] = useState(null);
  const [postModal, setPostModal] = useState(null);
  const sc = {
    feedback_pending: { label: "Feedback Due", color: T.orange, bg: T.orangeP },
    awaiting_post: { label: "Awaiting Post", color: T.teal, bg: T.tealP },
    posted: { label: "Review Posted ✓", color: T.green, bg: T.greenP },
    matched: { label: "New Match", color: T.gold, bg: T.goldL + "55" },
  };
  return (
    <div style={{ background: T.cream, minHeight: "100vh" }}>
      <div style={{ background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`, padding: "40px 32px 0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}><Av txt={ME.avatar} color={T.orange} size={52} /><div><div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#C4A68A", fontWeight: 600, marginBottom: 4 }}>Welcome back,</div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 800, color: "#fff" }}>{ME.name}</div></div></div>
            <div style={{ textAlign: "right" }}><PlanPill plan={ME.plan} planName={ME.planName} /><div style={{ marginTop: 10, display: "flex", gap: 20 }}>{[["4/12", "Matches"], ["2/6", "Browse"], [`${ME.degrees}°`, "Separation"]].map(([v, l]) => <div key={l} style={{ textAlign: "center" }}><div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 800, color: "#fff" }}>{v}</div><div style={{ fontSize: 11, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif" }}>{l}</div></div>)}</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
            {[["📦", "Assets", ME.assets.length], ["✅", "Posted", 14], ["✍️", "Pending", 2], ["🤝", "Matches", "4/12"]].map(([ic, lbl, val]) => (
              <div key={lbl} style={{ background: "rgba(255,255,255,0.1)", borderRadius: "14px 14px 0 0", padding: "16px 20px", backdropFilter: "blur(8px)" }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{ic}</div>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 800, color: "#fff" }}>{val}</div>
                <div style={{ fontSize: 12, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif" }}>{lbl}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 16 }}>
            {[["matches", "🤝 Matches"], ["assets", "📦 Assets"], ["history", "📜 History"]].map(([id, lbl]) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: "12px 24px", border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, borderRadius: "10px 10px 0 0", background: tab === id ? T.cream : "transparent", color: tab === id ? T.brown : "#C4A68A", transition: "all 0.2s" }}>{lbl}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px" }}>
        {tab === "matches" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: T.brown, margin: 0 }}>Your Matches</h3><Btn sz="sm" v="teal" onClick={() => setPage("browse")}>+ Browse Members</Btn></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {MATCHES.map(m => {
                const s = sc[m.status]; return (
                  <Card key={m.id} sx={{ padding: "20px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <Av txt={m.person.split(" ").map(n => n[0]).join("")} color={m.color} size={44} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}><span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 16, color: T.brown }}>{m.person}</span><Pill color={s.color} bg={s.bg}>{s.label}</Pill></div>
                        <div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}><strong>{m.asset}</strong> · {m.type} · Due {m.due}</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>{m.channels.map(ch => <Pill key={ch} color={T.brownL} bg={T.cream}>{ch}</Pill>)}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0, flexDirection: "column", alignItems: "flex-end" }}>
                        {m.status === "feedback_pending" && <Btn sz="sm" onClick={() => setFbModal(m)}>Leave Feedback</Btn>}
                        {m.status === "awaiting_post" && <Btn sz="sm" v="teal" onClick={() => setPostModal(m)}>Request Post</Btn>}
                        {m.status === "posted" && (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: T.green, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>✓ {m.postedCh}</div>
                            <RateFeedbackWidget match={m} />
                          </div>
                        )}
                        {m.status === "matched" && <Btn sz="sm" v="gold">Accept Match</Btn>}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {tab === "assets" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: T.brown, margin: 0 }}>My Assets</h3><Btn sz="sm" onClick={() => setPage("asset")}>+ Add Asset</Btn></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {ME.assets.map(a => (
                <Card key={a.id} sx={{ padding: 28 }}>
                  <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: a.type.includes("Advisory") ? T.purpleP : T.orangeP, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{a.img}</div>
                    <div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: T.brown }}>{a.name}</div><div style={{ fontSize: 12, color: T.teal, fontFamily: "'DM Sans',sans-serif" }}>{a.url}</div>{a.type.includes("Advisory") && <Pill color={T.purple} bg={T.purpleP} sx={{ marginTop: 4, fontSize: 10 }}>Advisory Skills</Pill>}</div>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1, background: T.cream, borderRadius: 12, padding: "12px 16px", textAlign: "center" }}><div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: T.brown }}>{a.reviews}</div><div style={{ fontSize: 12, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>Posted</div></div>
                    <div style={{ flex: 1, background: a.pending ? T.orangeP : T.cream, borderRadius: 12, padding: "12px 16px", textAlign: "center" }}><div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 800, color: a.pending ? T.orange : T.brown }}>{a.pending}</div><div style={{ fontSize: 12, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>Pending</div></div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>{a.channels.map(ch => <Pill key={ch} color={T.teal} bg={T.tealP}>{ch}</Pill>)}</div>
                  <div style={{ display: "flex", gap: 8 }}><Btn sz="sm" v="ghost" sx={{ flex: 1, justifyContent: "center" }}>Edit</Btn><Btn sz="sm" sx={{ flex: 1, justifyContent: "center", background: T.cream, color: T.brown, border: `1.5px solid #E8DDD5`, boxShadow: "none" }}>Feedback</Btn></div>
                </Card>
              ))}
              <Card sx={{ padding: 28, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: `2px dashed ${T.orangeP}`, background: T.cream }} hover={false}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>+</div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: T.brown, marginBottom: 12 }}>Add New Asset</div><Btn sz="sm" onClick={() => setPage("asset")}>+ Add Asset</Btn>
              </Card>
            </div>
          </div>
        )}

        {tab === "history" && (
          <div>
            <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: T.brown, marginBottom: 20 }}>Review History</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[{ person: "Sam Torres", asset: "Shopify Plugin", ch: "Shopify App Store", date: "Feb 28", stars: 5, snippet: "Sam's plugin saved me hours every week. Onboarding intuitive, support stellar." },
              { person: "Priya Nair", asset: "Brand Strategy Session", ch: "Google Business Profile", date: "Feb 20", stars: 5, snippet: "Priya completely transformed how I think about positioning. Incredibly thoughtful." },
              { person: "Derek Walsh", asset: "Email Marketing Course", ch: "Trustpilot", date: "Feb 12", stars: 4, snippet: "Solid frameworks and actionable templates. A few sections felt a bit rushed." }
              ].map((r, i) => (
                <Card key={i} sx={{ padding: "18px 24px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                    <Av txt={r.person.split(" ").map(n => n[0]).join("")} color={[T.gold, T.brown, T.teal][i]} size={40} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div><span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, color: T.brown }}>{r.person}</span><span style={{ color: T.brownL, fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}> · {r.asset}</span></div>
                        <span style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{r.date}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 8px" }}><Stars n={r.stars} size={14} /><Pill color={T.green} bg={T.greenP}>✓ {r.ch}</Pill></div>
                      <div style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55, fontStyle: "italic" }}>"{r.snippet}"</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {fbModal && <FeedbackModal match={fbModal} onClose={() => setFbModal(null)} />}
      {postModal && <PostModal match={postModal} onClose={() => setPostModal(null)} />}
    </div>
  );
}

function FeedbackModal({ match, onClose }) {
  const [stars, setStars] = useState(0); const [hover, setHover] = useState(0);
  const [text, setText] = useState(""); const [done, setDone] = useState(false);
  const [cats, setCats] = useState({ quality: 0, value: 0, communication: 0 });
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 28, padding: "36px 40px", maxWidth: 520, width: "100%", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: T.brownL }}>×</button>
        {!done ? (
          <>
            <div style={{ marginBottom: 20 }}><div style={{ fontSize: 13, fontWeight: 700, color: T.orange, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Feedback For</div><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 800, color: T.brown, margin: 0 }}>{match.person}</h2><div style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", marginTop: 4 }}>{match.asset}</div></div>
            <div style={{ background: T.warm, borderRadius: 14, padding: 14, marginBottom: 20, fontSize: 13, color: T.brownM, fontFamily: "'DM Sans',sans-serif" }}>💡 Be honest and specific. Use at least one format below.</div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: T.brown, marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>Overall Rating</div>
              <div style={{ display: "flex", gap: 6 }}>{[1, 2, 3, 4, 5].map(s => <span key={s} style={{ cursor: "pointer", fontSize: 32 }} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)} onClick={() => setStars(s)}>{s <= (hover || stars) ? "⭐" : "☆"}</span>)}{stars > 0 && <span style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif", alignSelf: "center", marginLeft: 6 }}>{["", "Poor", "Fair", "Good", "Great", "Excellent"][stars]}</span>}</div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: T.brown, marginBottom: 12, fontFamily: "'DM Sans',sans-serif" }}>Structured Categories</div>
              {Object.keys(cats).map(cat => <div key={cat} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", textTransform: "capitalize" }}>{cat}</span><div style={{ display: "flex", gap: 4 }}>{[1, 2, 3, 4, 5].map(s => <button key={s} onClick={() => setCats(c => ({ ...c, [cat]: s }))} style={{ width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer", background: s <= cats[cat] ? T.orange : T.orangeP, color: s <= cats[cat] ? "#fff" : T.orangeL, fontSize: 12, fontWeight: 700 }}>{s}</button>)}</div></div>)}
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: T.brown, marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Written Feedback</div>
              <textarea value={text} onChange={e => setText(e.target.value)} placeholder={`Honest thoughts about ${match.person}'s ${match.asset}...`} style={{ width: "100%", minHeight: 100, padding: "12px 14px", borderRadius: 12, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: T.cream, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            </div>
            <Btn onClick={() => { if (!stars && !text) return; setDone(true); }} sx={{ width: "100%", justifyContent: "center" }}>Submit Feedback</Btn>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}><div style={{ fontSize: 52, marginBottom: 16 }}>🙌</div><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Feedback Submitted!</h2><p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 24 }}>Your feedback for <strong>{match.person}</strong> has been saved inside FiveStarz.</p><Btn onClick={onClose}>Done</Btn></div>
        )}
      </div>
    </div>
  );
}

function PostModal({ match, onClose }) {
  const [sel, setSel] = useState(null); const [sent, setSent] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 28, padding: "36px 40px", maxWidth: 460, width: "100%", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: T.brownL }}>×</button>
        {!sent ? (
          <>
            <div style={{ marginBottom: 24 }}><div style={{ fontSize: 13, fontWeight: 700, color: T.teal, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Request Post From</div><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 800, color: T.brown, margin: 0 }}>{match.person}</h2></div>
            <div style={{ padding: "12px 14px", background: T.tealP, borderRadius: 12, marginBottom: 20, fontSize: 13, color: T.teal, fontFamily: "'DM Sans',sans-serif" }}>✓ {match.person} is never obligated to post. This is a friendly request only.</div>
            {match.channels.map(ch => <div key={ch} onClick={() => setSel(ch)} style={{ padding: "14px 18px", borderRadius: 12, marginBottom: 10, cursor: "pointer", border: `2px solid ${sel === ch ? T.teal : "#E8DDD5"}`, background: sel === ch ? T.tealP : "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.15s" }}><span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, color: T.brown }}>{ch}</span>{sel === ch && <span style={{ color: T.teal }}>✓</span>}</div>)}
            <Btn v="teal" onClick={() => sel && setSent(true)} sx={{ width: "100%", justifyContent: "center", marginTop: 12, opacity: sel ? 1 : 0.5 }}>Send Request</Btn>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}><div style={{ fontSize: 52, marginBottom: 16 }}>📨</div><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Request Sent!</h2><p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 24 }}><strong>{match.person}</strong> has been notified. If they post to <strong>{sel}</strong>, you'll get a confirmation here.</p><Btn onClick={onClose}>Done</Btn></div>
        )}
      </div>
    </div>
  );
}

// ── ASSET SETUP ──────────────────────────────────────────────────────────────
function AssetPage() {
  const [step, setStep] = useState(1);
  const [a, setA] = useState({ name: "", url: "", type: "", desc: "", channels: [], fbTypes: [], reqStars: false, reqTwo: false, forClient: false, clientName: "", screenshots: [] });
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const handleFiles = files => {
    const imgs = Array.from(files).filter(f => f.type.startsWith("image/"));
    imgs.forEach(f => {
      const reader = new FileReader();
      reader.onload = e => setA(p => ({ ...p, screenshots: [...p.screenshots, { name: f.name, src: e.target.result }] }));
      reader.readAsDataURL(f);
    });
  };
  const removeScreenshot = idx => setA(p => ({ ...p, screenshots: p.screenshots.filter((_, i) => i !== idx) }));
  const [done, setDone] = useState(false);
  const CHNLS = ["Google Business Profile", "Yelp", "Tripadvisor", "Amazon", "Shopify App Store", "Clutch.co", "Trustpilot", "Apple Podcasts", "Spotify", "Substack", "LinkedIn", "G2", "Capterra", "Gumroad", "Teachable"];
  const TYPES = ["Service / Consulting", "Advisory / Consulting Skills", "Physical Product", "Digital Product / SaaS", "Content / Podcast / Video", "E-commerce Store", "Free Session / Consultation", "Client Asset"];
  const FBTYPES = ["Star Rating (1–5)", "Written Review", "Structured Categories", "Video / Audio Upload"];
  const tog = (k, v) => setA(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] }));

  if (done) return (
    <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.cream, padding: 32 }}>
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>🚀</div>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 36, fontWeight: 900, color: T.brown, margin: "0 0 16px" }}>Asset Live!</h1>
        <p style={{ fontSize: 16, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 28 }}><strong>{a.name || "Your asset"}</strong> is set up and ready to collect feedback.</p>
        <Btn onClick={() => { setDone(false); setStep(1); setA({ name: "", url: "", type: "", desc: "", channels: [], fbTypes: [], reqStars: false, reqTwo: false, forClient: false, clientName: "" }); }}>Add Another Asset</Btn>
      </div>
    </div>
  );

  return (
    <div style={{ background: T.cream, minHeight: "100vh" }}>
      <div style={{ background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`, padding: "40px 32px 32px" }}>
        <div style={{ maxWidth: 740, margin: "0 auto" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#C4A68A", marginBottom: 8, fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>New Asset Setup</div>
          <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 34, fontWeight: 900, color: "#fff", margin: "0 0 24px" }}>What would you like reviews on?</h1>
          <div style={{ display: "flex" }}>
            {["Asset Info", "Channels", "Feedback Settings", "Confirm"].map((s, i) => (
              <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                {i < 3 && <div style={{ position: "absolute", top: 14, left: "50%", right: "-50%", height: 2, background: step > i + 1 ? T.orange : "rgba(255,255,255,0.2)", zIndex: 0 }} />}
                <div style={{ width: 28, height: 28, borderRadius: "50%", zIndex: 1, background: step > i + 1 ? T.gold : step === i + 1 ? T.orange : "rgba(255,255,255,0.2)", color: step >= i + 1 ? "#fff" : "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{step > i + 1 ? "✓" : i + 1}</div>
                <div style={{ fontSize: 11, color: step === i + 1 ? "#fff" : "rgba(255,255,255,0.5)", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, textAlign: "center" }}>{s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 740, margin: "0 auto", padding: "40px 32px" }}>
        <Card sx={{ padding: 36 }}>
          {step === 1 && (
            <div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 700, color: T.brown, marginBottom: 28 }}>About Your Asset</h2>
              {[["name", "Asset Name *", "e.g. RevFlow Consulting, My Podcast, Advisory Skills..."], ["url", "Unique URL *", "yoursite.com/product or booking page URL"]].map(([k, l, p]) => (
                <div key={k} style={{ marginBottom: 20 }}><label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>{l}</label><input value={a[k]} onChange={e => setA(p => ({ ...p, [k]: e.target.value }))} placeholder={p} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid #E8DDD5", fontSize: 15, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: T.cream, outline: "none", boxSizing: "border-box" }} /></div>
              ))}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>Asset Type *</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                  {TYPES.map(t => (
                    <div key={t} onClick={() => setA(p => ({ ...p, type: t, forClient: t === "Client Asset" }))} style={{ padding: "12px 16px", borderRadius: 12, cursor: "pointer", border: `2px solid ${a.type === t ? (t.includes("Advisory") ? T.purple : T.orange) : "#E8DDD5"}`, background: a.type === t ? (t.includes("Advisory") ? T.purpleP : T.orangeP) : "#fff", fontSize: 14, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, color: a.type === t ? (t.includes("Advisory") ? T.purple : T.orange) : T.brown, transition: "all 0.15s" }}>
                      {t.includes("Advisory") && "🧠 "}{t}
                    </div>
                  ))}
                </div>
                {a.type.includes("Advisory") && <div style={{ marginTop: 12, padding: "14px 16px", background: T.purpleP, borderRadius: 12, fontSize: 13, color: T.purple, fontFamily: "'DM Sans',sans-serif" }}><strong>Advisory Skills</strong> — Paid feature. Your expertise is the asset. Peers experience your session and review your skills and value delivered.</div>}
              </div>
              {a.forClient && <div style={{ marginBottom: 20, padding: 16, background: T.tealP, borderRadius: 14 }}><label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.teal, marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Client's Business Name</label><input value={a.clientName} onChange={e => setA(p => ({ ...p, clientName: e.target.value }))} placeholder="e.g. Dave's Plumbing Co." style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${T.teal}44`, fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: "#fff", outline: "none", boxSizing: "border-box" }} /></div>}
              <div style={{ marginBottom: 28 }}><label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Description</label><textarea value={a.desc} onChange={e => setA(p => ({ ...p, desc: e.target.value }))} placeholder="What should reviewers experience? Include a link, what to try, how to book a session..." style={{ width: "100%", minHeight: 90, padding: "12px 14px", borderRadius: 12, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: T.cream, resize: "vertical", outline: "none", boxSizing: "border-box" }} /></div>

              {/* ── Screenshot Upload Zone ── */}
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 8, fontFamily: "'DM Sans',sans-serif" }}>Screenshots <span style={{ fontWeight: 400, color: T.brownL }}>(optional)</span></label>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                  onClick={() => fileRef.current?.click()}
                  style={{ border: `2px dashed ${dragOver ? T.orange : "#DDD4C8"}`, borderRadius: 14, padding: "28px 20px", textAlign: "center", cursor: "pointer", background: dragOver ? T.orangeP : T.cream, transition: "all 0.18s" }}>
                  <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown, marginBottom: 4 }}>Drag &amp; drop screenshots here</div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: T.brownL }}>or click to browse · JPG, PNG, WebP, GIF</div>
                </div>
                {a.screenshots.length > 0 && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                    {a.screenshots.map((s, i) => (
                      <div key={i} style={{ position: "relative", width: 80, height: 80, borderRadius: 10, overflow: "hidden", border: `1.5px solid ${T.orangeP}`, flexShrink: 0 }}>
                        <img src={s.src} alt={s.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button onClick={e => { e.stopPropagation(); removeScreenshot(i); }} style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: "50%", background: "rgba(61,43,31,0.75)", border: "none", cursor: "pointer", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Btn onClick={() => setStep(2)} sx={{ width: "100%", justifyContent: "center" }} disabled={!a.name || !a.url || !a.type}>Continue to Channels →</Btn>
            </div>
          )}
          {step === 2 && (
            <div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 700, color: T.brown, marginBottom: 8 }}>Review Channels</h2>
              <p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", marginBottom: 24 }}>Where can reviewers post? The reviewer chooses which channel to use.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 24 }}>
                {CHNLS.map(ch => <div key={ch} onClick={() => tog("channels", ch)} style={{ padding: "12px 14px", borderRadius: 12, cursor: "pointer", border: `2px solid ${a.channels.includes(ch) ? T.teal : "#E8DDD5"}`, background: a.channels.includes(ch) ? T.tealP : "#fff", fontSize: 13, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, color: a.channels.includes(ch) ? T.teal : T.brown, transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6 }}>{a.channels.includes(ch) && <span>✓</span>}{ch}</div>)}
              </div>
              {a.channels.length > 0 && <div style={{ padding: "14px 18px", background: T.greenP, borderRadius: 12, fontSize: 14, color: T.green, fontFamily: "'DM Sans',sans-serif", marginBottom: 20, fontWeight: 600 }}>✓ {a.channels.length} channel{a.channels.length > 1 ? "s" : ""}: {a.channels.join(", ")}</div>}
              <div style={{ display: "flex", gap: 12 }}><Btn v="ghost" onClick={() => setStep(1)}>← Back</Btn><Btn onClick={() => setStep(3)} sx={{ flex: 1, justifyContent: "center" }} disabled={a.channels.length === 0}>Continue to Feedback Settings →</Btn></div>
            </div>
          )}
          {step === 3 && (
            <div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 700, color: T.brown, marginBottom: 8 }}>Feedback Settings</h2>
              <p style={{ fontSize: 14, color: T.slate, fontFamily: "'DM Sans',sans-serif", marginBottom: 20 }}>Choose allowed formats. Reviewer must use at least one.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                {FBTYPES.map(fb => <div key={fb} onClick={() => tog("fbTypes", fb)} style={{ padding: "16px 18px", borderRadius: 14, cursor: "pointer", border: `2px solid ${a.fbTypes.includes(fb) ? T.orange : "#E8DDD5"}`, background: a.fbTypes.includes(fb) ? T.orangeP : "#fff", display: "flex", alignItems: "center", gap: 14, transition: "all 0.15s" }}><div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${a.fbTypes.includes(fb) ? T.orange : "#D0C4BC"}`, background: a.fbTypes.includes(fb) ? T.orange : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{a.fbTypes.includes(fb) && <span style={{ color: "#fff", fontSize: 13 }}>✓</span>}</div><span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 15, color: T.brown }}>{fb}</span></div>)}
              </div>
              <div style={{ padding: "20px", background: T.warm, borderRadius: 16, marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><Pill color={T.orange}>Bloom+ Feature</Pill><span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown }}>Require Specific Types</span></div>
                {[["reqStars", "Require star rating always", "Reviewers must leave a star rating"], ["reqTwo", "Require stars + one other type", "Stars plus at least one additional format"]].map(([k, lbl, desc]) => (
                  <div key={k} onClick={() => setA(p => ({ ...p, [k]: !p[k] }))} style={{ display: "flex", gap: 12, alignItems: "center", cursor: "pointer", padding: "12px 14px", background: a[k] ? T.orangeP : "#fff", borderRadius: 12, border: `1.5px solid ${a[k] ? T.orange : "#E8DDD5"}`, transition: "all 0.15s", marginBottom: 8 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${a[k] ? T.orange : "#D0C4BC"}`, background: a[k] ? T.orange : "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{a[k] && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}</div>
                    <div><div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 14, color: T.brown }}>{lbl}</div><div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: T.brownL }}>{desc}</div></div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12 }}><Btn v="ghost" onClick={() => setStep(2)}>← Back</Btn><Btn onClick={() => setStep(4)} sx={{ flex: 1, justifyContent: "center" }}>Review & Confirm →</Btn></div>
            </div>
          )}
          {step === 4 && (
            <div>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 700, color: T.brown, marginBottom: 24 }}>Confirm Your Asset</h2>
              <div style={{ background: T.cream, borderRadius: 16, padding: 24, marginBottom: 24 }}>
                {[["Asset Name", a.name || "—"], ["URL", a.url || "—"], ["Type", a.type || "—"], ["Client", a.forClient ? (a.clientName || "Client asset") : "—"], ["Channels", a.channels.join(", ") || "None"], ["Feedback Allowed", a.fbTypes.join(", ") || "Any format"], ["Requirements", a.reqTwo ? "Stars + 1 other" : a.reqStars ? "Stars required" : "Reviewer's choice"]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 12, paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid #EDE4DA", fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>
                    <span style={{ color: T.brownL, minWidth: 160, flexShrink: 0 }}>{k}</span><span style={{ color: T.brown, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: "14px 18px", background: T.tealP, borderRadius: 12, fontSize: 14, color: T.teal, fontFamily: "'DM Sans',sans-serif", marginBottom: 24 }}>🔍 We'll verify your URL before activating. Usually takes a few minutes.</div>
              <div style={{ display: "flex", gap: 12 }}><Btn v="ghost" onClick={() => setStep(3)}>← Back</Btn><Btn v="teal" onClick={() => setDone(true)} sx={{ flex: 1, justifyContent: "center" }}>✦ Create Asset & Start Matching</Btn></div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// \u2500\u2500 PROOF LAB \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const PROOF_LISTINGS = [
  { id: 1, seller: "Tariq Osman", avatar: "TO", color: "#7C3AED", category: "Copywriting", title: "Sales Page Copywriting", desc: "Full sales page copy \u2014 hook, story, offer, CTA. Conversion-focused for SaaS or services.", retail: "$1,200", members: "$149", unit: "per page", badge: "\ud83d\udd25 Hot Deal" },
  { id: 2, seller: "Lena Fischer", avatar: "LF", color: "#1A9E8F", category: "UX Design", title: "UX Audit + Report", desc: "I'll audit your product or site and deliver a prioritised, annotated report with quick wins and deep fixes.", retail: "$800", members: "$89", unit: "per audit", badge: "\u2b50 Top Rated" },
  { id: 3, seller: "Chloe Benton", avatar: "CB", color: "#A0644A", category: "Branding", title: "Logo + Brand Identity Kit", desc: "Primary logo, alternate marks, color palette, typography guide, and usage doc. Figma source files included.", retail: "$650", members: "$97", unit: "per project", badge: "\ud83c\udfa8 Creative Pick" },
  { id: 4, seller: "Ravi Sharma", avatar: "RS", color: "#6B4226", category: "SEO", title: "SEO Keyword Strategy", desc: "30-day deep-dive: competitor analysis, keyword map, content calendar, and quick-win recommendations.", retail: "$500", members: "$59", unit: "per month", badge: "\ud83d\udcc8 Results-Driven" },
  { id: 5, seller: "Simone Adler", avatar: "SA", color: "#FF6B35", category: "Pitch Coaching", title: "Pitch Deck Coaching Session", desc: "60-min 1:1 session. We'll sharpen your narrative, financials slide, and investor Q&A prep.", retail: "$350", members: "$49", unit: "per session", badge: "\ud83d\ude80 Founder Fave" },
  { id: 6, seller: "Marcus Webb", avatar: "MW", color: "#4A5568", category: "Photography", title: "Brand Photography Package", desc: "Half-day shoot \u2014 headshots, lifestyle, product. 40+ edited images in web + print resolution.", retail: "$750", members: "$199", unit: "per shoot", badge: "" },
  { id: 7, seller: "Devon Park", avatar: "DP", color: "#F4A832", category: "Video Production", title: "Founder Story Video (60 sec)", desc: "Script, shoot, edit. Vertical + horizontal cuts. Perfect for LinkedIn, homepage hero, or IG.", retail: "$900", members: "$125", unit: "per video", badge: "\ud83c\udfa6 Fan Favorite" },
  { id: 8, seller: "Kofi Mensah", avatar: "KM", color: "#38A169", category: "Automation", title: "AI Workflow Automation Setup", desc: "I'll build 3 custom n8n or Make.com workflows to automate your CRM, email, or onboarding flows.", retail: "$600", members: "$75", unit: "per build", badge: "\ud83e\udd16 AI-Powered" },
  { id: 9, seller: "Tariq Osman", avatar: "TO", color: "#7C3AED", category: "Email Marketing", title: "Email Welcome Sequence (5 emails)", desc: "Research-backed, 5-email onboarding sequence. Copywriting + strategy included.", retail: "$800", members: "$99", unit: "per sequence", badge: "\u2709\ufe0f Inbox Gold" },
  { id: 10, seller: "Ravi Sharma", avatar: "RS", color: "#6B4226", category: "Google Ads", title: "Google Ads Management", desc: "Full campaign setup or audit + 30 days of active management. Ad copy, bidding, weekly reports.", retail: "$500", members: "$150", unit: "per month", badge: "\ud83d\udcca Data-Driven" },
  { id: 11, seller: "Lena Fischer", avatar: "LF", color: "#1A9E8F", category: "Web Design", title: "Landing Page Design", desc: "High-converting Figma design for your next product launch, waitlist, or lead gen campaign.", retail: "$550", members: "$79", unit: "per page", badge: "" },
  { id: 12, seller: "Chloe Benton", avatar: "CB", color: "#A0644A", category: "LinkedIn Ads", title: "LinkedIn Ad Creative Package", desc: "5 ad creatives (static + carousel) with hooks for your ICP. Designed for lead gen campaigns.", retail: "$400", members: "$59", unit: "per package", badge: "\ud83d\udcbc B2B Specialist" },
  { id: 13, seller: "Devon Park", avatar: "DP", color: "#F4A832", category: "Video Shorts", title: "Video Shorts Repurposing (10 clips)", desc: "Send me your long-form video. I extract 10 high-impact shorts with captions for TikTok, Reels, Shorts.", retail: "$300", members: "$49", unit: "per 10 clips", badge: "\u2702\ufe0f Viral-Ready" },
  { id: 14, seller: "Marcus Webb", avatar: "MW", color: "#4A5568", category: "Photography", title: "Product Photography (10 shots)", desc: "Clean white backdrop or lifestyle context. Up to 10 hero shots, retouched, web-optimized.", retail: "$400", members: "$89", unit: "per shoot", badge: "" },
  { id: 15, seller: "Kofi Mensah", avatar: "KM", color: "#38A169", category: "Notion / Tools", title: "Custom Notion Dashboard Build", desc: "Fully custom Notion workspace for your team \u2014 CRM, tasks, SOPs, content calendar.", retail: "$250", members: "$39", unit: "per dashboard", badge: "\ud83d\uddc2\ufe0f Productivity" },
  { id: 16, seller: "Simone Adler", avatar: "SA", color: "#FF6B35", category: "Branding", title: "Brand Voice & Messaging Guide", desc: "Tone of voice, key messages, audience personas, and power phrases. 20-page Notion doc delivered.", retail: "$450", members: "$65", unit: "per guide", badge: "\ud83c\udfaf Strategy" },
  { id: 17, seller: "Tariq Osman", avatar: "TO", color: "#7C3AED", category: "Copywriting", title: "30-Day LinkedIn Content Plan", desc: "30 posts planned and written for your personal brand. Hooks, stories, CTAs \u2014 ready to schedule.", retail: "$600", members: "$79", unit: "per month", badge: "\ud83d\udd25 Hot Deal" },
  { id: 18, seller: "Ravi Sharma", avatar: "RS", color: "#6B4226", category: "SEO", title: "Blog Content (4 posts/month)", desc: "4 SEO-optimised posts per month. Keyword research, outline, writing, internal links, meta copy.", retail: "$400", members: "$120", unit: "per month / 3-mo min", badge: "\u270d\ufe0f Long-form" },
  { id: 19, seller: "Lena Fischer", avatar: "LF", color: "#1A9E8F", category: "UX Design", title: "Funnel Design + Wireframes", desc: "Full wireframe kit for your marketing funnel: landing page, upsell, thank-you, email opt-in.", retail: "$700", members: "$99", unit: "per funnel", badge: "" },
  { id: 20, seller: "Chloe Benton", avatar: "CB", color: "#A0644A", category: "Facebook Ads", title: "Facebook/Instagram Ad Campaign", desc: "Campaign strategy, 6 ad creatives, copy for 3 audiences, A/B test framework. Pixel setup included.", retail: "$650", members: "$199", unit: "per month / 2-mo min", badge: "\ud83d\udce3 Paid Social" },
  { id: 21, seller: "Devon Park", avatar: "DP", color: "#F4A832", category: "Video Production", title: "Explainer Video Animation (60 sec)", desc: "Script + motion design. Ideal for product demos, onboarding, or pitching investors.", retail: "$1,100", members: "$175", unit: "per video", badge: "\ud83c\udfa6 Fan Favorite" },
  { id: 22, seller: "Kofi Mensah", avatar: "KM", color: "#38A169", category: "Automation", title: "AI Chatbot Setup (Website)", desc: "Custom GPT-powered chatbot trained on your docs. Deployed to your site same week.", retail: "$500", members: "$89", unit: "per build", badge: "\ud83e\udd16 AI-Powered" },
];
const PROOF_CATS = ["All", "Copywriting", "UX Design", "Branding", "SEO", "Pitch Coaching", "Photography", "Video Production", "Video Shorts", "LinkedIn Ads", "Facebook Ads", "Google Ads", "Web Design", "Automation", "Email Marketing", "Notion / Tools"];

function ProofLabPage() {
  const [cat, setCat] = useState("All");
  const [reqModal, setReqModal] = useState(null);
  const shown = cat === "All" ? PROOF_LISTINGS : PROOF_LISTINGS.filter(l => l.category === cat);
  return (
    <div style={{ background: T.cream, minHeight: "100vh" }}>
      <div style={{ background: `linear-gradient(135deg,${T.brown} 0%,${T.brownM} 100%)`, padding: "40px 32px 0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 24 }}>
            <Pill color={T.gold}>\ud83e\uddea Members-Only Deals</Pill>
            <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 36, fontWeight: 900, color: "#fff", margin: "12px 0 8px", letterSpacing: "-0.02em" }}>The Proof Lab</h1>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 16, color: "#C4A68A", margin: 0, maxWidth: 560 }}>Members offer exclusive deals on their best services \u2014 marketing, design, video, AI, ads, and more. Lock in founder-only pricing.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 20 }}>
            {PROOF_CATS.map(c => <button key={c} onClick={() => setCat(c)} style={{ padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 12, background: cat === c ? T.gold : "rgba(255,255,255,0.12)", color: cat === c ? T.brown : "#fff", transition: "all 0.15s" }}>{c}</button>)}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px 60px" }}>
        <div style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, marginBottom: 20 }}>{shown.length} listing{shown.length !== 1 ? "s" : ""}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {shown.map(l => (
            <div key={l.id} style={{ background: "#fff", borderRadius: 20, border: "1.5px solid #F0E8E0", overflow: "hidden", display: "flex", flexDirection: "column", transition: "all 0.22s", boxShadow: "0 2px 10px rgba(61,43,31,0.06)" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 10px 32px rgba(61,43,31,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 10px rgba(61,43,31,0.06)"; }}>
              <div style={{ height: 4, background: l.color }} />
              <div style={{ padding: "20px 20px 18px", display: "flex", flexDirection: "column", flex: 1 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
                  <Av txt={l.avatar} color={l.color} size={34} />
                  <div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 13, color: T.brown }}>{l.seller}</div>
                    <div style={{ fontSize: 11, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>{l.category}</div>
                  </div>
                  {l.badge && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", color: l.color, background: l.color + "18", padding: "3px 9px", borderRadius: 12 }}>{l.badge}</span>}
                </div>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: T.brown, marginBottom: 8, lineHeight: 1.25 }}>{l.title}</div>
                <div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.6, marginBottom: 16, flex: 1 }}>{l.desc}</div>
                <div style={{ background: T.cream, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.brownL, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Sans',sans-serif" }}>Retail</div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 15, color: T.brownL, textDecoration: "line-through" }}>{l.retail}</div>
                    </div>
                    <div style={{ fontSize: 20, color: "#DDD4C8" }}>\u2192</div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.teal, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Sans',sans-serif" }}>Members Pay</div>
                      <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 900, fontSize: 22, color: T.orange }}>{l.members}</div>
                    </div>
                    <div style={{ marginLeft: "auto", fontSize: 10, color: T.brownL, fontFamily: "'DM Sans',sans-serif", textAlign: "right", lineHeight: 1.4 }}>{l.unit}</div>
                  </div>
                </div>
                <Btn onClick={() => setReqModal(l)} sx={{ width: "100%", justifyContent: "center" }}>Request This Deal \u2192</Btn>
              </div>
            </div>
          ))}
        </div>
      </div>
      {reqModal && <ProofLabRequestModal listing={reqModal} onClose={() => setReqModal(null)} />}
    </div>
  );
}

function ProofLabRequestModal({ listing, onClose }) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [timeframe, setTimeframe] = useState(1);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const TF = ["ASAP", "Soon", "No Rush"];
  const send = async () => {
    if (!email) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/beta-signup", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          name: `Proof Lab: ${listing.title}`, email, business: listing.seller, url: listing.category,
          goal: `Timeframe: ${TF[timeframe]}\n\nNote: ${note || "(none)"}`,
        })
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch { setError("Something went wrong \u2014 please try again."); }
    finally { setLoading(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(61,43,31,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 28, padding: "36px 40px", maxWidth: 460, width: "100%", boxShadow: "0 24px 80px rgba(61,43,31,0.3)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 18, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: T.brownL }}>\xd7</button>
        {!sent ? (
          <>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.teal, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontFamily: "'DM Sans',sans-serif" }}>Request Deal</div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 21, fontWeight: 800, color: T.brown, lineHeight: 1.2, marginBottom: 4 }}>{listing.title}</div>
              <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>by {listing.seller} \xb7 <span style={{ color: T.orange, fontWeight: 700 }}>{listing.members}</span> {listing.unit}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>Your Best Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: T.cream, boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>Note <span style={{ fontWeight: 400, color: T.brownL }}>(optional)</span></label>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Anything the member should know..."
                style={{ width: "100%", minHeight: 72, padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E8DDD5", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.brown, background: T.cream, resize: "vertical", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.brown, marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>Timeframe</label>
              <div style={{ padding: "14px 16px", background: T.cream, borderRadius: 12 }}>
                <input type="range" min={0} max={2} step={1} value={timeframe} onChange={e => setTimeframe(Number(e.target.value))} style={{ width: "100%", accentColor: T.orange, cursor: "pointer" }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  {TF.map((lbl, i) => <span key={lbl} style={{ fontSize: 12, fontWeight: timeframe === i ? 800 : 500, color: timeframe === i ? T.orange : T.brownL, fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s" }}>{lbl}</span>)}
                </div>
              </div>
            </div>
            {error && <div style={{ padding: "10px 14px", background: "#FFF0F0", borderRadius: 10, fontSize: 13, color: T.red, fontFamily: "'DM Sans',sans-serif", marginBottom: 12 }}>{error}</div>}
            <Btn onClick={send} sx={{ width: "100%", justifyContent: "center" }} disabled={!email || loading}>{loading ? "Sending..." : "Send Request \u2192"}</Btn>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>\u2705</div>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 800, color: T.brown, margin: "0 0 12px" }}>Request Sent!</h2>
            <p style={{ fontSize: 15, color: T.slate, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65, marginBottom: 24 }}>
              <strong>{listing.seller}</strong> will reach out to <strong>{email}</strong> with next steps.
            </p>
            <Btn onClick={onClose}>Done</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

// ── FOOTER ───────────────────────────────────────────────────────────────────
function Footer({ setPage }) {
  return (
    <footer style={{ background: T.brown, padding: "48px 32px 32px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><span style={{ fontSize: 22 }}>⭐</span><span style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 800, color: "#fff" }}>five<span style={{ color: T.orange }}>starz</span></span></div>
            <div style={{ fontSize: 14, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif", maxWidth: 260, lineHeight: 1.6 }}>Hone pitches. Prove products. Consult founders. Gather stars. GROW.</div>
          </div>
          <div style={{ display: "flex", gap: 48 }}>
            {[{ label: "Product", links: [["How It Works", "how"], ["Browse Members", "browse"], ["Proof Lab", "prooflab"], ["Dashboard", "dashboard"], ["Add Asset", "asset"]] }, { label: "Company", links: [["About", ""], ["Affiliates", ""], ["Contact", ""], ["Privacy", ""]] }].map(({ label, links }) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.gold, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, fontFamily: "'DM Sans',sans-serif" }}>{label}</div>
                {links.map(([lbl, id]) => <div key={lbl} style={{ fontSize: 14, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif", marginBottom: 10, cursor: "pointer" }} onClick={() => id && setPage(id)}>{lbl}</div>)}
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "#8A7060", fontFamily: "'DM Sans',sans-serif" }}>© 2025 FiveStarz. All rights reserved.</div>
          <div style={{ fontSize: 13, color: "#8A7060", fontFamily: "'DM Sans',sans-serif" }}>Made with ❤️ for solopreneurs</div>
        </div>
      </div>
    </footer>
  );
}

// ── APP SHELL ────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("home");
  const [showBeta, setShowBeta] = useState(false);
  const scroller = useRef(null);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [page]);
  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${T.cream};}
        ::-webkit-scrollbar{width:6px;}
        ::-webkit-scrollbar-thumb{background:${T.orangeP};border-radius:10px;}
        input:focus,textarea:focus{border-color:${T.orange}!important;box-shadow:0 0 0 3px ${T.orange}22;}
        select option{background:${T.brown};color:#fff;}
      `}</style>
      <div id="scroller" ref={scroller} style={{ height: "100vh", overflowY: "auto", background: T.cream }}>
        <Nav page={page} setPage={setPage} />
        {page === "home" && <HomePage setPage={setPage} setShowBeta={setShowBeta} />}
        {page === "how" && <HowPage setShowBeta={setShowBeta} />}
        {page === "browse" && <BrowsePage setPage={setPage} />}
        {page === "dashboard" && <Dashboard setPage={setPage} />}
        {page === "asset" && <AssetPage />}
        {page === "prooflab" && <ProofLabPage />}
        <Footer setPage={setPage} />
      </div>
      <BetaModal show={showBeta} onClose={() => setShowBeta(false)} />
    </>
  );
}
