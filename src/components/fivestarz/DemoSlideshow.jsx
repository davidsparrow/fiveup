"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { T } from "@/lib/fivestarz/theme";
import { useIsMobile } from "@/hooks/useIsMobile";

/**
 * In-theme screenshot slideshow for the /demo tour. Each slide is
 * { src, alt, title, caption, notes?: string[] } — a real app screenshot with
 * a text overlay explaining what the visitor is looking at.
 *
 * Navigation: arrow buttons, dots, ←/→ keys (when focused), touch swipe.
 * autoPlayMs > 0 auto-advances and pauses on hover/focus/interaction.
 */
export default function DemoSlideshow({ slides, autoPlayMs = 0, label = "" }) {
  const isMobile = useIsMobile();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef(null);
  const count = slides.length;

  const go = useCallback(
    (delta) => setIndex((i) => (i + delta + count) % count),
    [count]
  );

  useEffect(() => {
    if (!autoPlayMs || paused || count < 2) return undefined;
    const t = setInterval(() => go(1), autoPlayMs);
    return () => clearInterval(t);
  }, [autoPlayMs, paused, count, go]);

  if (!count) return null;
  const slide = slides[index];

  const arrow = (dir) => (
    <button
      type="button"
      aria-label={dir > 0 ? "Next slide" : "Previous slide"}
      onClick={() => { setPaused(true); go(dir); }}
      style={{
        width: 38, height: 38, borderRadius: "50%", border: "none", cursor: "pointer",
        background: T.orange, color: "#fff", fontSize: 16, fontWeight: 800,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}
    >
      {dir > 0 ? "→" : "←"}
    </button>
  );

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={label || "Screenshot slideshow"}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { setPaused(true); go(1); }
        if (e.key === "ArrowLeft") { setPaused(true); go(-1); }
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => autoPlayMs && setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 40) { setPaused(true); go(dx < 0 ? 1 : -1); }
      }}
      style={{ outline: "none" }}
    >
      <div style={{ display: isMobile ? "block" : "grid", gridTemplateColumns: isMobile ? undefined : "1.7fr 1fr", gap: 24, alignItems: "start" }}>
        {/* Screenshot in a browser-chrome frame */}
        <div style={{ background: "#fff", border: "1.5px solid #F0E8E0", borderRadius: 16, overflow: "hidden", boxShadow: "0 6px 24px rgba(61,43,31,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: T.cream, borderBottom: "1.5px solid #F0E8E0" }}>
            {[T.red, T.gold, T.green].map((c) => (
              <span key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.7 }} />
            ))}
            {label ? (
              <span style={{ marginLeft: 10, fontSize: 11, color: T.brownL, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>{label}</span>
            ) : null}
          </div>
          <div style={{ position: "relative", aspectRatio: "16 / 10", background: T.warm }}>
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              sizes={isMobile ? "100vw" : "62vw"}
              style={{ objectFit: "cover", objectPosition: "top center" }}
              priority={index === 0}
            />
          </div>
        </div>

        {/* Overlay text */}
        <div style={{ padding: isMobile ? "16px 4px 0" : "4px 0 0" }}>
          <div aria-live="polite" style={{ fontSize: 11, fontWeight: 800, color: T.orangeL, letterSpacing: "0.08em", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", marginBottom: 8 }}>
            Slide {index + 1} / {count}
          </div>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: isMobile ? 17 : 19, fontWeight: 700, color: T.brown, marginBottom: 8 }}>{slide.title}</div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: T.slate, lineHeight: 1.6 }}>{slide.caption}</div>
          {slide.notes?.length ? (
            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
              {slide.notes.map((n) => (
                <li key={n} style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: T.brownM, lineHeight: 1.55, marginBottom: 6 }}>
                  <span style={{ color: T.green, fontWeight: 800, marginRight: 6 }}>✓</span>
                  {n}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
            {arrow(-1)}
            <div style={{ display: "flex", gap: 6 }}>
              {slides.map((s, i) => (
                <button
                  key={s.src}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  onClick={() => { setPaused(true); setIndex(i); }}
                  style={{
                    width: 9, height: 9, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0,
                    background: i === index ? T.orange : T.orangeP,
                  }}
                />
              ))}
            </div>
            {arrow(1)}
          </div>
        </div>
      </div>
    </div>
  );
}
