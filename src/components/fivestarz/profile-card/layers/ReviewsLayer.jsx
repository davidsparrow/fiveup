"use client";

import { useRef, useState } from "react";

import { Pill, Stars } from "@/components/fivestarz/ui";

import { useSwipe } from "../useSwipe";

const FONT_SERIF = "'Fraunces',serif";
const FONT_SANS = "'DM Sans',sans-serif";

function fmtDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  } catch {
    return null;
  }
}

/**
 * One review per screen. Horizontal swipe inside this layer pages reviews
 * (tabs change only via the strip while you're here). The quote is clamped;
 * "Read more" turns the quote box into the only scrollable region.
 */
export default function ReviewsLayer({ items, resolved, reducedMotion }) {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef(null);
  const { textColor, mutedTextColor, onDark } = resolved;
  const total = items.length;
  const item = items[Math.min(index, total - 1)];

  const go = (dir) => {
    setExpanded(false);
    setIndex((i) => (dir === "left" ? Math.min(total - 1, i + 1) : Math.max(0, i - 1)));
  };
  const swipe = useSwipe((dir) => go(dir), { enabled: total > 1 });
  // The parent keys this layer on items.length, so a changed list remounts
  // it at index 0 rather than needing an effect here.

  function onKeyDown(e) {
    if (e.key === "ArrowRight") { e.preventDefault(); go("left"); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go("right"); }
  }

  if (!item) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, color: mutedTextColor, fontFamily: FONT_SANS, fontSize: 15 }}>
        No approved reviews yet.
      </div>
    );
  }

  const isClip = item.kind === "clip";
  const cardBg = onDark ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.78)";
  const border = onDark ? "rgba(255,255,255,0.16)" : "rgba(61,43,31,0.08)";
  const btn = {
    width: 44,
    height: 44,
    borderRadius: 22,
    border: `1px solid ${border}`,
    background: cardBg,
    color: textColor,
    fontSize: 20,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div
      ref={panelRef}
      {...swipe}
      onKeyDown={onKeyDown}
      style={{ height: "100%", display: "grid", gridTemplateRows: "1fr auto", padding: "16px 18px 10px", color: textColor, touchAction: "pan-y", minHeight: 0 }}
    >
      <article
        key={index}
        className={reducedMotion ? undefined : "ps-review"}
        style={{
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 14,
          padding: "20px 20px 18px",
          borderRadius: 22,
          background: cardBg,
          border: `1px solid ${border}`,
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: 700, color: mutedTextColor, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.product_name || "Reviewed product"}
          </span>
          {item.stars ? <Stars n={item.stars} size={22} /> : null}
        </div>

        {isClip ? (
          <a
            href={item.media_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            style={{ display: "flex", alignItems: "center", gap: 12, color: textColor, textDecoration: "none", fontFamily: FONT_SANS, fontWeight: 700, fontSize: 17 }}
          >
            <span style={{ fontSize: 30 }}>▶️</span>
            <span>
              Watch clip
              {item.body ? <span style={{ display: "block", fontWeight: 400, fontSize: 14, color: mutedTextColor, marginTop: 2 }}>{item.body}</span> : null}
            </span>
          </a>
        ) : (
          <blockquote
            data-no-swipe={expanded ? "" : undefined}
            style={{
              margin: 0,
              fontFamily: FONT_SERIF,
              fontStyle: "italic",
              fontSize: "clamp(18px, 4.8vw, 22px)",
              lineHeight: 1.45,
              letterSpacing: "-0.01em",
              minHeight: 0,
              ...(expanded
                ? { overflowY: "auto", overscrollBehavior: "contain", maxHeight: "42vh", paddingRight: 4 }
                : { display: "-webkit-box", WebkitLineClamp: 7, WebkitBoxOrient: "vertical", overflow: "hidden" }),
            }}
          >
            “{item.body}”
          </blockquote>
        )}

        {!isClip && item.body && item.body.length > 240 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: textColor, fontFamily: FONT_SANS, fontWeight: 700, fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Pill color={onDark ? "#FDD07A" : "#1A9E8F"} bg={onDark ? "rgba(253,208,122,0.18)" : "rgba(26,158,143,0.12)"}>
            {item.source === "engaged_review" ? "Engaged review" : "Member feedback"}
          </Pill>
          {fmtDate(item.created_at) ? (
            <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: mutedTextColor }}>{fmtDate(item.created_at)}</span>
          ) : null}
        </div>
      </article>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12 }}>
        <button type="button" aria-label="Previous review" onClick={() => go("right")} disabled={index === 0} style={{ ...btn, opacity: index === 0 ? 0.35 : 1 }}>
          ‹
        </button>
        {total <= 7 ? (
          <div style={{ display: "flex", gap: 6 }} aria-hidden="true">
            {items.map((_, i) => (
              <span key={i} style={{ width: i === index ? 18 : 7, height: 7, borderRadius: 4, background: textColor, opacity: i === index ? 0.95 : 0.35, transition: reducedMotion ? "none" : "width 0.2s" }} />
            ))}
          </div>
        ) : null}
        <span aria-live="polite" style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, color: mutedTextColor, position: total <= 7 ? "absolute" : "static", ...(total <= 7 ? { width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" } : {}) }}>
          {index + 1} / {total}
        </span>
        <button type="button" aria-label="Next review" onClick={() => go("left")} disabled={index === total - 1} style={{ ...btn, opacity: index === total - 1 ? 0.35 : 1 }}>
          ›
        </button>
      </div>
    </div>
  );
}
