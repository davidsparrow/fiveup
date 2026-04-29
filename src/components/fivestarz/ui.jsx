"use client";

import Link from "next/link";
import { useState } from "react";

import { T } from "@/lib/fivestarz/theme";

function getButtonStyles(v = "primary", sz = "md", disabled = false, sx = {}) {
  const base = {
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "'DM Sans',sans-serif",
    fontWeight: 700,
    borderRadius: 12,
    transition: "all 0.18s",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    opacity: disabled ? 0.5 : 1,
    textDecoration: "none",
  };
  const sizes = {
    sm: { padding: "7px 16px", fontSize: 13 },
    md: { padding: "11px 24px", fontSize: 15 },
    lg: { padding: "15px 32px", fontSize: 16 },
  };
  const variants = {
    primary: { background: T.orange, color: "#fff", boxShadow: `0 4px 14px ${T.orange}44` },
    teal: { background: T.teal, color: "#fff", boxShadow: `0 4px 14px ${T.teal}44` },
    ghost: { background: "transparent", color: T.brownM, border: "1.5px solid #E8DDD5" },
    gold: { background: T.gold, color: T.brown, boxShadow: `0 4px 14px ${T.gold}44` },
    red: { background: T.red, color: "#fff" },
  };
  return { ...base, ...sizes[sz], ...variants[v], ...sx };
}

function addLift(target, disabled) {
  if (!disabled) {
    target.style.transform = "translateY(-1px)";
  }
}

function resetLift(target) {
  target.style.transform = "translateY(0)";
}

export function Stars({ n = 5, size = 14 }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} width={size} height={size} viewBox="0 0 20 20" fill={s <= n ? T.gold : "#E2D9D0"}>
          <path d="M10 1l2.39 4.84 5.34.78-3.86 3.76.91 5.32L10 13.27l-4.78 2.51.91-5.32L2.27 6.62l5.34-.78z" />
        </svg>
      ))}
    </span>
  );
}

export function Av({ txt, color = T.orange, size = 40 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", flexShrink: 0 }}>
      {txt}
    </div>
  );
}

export function Pill({ children, color = T.orange, bg, sx = {} }) {
  return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, background: bg || `${color}22`, color, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", ...sx }}>{children}</span>;
}

export function PlanPill({ plan, planName }) {
  const c = plan === "paid" ? { color: T.gold, bg: `${T.gold}25`, icon: "⚡" } : { color: T.teal, bg: `${T.teal}18`, icon: "🌱" };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, background: c.bg, color: c.color, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", border: `1px solid ${c.color}33` }}>{c.icon} {planName}</span>;
}

export function Btn({ children, onClick, v = "primary", sz = "md", disabled = false, sx = {}, type = "button" }) {
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      style={getButtonStyles(v, sz, disabled, sx)}
      onMouseEnter={(e) => addLift(e.currentTarget, disabled)}
      onMouseLeave={(e) => resetLift(e.currentTarget)}
    >
      {children}
    </button>
  );
}

export function ButtonLink({ children, href, v = "primary", sz = "md", sx = {}, onClick }) {
  return (
    <Link
      href={href}
      style={getButtonStyles(v, sz, false, sx)}
      onClick={onClick}
      onMouseEnter={(e) => addLift(e.currentTarget, false)}
      onMouseLeave={(e) => resetLift(e.currentTarget)}
    >
      {children}
    </Link>
  );
}

/** Renders a feature string, turning "Proof Lab" into a link to /proof-lab */
export function FeatureText({ text }) {
  if (!text.includes("Proof Lab")) return <>{text}</>;
  const [before, after] = text.split("Proof Lab");
  return (
    <>{before}<Link href="/proof-lab" style={{ color: "inherit", textDecoration: "underline", fontWeight: 700 }}>Proof Lab</Link>{after}</>
  );
}

export function Card({ children, sx = {}, hover = true, dim = false }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => hover && setHovered(true)}
      onMouseLeave={() => hover && setHovered(false)}
      style={{ background: dim ? "#F7F2ED" : "#fff", borderRadius: 20, border: `1.5px solid ${hovered && !dim ? T.orangeP : "#F0E8E0"}`, boxShadow: hovered && !dim ? "0 8px 32px rgba(61,43,31,0.10)" : "0 2px 10px rgba(61,43,31,0.06)", transition: "all 0.22s", transform: hovered && !dim ? "translateY(-2px)" : "none", opacity: dim ? 0.75 : 1, ...sx }}
    >
      {children}
    </div>
  );
}
