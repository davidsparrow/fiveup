const STAR_PATH = "M10 1l2.39 4.84 5.34.78-3.86 3.76.91 5.32L10 13.27l-4.78 2.51.91-5.32L2.27 6.62l5.34-.78z";

const GOLD = "#F4A832";

/**
 * Fractional star row for an average: 4.3 fills four stars and 30% of the
 * fifth. `ui.jsx`'s integer `Stars` stays the control for a single review.
 * Pure, no hooks. Gradient ids are derived from the value, so two rows with
 * the same rating share identical (and therefore interchangeable) gradients
 * rather than needing `useId`, which hydrates unevenly inside this layout.
 */
export default function StarRating({ value, size = 18, count, label, color = GOLD, emptyColor, textColor = "inherit", mutedColor, gap = 3, showNumber = true }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  const empty = emptyColor ?? "rgba(128,128,128,0.3)";
  const uid = `ps-sr-${Math.round(v * 100)}-${String(color).replace(/[^a-z0-9]/gi, "")}-${String(empty).replace(/[^a-z0-9]/gi, "")}`;

  return (
    <span
      role="img"
      aria-label={`${v.toFixed(1)} out of 5${count != null ? ` from ${count} ${count === 1 ? "review" : "reviews"}` : ""}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, color: textColor }}
    >
      <span style={{ display: "inline-flex", gap }}>
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = Math.max(0, Math.min(1, v - (i - 1)));
          const gid = `${uid}-s${i}`;
          return (
            <svg key={i} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
              <defs>
                <linearGradient id={gid} x1="0" x2="1" y1="0" y2="0">
                  <stop offset={`${fill * 100}%`} stopColor={color} />
                  <stop offset={`${fill * 100}%`} stopColor={empty} />
                </linearGradient>
              </defs>
              <path d={STAR_PATH} fill={`url(#${gid})`} />
            </svg>
          );
        })}
      </span>
      {showNumber ? (
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: Math.round(size * 0.9), lineHeight: 1 }}>
          {v.toFixed(1)}
          {count != null ? (
            <span style={{ fontWeight: 500, color: mutedColor ?? "inherit", opacity: mutedColor ? 1 : 0.75 }}>
              {" · "}
              {count} {count === 1 ? "review" : "reviews"}
            </span>
          ) : null}
          {label ? (
            <span style={{ fontWeight: 500, color: mutedColor ?? "inherit", opacity: mutedColor ? 1 : 0.75 }}>
              {" "}
              {label}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
