"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GiStarSwirl } from "react-icons/gi";
import { PiPlanetFill } from "react-icons/pi";

import { useIsMobile } from "@/hooks/useIsMobile";
import { T } from "@/lib/fivestarz/theme";
import { useBetaModal } from "@/components/fivestarz/PageShell";

import { Btn } from "./ui";

function isActive(pathname, href) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

const SLIDE_NAV_LINKS = [
  { label: "My Dashboard", href: "/dashboard" },
  { label: "Add Asset +", href: "/assets/new" },
  { label: "Support", href: "#" },
  { label: "Browse Members", href: "/browse" },
  { label: "Proof Lab", href: "/proof-lab" },
  { label: "How It Works", href: "/how-it-works" },
];

export default function SiteNav() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { openBeta } = useBetaModal();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <nav style={{ position: "sticky", top: 0, zIndex: 200, background: scrolled ? "rgba(255,248,240,0.95)" : "transparent", backdropFilter: scrolled ? "blur(12px)" : "none", borderBottom: scrolled ? `1px solid ${T.orangeP}` : "1px solid transparent", transition: "all 0.3s", padding: isMobile ? "0 16px" : "0 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Logo */}
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flexShrink: 0, marginLeft: 0 }}>
            <span style={{ display: "flex", alignItems: "center", position: "relative", width: 28, height: 28 }}>
              {/* Duotone star: back layer (lighter orange) */}
              <GiStarSwirl style={{ position: "absolute", fontSize: 28, color: T.orangeL, opacity: 0.55 }} />
              {/* Front layer (main orange) */}
              <GiStarSwirl style={{ position: "absolute", fontSize: 24, color: T.orange, left: 2, top: 2 }} />
            </span>
            <span style={{ fontFamily: "'Fraunces',serif", fontSize: 21, fontWeight: 800, color: T.brown, letterSpacing: "-0.02em" }}>five<span style={{ color: T.orange }}>starz</span></span>
          </Link>

          {/* Right side: CTA + planet menu trigger */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 0 }}>
            <Btn sz="sm" onClick={openBeta}>Get Early Access</Btn>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-label="Open navigation menu"
              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0 4px 4px", display: "flex", alignItems: "center", justifyContent: "center", color: T.brownM, transition: "color 0.15s" }}
            >
              <PiPlanetFill style={{ fontSize: 26, color: open ? T.orange : T.brownM, transition: "color 0.2s" }} />
            </button>
          </div>
        </div>
      </nav>

      {/* Overlay */}
      <div
        onClick={() => setOpen(false)}
        style={{ position: "fixed", inset: 0, background: "rgba(61,43,31,0.45)", zIndex: 298, opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity 0.25s", backdropFilter: "blur(3px)" }}
      />

      {/* Slide-in drawer */}
      <div style={{ position: "fixed", top: 0, right: 0, width: "78vw", maxWidth: 300, height: "100vh", background: "#fff", zIndex: 299, transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)", boxShadow: "-8px 0 40px rgba(61,43,31,0.2)", display: "flex", flexDirection: "column" }}>
        {/* Drawer header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: `1.5px solid ${T.orangeP}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 800, color: T.brown }}>five<span style={{ color: T.orange }}>starz</span></span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, color: "#4A5568", lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Nav links */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {SLIDE_NAV_LINKS.map(({ label, href }) => (
            <Link key={href + label} href={href} style={{ display: "block", width: "100%", textAlign: "left", padding: "15px 24px", background: isActive(pathname, href) && href !== "#" ? T.orangeP : "transparent", color: isActive(pathname, href) && href !== "#" ? T.orange : T.brown, fontFamily: "'DM Sans',sans-serif", fontWeight: 400, fontSize: 17, border: "none", borderLeft: isActive(pathname, href) && href !== "#" ? `4px solid ${T.orange}` : "4px solid transparent", textDecoration: "none", boxSizing: "border-box" }}>{label}</Link>
          ))}
        </div>

        {/* Bottom: Auth buttons + avatar */}
        <div style={{ padding: "16px 22px 22px", borderTop: `1.5px solid ${T.orangeP}`, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Mock avatar row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: T.orange, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", flexShrink: 0 }}>JR</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 14, color: T.brown, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Jordan Rivera</div>
              <Link href="#" style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: T.brownL, textDecoration: "none", fontWeight: 400 }}>Settings</Link>
            </div>
          </div>
          {/* Auth buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/login" style={{ flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 10, border: `1.5px solid #E8DDD5`, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 14, color: T.brownM, textDecoration: "none", display: "block" }}>Log In</Link>
            <Link href="/signup" style={{ flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 10, background: T.orange, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", textDecoration: "none", display: "block" }}>Sign Up</Link>
          </div>
        </div>
      </div>
    </>
  );
}
