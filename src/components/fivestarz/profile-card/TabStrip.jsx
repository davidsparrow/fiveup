"use client";

import Link from "next/link";
import { useRef } from "react";

const FONT_SANS = "'DM Sans',sans-serif";
const FONT_SERIF = "'Fraunces',serif";

/**
 * The slim strip along the bottom of the card. A real tablist: roving focus,
 * arrow keys, aria wiring to the layer panels. Tabs with no content are
 * simply not passed in. 44px targets, safe-area padding for phones with a
 * home indicator.
 */
export default function TabStrip({ tabs, active, onChange, onDark, embedded = false }) {
  const refs = useRef({});

  function onKeyDown(e) {
    const idx = tabs.findIndex((t) => t.id === active);
    let next = null;
    if (e.key === "ArrowRight") next = tabs[(idx + 1) % tabs.length];
    else if (e.key === "ArrowLeft") next = tabs[(idx - 1 + tabs.length) % tabs.length];
    else if (e.key === "Home") next = tabs[0];
    else if (e.key === "End") next = tabs[tabs.length - 1];
    if (!next) return;
    e.preventDefault();
    onChange(next.id);
    refs.current[next.id]?.focus();
  }

  const fg = onDark ? "#fff" : "#3D2B1F";
  const bar = onDark ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.72)";
  const activeBg = onDark ? "rgba(255,255,255,0.18)" : "rgba(61,43,31,0.1)";

  return (
    <div
      className="ps-strip"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 10px",
        paddingBottom: embedded ? 8 : "max(8px, env(safe-area-inset-bottom))",
        background: bar,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderTop: `1px solid ${onDark ? "rgba(255,255,255,0.12)" : "rgba(61,43,31,0.08)"}`,
      }}
    >
      <Link
        href="/"
        aria-label="ProofSignals home"
        style={{
          fontFamily: FONT_SERIF,
          fontWeight: 800,
          fontSize: 15,
          color: fg,
          textDecoration: "none",
          padding: "0 8px 0 4px",
          letterSpacing: "-0.02em",
          flexShrink: 0,
        }}
      >
        P<span style={{ color: "#FF6B35" }}>S</span>
      </Link>

      <div role="tablist" aria-label="Profile sections" onKeyDown={onKeyDown} style={{ display: "flex", flex: 1, gap: 4 }}>
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => { refs.current[t.id] = el; }}
              type="button"
              role="tab"
              id={`ps-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`ps-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(t.id)}
              style={{
                flex: 1,
                minHeight: 44,
                border: "none",
                borderRadius: 12,
                background: isActive ? activeBg : "transparent",
                color: fg,
                fontFamily: FONT_SANS,
                fontWeight: isActive ? 800 : 600,
                fontSize: 13,
                letterSpacing: "0.01em",
                cursor: "pointer",
                transition: "background 0.18s",
                opacity: isActive ? 1 : 0.82,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
