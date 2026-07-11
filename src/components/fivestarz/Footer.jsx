"use client";

import Link from "next/link";

import { T } from "@/lib/fivestarz/theme";

const FOOTER_LINKS = [
  { label: "Home", href: "/" },
  { label: "My Dashboard", href: "/dashboard" },
  { label: "Add Asset", href: "/assets/new" },
  { label: "Browse Members", href: "/browse" },
  { label: "Proof Lab", href: "/proof-lab" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Live Demo", href: "/demo" },
  { label: "Pricing", href: "/pricing" },
  { label: "Community Rules", href: "/community" },
  { label: "Trust & Safety", href: "/safety" },
];
import { useIsMobile } from "@/hooks/useIsMobile";

export default function Footer() {
  const isMobile = useIsMobile();
  return (
    <footer style={{ background: T.brown, padding: isMobile ? "36px 20px 24px" : "48px 32px 32px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40, gap: 32, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><span style={{ fontSize: 20 }}>✦</span><span style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 800, color: "#fff" }}>Proof<span style={{ color: T.orange }}>Signals</span></span></div>
            <div style={{ fontSize: 14, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif", maxWidth: 260, lineHeight: 1.6 }}>AI helps you present your asset. Humans provide the feedback. Public proof is optional and earned.</div>
          </div>
          <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
            <div>
              {FOOTER_LINKS.map(({ label, href }) => (
                <div key={href} style={{ marginBottom: 10 }}>
                  <Link href={href} style={{ fontSize: 14, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif", textDecoration: "none" }}>{label}</Link>
                </div>
              ))}
            </div>
            <div>
              {["About", "Affiliates", "Contact", "Privacy"].map((label) => (
                <div key={label} style={{ fontSize: 14, color: "#C4A68A", fontFamily: "'DM Sans',sans-serif", marginBottom: 10 }}>{label}</div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "#8A7060", fontFamily: "'DM Sans',sans-serif" }}>© 2026 ProofSignals. All rights reserved.</div>
          <div style={{ fontSize: 13, color: "#8A7060", fontFamily: "'DM Sans',sans-serif" }}>Made with ❤️ for solopreneurs</div>
        </div>
      </div>
    </footer>
  );
}
