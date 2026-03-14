"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useIsMobile } from "@/hooks/useIsMobile";
import { NAV_LINKS, T } from "@/lib/fivestarz/theme";

import { ButtonLink } from "./ui";

function isActive(pathname, href) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function SiteNav() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <nav style={{ position: "sticky", top: 0, zIndex: 200, background: scrolled ? "rgba(255,248,240,0.95)" : "transparent", backdropFilter: scrolled ? "blur(12px)" : "none", borderBottom: scrolled ? `1px solid ${T.orangeP}` : "1px solid transparent", transition: "all 0.3s", padding: isMobile ? "0 16px" : "0 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <span style={{ fontSize: 24 }}>⭐</span>
            <span style={{ fontFamily: "'Fraunces',serif", fontSize: 21, fontWeight: 800, color: T.brown, letterSpacing: "-0.02em" }}>five<span style={{ color: T.orange }}>starz</span></span>
          </Link>
          {isMobile ? (
            <button onClick={() => setOpen((o) => !o)} aria-label="Menu" style={{ background: "none", border: "none", cursor: "pointer", padding: 8, display: "flex", flexDirection: "column", gap: 5, alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
              <span style={{ display: "block", width: 22, height: 2.5, background: open ? T.orange : T.brown, borderRadius: 2, transition: "all 0.22s", transform: open ? "rotate(45deg) translate(5px,5px)" : "none" }} />
              <span style={{ display: "block", width: 22, height: 2.5, background: open ? T.orange : T.brown, borderRadius: 2, transition: "all 0.22s", opacity: open ? 0 : 1 }} />
              <span style={{ display: "block", width: 22, height: 2.5, background: open ? T.orange : T.brown, borderRadius: 2, transition: "all 0.22s", transform: open ? "rotate(-45deg) translate(5px,-5px)" : "none" }} />
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {NAV_LINKS.map(({ label, href }) => (
                <Link key={href} href={href} style={{ background: isActive(pathname, href) ? T.orangeP : "transparent", color: isActive(pathname, href) ? T.orange : T.brownM, border: "none", cursor: "pointer", padding: "8px 14px", borderRadius: 10, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 14, transition: "all 0.15s", textDecoration: "none" }}>{label}</Link>
              ))}
              <ButtonLink href="/dashboard" sz="sm" sx={{ marginLeft: 6 }}>My Dashboard →</ButtonLink>
            </div>
          )}
        </div>
      </nav>
      {isMobile ? (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(61,43,31,0.45)", zIndex: 298, opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity 0.25s", backdropFilter: "blur(3px)" }} />
          <div style={{ position: "fixed", top: 0, right: 0, width: "78vw", maxWidth: 300, height: "100vh", background: "#fff", zIndex: 299, transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)", boxShadow: "-8px 0 40px rgba(61,43,31,0.2)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: `1.5px solid ${T.orangeP}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <span style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 800, color: T.brown }}>five<span style={{ color: T.orange }}>starz</span></span>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, color: T.brownL, lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              {[{ label: "Home", href: "/" }, ...NAV_LINKS].map(({ label, href }) => (
                <Link key={href} href={href} style={{ display: "block", width: "100%", textAlign: "left", padding: "15px 24px", background: isActive(pathname, href) ? T.orangeP : "transparent", color: isActive(pathname, href) ? T.orange : T.brown, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 16, border: "none", borderLeft: isActive(pathname, href) ? `4px solid ${T.orange}` : "4px solid transparent", textDecoration: "none", boxSizing: "border-box" }}>{label}</Link>
              ))}
            </div>
            <div style={{ padding: "18px 22px", borderTop: `1.5px solid ${T.orangeP}`, flexShrink: 0 }}>
              <ButtonLink href="/dashboard" sx={{ width: "100%", justifyContent: "center" }}>My Dashboard →</ButtonLink>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
